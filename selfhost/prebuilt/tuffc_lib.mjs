// compiled by selfhost tuffc
import { println, panic, readTextFile, writeTextFile, pathDirname, pathJoin, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "./rt/vec.mjs";
let __tuffc_current_file = "<input>";
let __tuffc_struct_defs = vec_new();
export function ParsedNumber(value, nextPos) {
return { value: value, nextPos: nextPos };
}
export function ParsedIdent(text, nextPos) {
return { text: text, nextPos: nextPos };
}
export function ParsedExpr(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedMain(body, expr, v1) {
return { body: body, expr: expr, v1: v1 };
}
export function ParsedBool(ok, nextPos) {
return { ok: ok, nextPos: nextPos };
}
export function ParsedStmt(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedParams(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedType(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedImports(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedFn(v0, v1, v2) {
return { v0: v0, v1: v1, v2: v2 };
}
export function ParsedModule(v0, v1) {
return { v0: v0, v1: v1 };
}
export function LineCol(line, col) {
return { line: line, col: col };
}
export function StructDef(name, fields) {
return { name: name, fields: fields };
}
export function set_current_file(path) {
__tuffc_current_file = path;
return undefined;
}
export function spaces(n) {
let s = "";
let i = 0;
while ((i < n)) {
s = (s + " ");
i = (i + 1);
}
return s;
}
export function line_col_at(src, i) {
let line = 1;
let col = 1;
let p = 0;
let limit = i;
if ((limit > stringLen(src))) {
limit = stringLen(src);
}
while ((p < limit)) {
const ch = stringCharCodeAt(src, p);
if ((ch == 10)) {
line = (line + 1);
col = 1;
} else {
col = (col + 1);
}
p = (p + 1);
}
return LineCol(line, col);
}
export function panic_at(src, i, msg) {
const lc = line_col_at(src, i);
let pos = i;
if ((pos > stringLen(src))) {
pos = stringLen(src);
}
let ls = pos;
while ((ls > 0)) {
if ((stringCharCodeAt(src, (ls - 1)) == 10)) {
break;
}
ls = (ls - 1);
}
let le = pos;
while ((le < stringLen(src))) {
if ((stringCharCodeAt(src, le) == 10)) {
break;
}
le = (le + 1);
}
const lineText = stringSlice(src, ls, le);
const header = ((((((__tuffc_current_file + ":") + (("" + lc.line))) + ":") + (("" + lc.col))) + " error: ") + msg);
const frame1 = ("  | " + lineText);
const frame2 = (("  | " + spaces((lc.col - 1))) + "^");
panic(((((header + "\n") + frame1) + "\n") + frame2));
return undefined;
}
export function reset_struct_defs() {
__tuffc_struct_defs = vec_new();
return undefined;
}
export function add_struct_def(name, fields) {
let si = 0;
while ((si < vec_len(__tuffc_struct_defs))) {
const d = vec_get(__tuffc_struct_defs, si);
if ((d.name == name)) {
panic(("duplicate struct: " + name));
}
si = (si + 1);
}
vec_push(__tuffc_struct_defs, StructDef(name, fields));
return undefined;
}
export function find_struct_fields(name) {
let si = 0;
while ((si < vec_len(__tuffc_struct_defs))) {
const d = vec_get(__tuffc_struct_defs, si);
if ((d.name == name)) {
return d.fields;
}
si = (si + 1);
}
return panic(("unknown struct: " + name));
}
export function is_identifier_too_short(text) {
return (stringLen(text) <= 2);
}
export function warn_short_identifier(name) {
println((("warning: identifier '" + name) + "' is too short (2 chars or less); consider a more descriptive name"));
return undefined;
}
export function is_digit(code) {
return ((code >= 48) && (code <= 57));
}
export function is_space(code) {
return ((((code == 32) || (code == 10)) || (code == 9)) || (code == 13));
}
export function is_alpha(code) {
return ((((code >= 65) && (code <= 90))) || (((code >= 97) && (code <= 122))));
}
export function is_ident_start(code) {
return (is_alpha(code) || (code == 95));
}
export function is_ident_part(code) {
return (is_ident_start(code) || is_digit(code));
}
export function skip_ws(src, i) {
let j = i;
while ((j < stringLen(src))) {
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_space(c))) {
break;
}
j = (j + 1);
}
if ((!(((j + 1) < stringLen(src))))) {
return j;
}
const c0 = stringCharCodeAt(src, j);
const c1 = stringCharCodeAt(src, (j + 1));
if (((c0 == 47) && (c1 == 47))) {
j = (j + 2);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((c == 10)) {
break;
}
j = (j + 1);
}
continue;
}
if (((c0 == 47) && (c1 == 42))) {
const commentStart = j;
j = (j + 2);
let found = false;
while (((j + 1) < stringLen(src))) {
const a = stringCharCodeAt(src, j);
const b = stringCharCodeAt(src, (j + 1));
if (((a == 42) && (b == 47))) {
j = (j + 2);
found = true;
break;
}
j = (j + 1);
}
if ((!found)) {
panic_at(src, commentStart, "unterminated block comment");
}
continue;
}
break;
}
return j;
}
export function starts_with_at(src, i, lit) {
let j = 0;
while ((j < stringLen(lit))) {
if (((i + j) >= stringLen(src))) {
return false;
}
if ((stringCharCodeAt(src, (i + j)) != stringCharCodeAt(lit, j))) {
return false;
}
j = (j + 1);
}
return true;
}
export function parse_keyword(src, i, lit) {
const j = skip_ws(src, i);
if ((!starts_with_at(src, j, lit))) {
let end = (j + 16);
if ((end > stringLen(src))) {
end = stringLen(src);
}
panic_at(src, j, (((("expected keyword: " + lit) + " but got '") + stringSlice(src, j, end)) + "'"));
}
return (j + stringLen(lit));
}
export function parse_number(src, i) {
let j = skip_ws(src, i);
let acc = 0;
let saw = false;
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_digit(c))) {
break;
}
saw = true;
acc = ((acc * 10) + ((c - 48)));
j = (j + 1);
}
if ((!saw)) {
panic_at(src, j, "expected number");
}
return ParsedNumber(acc, j);
}
export function parse_ident(src, i) {
let j = skip_ws(src, i);
if ((!((j < stringLen(src))))) {
panic_at(src, j, "expected identifier");
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
panic_at(src, j, "expected identifier");
}
const start = j;
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
return ParsedIdent(stringSlice(src, start, j), j);
}
export function parse_module_path(src, i) {
let j = skip_ws(src, i);
const start = j;
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((is_space(c) || (c == 59))) {
break;
}
j = (j + 1);
}
if ((start == j)) {
panic_at(src, j, "expected module path");
}
return ParsedIdent(stringSlice(src, start, j), j);
}
export function module_path_to_relpath(p) {
let out = "";
let i = 0;
while ((i < stringLen(p))) {
if (((((i + 1) < stringLen(p)) && (stringCharCodeAt(p, i) == 58)) && (stringCharCodeAt(p, (i + 1)) == 58))) {
out = (out + "/");
i = (i + 2);
continue;
}
out = (out + stringFromCharCode(stringCharCodeAt(p, i)));
i = (i + 1);
}
return out;
}
export function parse_expr(src, i) {
return parse_or(src, i);
}
export function parse_or(src, i) {
let left = parse_and(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!(((j + 1) < stringLen(src))))) {
break;
}
if (((stringCharCodeAt(src, j) == 124) && (stringCharCodeAt(src, (j + 1)) == 124))) {
const rhs = parse_and(src, (j + 2));
left = ParsedExpr((((("(" + left.v0) + " || ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
continue;
}
break;
}
return left;
}
export function parse_and(src, i) {
let left = parse_cmp(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!(((j + 1) < stringLen(src))))) {
break;
}
if (((stringCharCodeAt(src, j) == 38) && (stringCharCodeAt(src, (j + 1)) == 38))) {
const rhs = parse_cmp(src, (j + 2));
left = ParsedExpr((((("(" + left.v0) + " && ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
continue;
}
break;
}
return left;
}
export function parse_cmp(src, i) {
let left = parse_add(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!((j < stringLen(src))))) {
break;
}
const c0 = stringCharCodeAt(src, j);
const c1 = (((j + 1) < stringLen(src)) ? stringCharCodeAt(src, (j + 1)) : 0);
let op = "";
let adv = 0;
if (((c0 == 61) && (c1 == 61))) {
op = "==";
adv = 2;
}
if ((((op == "") && (c0 == 33)) && (c1 == 61))) {
op = "!=";
adv = 2;
}
if ((((op == "") && (c0 == 60)) && (c1 == 61))) {
op = "<=";
adv = 2;
}
if ((((op == "") && (c0 == 62)) && (c1 == 61))) {
op = ">=";
adv = 2;
}
if (((op == "") && (c0 == 60))) {
op = "<";
adv = 1;
}
if (((op == "") && (c0 == 62))) {
op = ">";
adv = 1;
}
if ((op == "")) {
break;
}
const rhs = parse_add(src, (j + adv));
left = ParsedExpr((((((("(" + left.v0) + " ") + op) + " ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
}
return left;
}
export function parse_add(src, i) {
let left = parse_mul(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!((j < stringLen(src))))) {
break;
}
const op = stringCharCodeAt(src, j);
if ((!(((op == 43) || (op == 45))))) {
break;
}
const rhs = parse_mul(src, (j + 1));
const opStr = ((op == 43) ? "+" : "-");
left = ParsedExpr((((((("(" + left.v0) + " ") + opStr) + " ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
}
return left;
}
export function parse_mul(src, i) {
let left = parse_unary(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!((j < stringLen(src))))) {
break;
}
const op = stringCharCodeAt(src, j);
if ((!(((op == 42) || (op == 47))))) {
break;
}
const rhs = parse_unary(src, (j + 1));
const opStr = ((op == 42) ? "*" : "/");
left = ParsedExpr((((((("(" + left.v0) + " ") + opStr) + " ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
}
return left;
}
export function parse_unary(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 33))) {
const inner = parse_unary(src, (j + 1));
return ParsedExpr((("(!" + inner.v0) + ")"), inner.v1);
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 45))) {
const inner = parse_unary(src, (j + 1));
return ParsedExpr((("(-" + inner.v0) + ")"), inner.v1);
}
return parse_postfix(src, i);
}
export function parse_postfix(src, i) {
let left = parse_primary(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 60))) {
const skipped = try_skip_type_args_for_call(src, j);
if (skipped.ok) {
j = skipped.nextPos;
continue;
}
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 40))) {
const args = parse_arg_list(src, j);
left = ParsedExpr((((left.v0 + "(") + args.v0) + ")"), args.v1);
j = left.v1;
continue;
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46))) {
const t = skip_ws(src, (j + 1));
if (((t < stringLen(src)) && is_digit(stringCharCodeAt(src, t)))) {
const n = parse_number(src, t);
left = ParsedExpr((((left.v0 + "[") + (("" + n.value))) + "]"), n.nextPos);
j = left.v1;
continue;
}
const next = parse_ident(src, (j + 1));
left = ParsedExpr(((left.v0 + ".") + next.text), next.nextPos);
j = left.v1;
continue;
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 91))) {
let k = parse_keyword(src, j, "[");
const idx = parse_expr(src, k);
k = idx.v1;
k = skip_ws(src, k);
if ((!(((k < stringLen(src)) && (stringCharCodeAt(src, k) == 93))))) {
panic("expected ']' ");
}
left = ParsedExpr((((("vec_get(" + left.v0) + ", ") + idx.v0) + ")"), (k + 1));
j = left.v1;
continue;
}
break;
}
return left;
}
export function try_skip_type_args_for_call(src, i) {
let k = skip_ws(src, i);
if ((!(((k < stringLen(src)) && (stringCharCodeAt(src, k) == 60))))) {
return ParsedBool(false, i);
}
let p = (k + 1);
let depth = 1;
while ((p < stringLen(src))) {
const ch = stringCharCodeAt(src, p);
if ((ch == 60)) {
depth = (depth + 1);
p = (p + 1);
continue;
}
if ((ch == 62)) {
depth = (depth - 1);
p = (p + 1);
if ((depth == 0)) {
const after = skip_ws(src, p);
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) == 40))) {
return ParsedBool(true, p);
}
return ParsedBool(false, i);
}
continue;
}
p = (p + 1);
}
return ParsedBool(false, i);
}
export function parse_arg_list(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedParams("", (k + 1));
}
let out = "";
let first = true;
while (true) {
const e = parse_expr(src, k);
k = e.v1;
if (first) {
out = (out + e.v0);
} else {
out = ((out + ", ") + e.v0);
}
first = false;
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected ')' in arg list");
}
const c = stringCharCodeAt(src, k);
if ((c == 44)) {
k = (k + 1);
continue;
}
if ((c == 41)) {
return ParsedParams(out, (k + 1));
}
panic_at(src, k, "expected ',' or ')' in arg list");
}
return ParsedParams(out, k);
}
export function skip_angle_brackets(src, i) {
let k = skip_ws(src, i);
if ((!(((k < stringLen(src)) && (stringCharCodeAt(src, k) == 60))))) {
panic_at(src, k, "expected '<'");
}
k = (k + 1);
let depth = 1;
while ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if ((ch == 60)) {
depth = (depth + 1);
k = (k + 1);
continue;
}
if ((ch == 62)) {
depth = (depth - 1);
k = (k + 1);
if ((depth == 0)) {
return k;
}
continue;
}
k = (k + 1);
}
return panic_at(src, k, "unterminated '<...>'");
}
export function parse_struct_lit(src, structName, i) {
const fields = find_struct_fields(structName);
let k = skip_ws(src, i);
k = parse_keyword(src, k, "{");
let out = "({ ";
let idx = 0;
while (true) {
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected '}' in struct literal");
}
if ((stringCharCodeAt(src, k) == 125)) {
if ((!((idx == vec_len(fields))))) {
panic_at(src, k, ("wrong number of values in struct literal for " + structName));
}
return ParsedExpr((out + " })"), (k + 1));
}
if ((!((idx < vec_len(fields))))) {
panic_at(src, k, ("too many values in struct literal for " + structName));
}
const e = parse_expr(src, k);
k = e.v1;
const fieldName = vec_get(fields, idx);
if ((idx == 0)) {
out = (out + (((fieldName + ": ") + e.v0)));
} else {
out = (out + ((((", " + fieldName) + ": ") + e.v0)));
}
idx = (idx + 1);
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected ',' or '}' in struct literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 125)) {
continue;
}
panic_at(src, k, "expected ',' or '}' in struct literal");
}
return ParsedExpr((out + " })"), k);
}
export function parse_primary(src, i) {
const j = skip_ws(src, i);
if ((!((j < stringLen(src))))) {
panic_at(src, j, "expected expression");
}
const c = stringCharCodeAt(src, j);
if (starts_with_at(src, j, "if")) {
const ie = parse_if_expr(src, j);
return ie;
}
if (starts_with_at(src, j, "match")) {
const me = parse_match_expr(src, j);
return me;
}
if ((c == 91)) {
const ve = parse_vec_lit(src, j);
return ve;
}
if ((c == 123)) {
const be = parse_block_expr(src, j);
return be;
}
if ((c == 39)) {
const start = j;
let k = (j + 1);
if ((!((k < stringLen(src))))) {
panic_at(src, start, "unterminated char literal");
}
let code = 0;
const ch0 = stringCharCodeAt(src, k);
if ((ch0 == 92)) {
k = (k + 1);
if ((!((k < stringLen(src))))) {
panic_at(src, start, "unterminated char escape");
}
const esc = stringCharCodeAt(src, k);
code = (() => { switch (esc) {
case 110: return 10;
case 114: return 13;
case 116: return 9;
case 48: return 0;
case 92: return 92;
case 39: return 39;
case 34: return 34;
default: return (() => {
panic_at(src, k, "unknown char escape");
return 0;
})();
} })();
k = (k + 1);
} else {
code = ch0;
k = (k + 1);
}
if ((!((k < stringLen(src))))) {
panic_at(src, start, "unterminated char literal");
}
if ((stringCharCodeAt(src, k) != 39)) {
panic_at(src, start, "char literal must contain exactly one character");
}
return ParsedExpr(("" + code), (k + 1));
}
if ((c == 34)) {
const start = j;
let k = (j + 1);
while ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if ((ch == 34)) {
return ParsedExpr(stringSlice(src, start, (k + 1)), (k + 1));
}
if ((ch == 92)) {
k = (k + 1);
if ((k < stringLen(src))) {
k = (k + 1);
continue;
}
panic_at(src, start, "unterminated string");
}
k = (k + 1);
}
panic_at(src, start, "unterminated string");
}
if ((c == 40)) {
const first = parse_expr(src, (j + 1));
let k = skip_ws(src, first.v1);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExpr((("(" + first.v0) + ")"), (k + 1));
}
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 44))) {
let out = ("[" + first.v0);
while (true) {
k = (k + 1);
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExpr((out + "]"), (k + 1));
}
const e = parse_expr(src, k);
out = ((out + ", ") + e.v0);
k = skip_ws(src, e.v1);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected ')' in tuple literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
continue;
}
if ((ch == 41)) {
return ParsedExpr((out + "]"), (k + 1));
}
panic_at(src, k, "expected ',' or ')' in tuple literal");
}
}
panic_at(src, k, "expected ')'");
}
if (is_digit(c)) {
const n = parse_number(src, j);
return ParsedExpr(("" + n.value), n.nextPos);
}
if (is_ident_start(c)) {
const id = parse_ident(src, j);
let k = id.nextPos;
let out = id.text;
while (true) {
const t = skip_ws(src, k);
if ((!(((t + 1) < stringLen(src))))) {
break;
}
if ((!(((stringCharCodeAt(src, t) == 58) && (stringCharCodeAt(src, (t + 1)) == 58))))) {
break;
}
const next = parse_ident(src, (t + 2));
out = ((out + ".") + next.text);
k = next.nextPos;
}
const t2 = skip_ws(src, k);
if (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 123))) {
const lit = parse_struct_lit(src, out, t2);
return lit;
}
return ParsedExpr(out, k);
}
let end = (j + 32);
if ((end > stringLen(src))) {
end = stringLen(src);
}
return panic_at(src, j, (("expected expression near '" + stringSlice(src, j, end)) + "'"));
}
export function parse_vec_lit(src, i) {
let k = parse_keyword(src, i, "[");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 93))) {
return ParsedExpr("(() => { const __v = vec_new(); return __v; })()", (k + 1));
}
let pushes = "";
while (true) {
const e = parse_expr(src, k);
k = e.v1;
pushes = (pushes + ((("vec_push(__v, " + e.v0) + ");\n")));
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected ']' in vec literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 93)) {
return ParsedExpr((("(() => { const __v = vec_new();\n" + pushes) + "return __v;\n})()"), (k + 1));
}
panic_at(src, k, "expected ',' or ']' in vec literal");
}
return ParsedExpr("None", k);
}
export function parse_block_body(src, i) {
const j = skip_ws(src, i);
if ((!(((j < stringLen(src)) && (stringCharCodeAt(src, j) == 123))))) {
panic_at(src, j, "expected '{'");
}
let k = (j + 1);
let body = "";
while (true) {
const t = skip_ws(src, k);
if ((!((t < stringLen(src))))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
break;
}
const isStmt = ((((((starts_with_at(src, t, "let") || starts_with_at(src, t, "while")) || starts_with_at(src, t, "if")) || starts_with_at(src, t, "yield")) || is_field_assign_stmt_start(src, t)) || is_assign_stmt_start(src, t)) || is_index_assign_stmt_start(src, t));
if (isStmt) {
const st = parse_stmt(src, k);
body = (body + st.v0);
k = st.v1;
continue;
}
const e = parse_expr(src, k);
const after = skip_ws(src, e.v1);
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) == 59))) {
body = (body + ((e.v0 + ";\n")));
k = (after + 1);
continue;
}
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) != 125))) {
body = (body + ((e.v0 + ";\n")));
k = e.v1;
continue;
}
break;
}
const t2 = skip_ws(src, k);
if (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 125))) {
return ParsedMain(body, "undefined", (t2 + 1));
}
const tail = parse_expr(src, k);
k = skip_ws(src, tail.v1);
if ((!(((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125))))) {
panic_at(src, k, "expected '}'");
}
return ParsedMain(body, tail.v0, (k + 1));
}
export function parse_block_expr(src, i) {
const b = parse_block_body(src, i);
return ParsedExpr((((("(() => {\n" + b.body) + "return ") + b.expr) + ";\n})()"), b.v1);
}
export function parse_if_expr(src, i) {
let k = parse_keyword(src, i, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const t1 = skip_ws(src, k);
const thenE = (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 123)) ? parse_block_expr(src, k) : parse_expr(src, k));
k = thenE.v1;
k = parse_keyword(src, k, "else");
const t2 = skip_ws(src, k);
const elseE = (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 123)) ? parse_block_expr(src, k) : parse_expr(src, k));
return ParsedExpr((((((("(" + cond.v0) + " ? ") + thenE.v0) + " : ") + elseE.v0) + ")"), elseE.v1);
}
export function parse_match_expr(src, i) {
let k = parse_keyword(src, i, "match");
k = parse_keyword(src, k, "(");
const scrut = parse_expr(src, k);
k = scrut.v1;
k = parse_keyword(src, k, ")");
k = parse_keyword(src, k, "{");
let cases = "";
let def = "";
while (true) {
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
let pat = "";
const c0 = stringCharCodeAt(src, k);
if ((c0 == 34)) {
const lit = parse_primary(src, k);
pat = lit.v0;
k = lit.v1;
} else {
if (is_digit(c0)) {
const n = parse_number(src, k);
pat = ("" + n.value);
k = n.nextPos;
} else {
const id = parse_ident(src, k);
pat = id.text;
k = id.nextPos;
}
}
k = parse_keyword(src, k, "=>");
const t = skip_ws(src, k);
const arm = (((t < stringLen(src)) && (stringCharCodeAt(src, t) == 123)) ? parse_block_expr(src, k) : parse_expr(src, k));
k = arm.v1;
if ((!((((((pat == "_") || (pat == "true")) || (pat == "false")) || is_digit(stringCharCodeAt(pat, 0))) || (((stringLen(pat) > 0) && (stringCharCodeAt(pat, 0) == 34))))))) {
panic_at(src, k, ("unsupported match pattern: " + pat));
}
if ((pat == "_")) {
def = arm.v0;
} else {
cases = (cases + ((((("case " + pat) + ": return ") + arm.v0) + ";\n")));
}
k = skip_ws(src, k);
if ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if (((ch == 44) || (ch == 59))) {
k = (k + 1);
}
}
}
if ((def == "")) {
panic_at(src, k, "match requires _ arm");
}
return ParsedExpr((((((("(() => { switch (" + scrut.v0) + ") {\n") + cases) + "default: return ") + def) + ";\n} })()"), k);
}
export function parse_fn_decl_named(src, i, jsName, exportThis) {
let k = parse_keyword(src, i, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
const params = parse_param_list(src, k);
k = params.v1;
const t1 = skip_ws(src, k);
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 58))) {
const _rt = parse_type_expr(src, (t1 + 1));
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body(src, k);
k = body.v1;
const exportKw = (exportThis ? "export " : "");
const js = (((((((((exportKw + "function ") + jsName) + "(") + params.v0) + ") {\n") + body.body) + "return ") + body.expr) + ";\n}\n");
return ParsedFn(js, k, name.text);
}
export function parse_module_decl(src, i, prefix, exportTop) {
let k = parse_keyword(src, i, "module");
const modName = parse_ident(src, k);
k = modName.nextPos;
k = parse_keyword(src, k, "{");
let decls = "";
let entries = "";
let first = true;
while (true) {
const t = skip_ws(src, k);
if ((!((t < stringLen(src))))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
k = (t + 1);
break;
}
if (starts_with_at(src, t, "fn")) {
const fnParsed = parse_fn_decl_named(src, k, ((((((prefix + "__") + modName.text) + "__") + "fn") + "__") + "tmp"), false);
const fn2 = parse_fn_decl_named(src, k, ((((prefix + "__") + modName.text) + "__") + fnParsed.v2), false);
decls = (decls + fn2.v0);
if (first) {
entries = (entries + (((fn2.v2 + ": ") + (((((prefix + "__") + modName.text) + "__") + fn2.v2)))));
} else {
entries = (entries + ((((", " + fn2.v2) + ": ") + (((((prefix + "__") + modName.text) + "__") + fn2.v2)))));
}
first = false;
k = fn2.v1;
continue;
}
if (starts_with_at(src, t, "module")) {
const inner = parse_module_decl(src, k, ((prefix + "__") + modName.text), false);
decls = (decls + inner.v0);
const innerName = parse_ident(src, parse_keyword(src, k, "module"));
const prop = innerName.text;
if (first) {
entries = (entries + (((prop + ": ") + prop)));
} else {
entries = (entries + ((((", " + prop) + ": ") + prop)));
}
first = false;
k = inner.v1;
continue;
}
panic_at(src, t, "expected fn or module inside module");
}
const obj = (("{ " + entries) + " }");
const header = (exportTop ? "export const " : "const ");
const code = (((((decls + header) + modName.text) + " = ") + obj) + ";\n");
return ParsedStmt(code, k);
}
export function parse_imports(src, i) {
let k = i;
let out = "";
while (true) {
const j = skip_ws(src, k);
if (starts_with_at(src, j, "import")) {
panic_at(src, j, "`import` is not supported. Use `from <module> use { ... };` instead.");
}
if ((!starts_with_at(src, j, "from"))) {
break;
}
k = parse_keyword(src, k, "from");
const mod = parse_module_path(src, k);
k = mod.nextPos;
k = parse_keyword(src, k, "use");
k = parse_keyword(src, k, "{");
let names = "";
let first = true;
while (true) {
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
const id = parse_ident(src, k);
k = id.nextPos;
if (first) {
names = (names + id.text);
} else {
names = ((names + ", ") + id.text);
}
first = false;
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 44))) {
k = (k + 1);
continue;
}
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125))) {
k = (k + 1);
break;
}
panic_at(src, k, "expected ',' or '}' in import list");
}
k = parse_optional_semicolon(src, k);
const importPath = (("./" + module_path_to_relpath(mod.text)) + ".mjs");
out = (out + ((((("import { " + names) + " } from \"") + importPath) + "\";\n")));
}
return ParsedImports(out, k);
}
export function parse_type_expr(src, i) {
let k = skip_ws(src, i);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected type");
}
const c = stringCharCodeAt(src, k);
if ((c == 42)) {
k = (k + 1);
k = parse_keyword(src, k, "[");
const inner = parse_type_expr(src, k);
k = inner.v1;
k = parse_keyword(src, k, "]");
return ParsedType((("*[" + inner.v0) + "]"), k);
}
if ((c == 91)) {
k = parse_keyword(src, k, "[");
const inner = parse_type_expr(src, k);
k = inner.v1;
let sizes = "";
while (true) {
const t = skip_ws(src, k);
if ((!(((t < stringLen(src)) && (stringCharCodeAt(src, t) == 59))))) {
break;
}
const n = parse_number(src, (t + 1));
sizes = ((sizes + ";") + (("" + n.value)));
k = n.nextPos;
}
k = parse_keyword(src, k, "]");
return ParsedType(((("[" + inner.v0) + sizes) + "]"), k);
}
if ((c == 40)) {
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
let parts = "";
let first = true;
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
k = (k + 1);
} else {
while (true) {
const t1 = parse_type_expr(src, k);
k = t1.v1;
if (first) {
parts = (parts + t1.v0);
} else {
parts = ((parts + ", ") + t1.v0);
}
first = false;
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected ')' in type");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 41)) {
k = (k + 1);
break;
}
panic_at(src, k, "expected ',' or ')' in type");
}
}
const t2 = skip_ws(src, k);
if (((((t2 + 1) < stringLen(src)) && (stringCharCodeAt(src, t2) == 61)) && (stringCharCodeAt(src, (t2 + 1)) == 62))) {
const ret = parse_type_expr(src, (t2 + 2));
return ParsedType(((("(" + parts) + ") => ") + ret.v0), ret.v1);
}
return ParsedType((("(" + parts) + ")"), k);
}
const name = parse_ident(src, k);
k = name.nextPos;
let out = name.text;
const t3 = skip_ws(src, k);
if (((t3 < stringLen(src)) && (stringCharCodeAt(src, t3) == 60))) {
k = parse_keyword(src, t3, "<");
let args = "";
let firstArg = true;
while (true) {
const a = parse_type_expr(src, k);
k = a.v1;
if (firstArg) {
args = (args + a.v0);
} else {
args = ((args + ", ") + a.v0);
}
firstArg = false;
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected '>' in generic type");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 62)) {
k = (k + 1);
break;
}
panic_at(src, k, "expected ',' or '>' in generic type");
}
out = (((out + "<") + args) + ">");
}
return ParsedType(out, k);
}
export function parse_param_list(src, i) {
let k = parse_keyword(src, i, "(");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedParams("", (k + 1));
}
let out = "";
let first = true;
while (true) {
const id = parse_ident(src, k);
k = id.nextPos;
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
k = _ty.v1;
}
if (first) {
out = (out + id.text);
} else {
out = ((out + ", ") + id.text);
}
first = false;
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected ')' in param list");
}
const c = stringCharCodeAt(src, k);
if ((c == 44)) {
k = (k + 1);
continue;
}
if ((c == 41)) {
return ParsedParams(out, (k + 1));
}
panic_at(src, k, "expected ',' or ')' in param list");
}
return ParsedParams(out, k);
}
export function parse_extern_decl(src, i) {
let k = parse_keyword(src, i, "extern");
k = parse_keyword(src, k, "from");
const mod = parse_module_path(src, k);
k = mod.nextPos;
k = parse_keyword(src, k, "use");
k = parse_keyword(src, k, "{");
let names = "";
let first = true;
while (true) {
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
const id = parse_ident(src, k);
k = id.nextPos;
if (first) {
names = (names + id.text);
} else {
names = ((names + ", ") + id.text);
}
first = false;
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 44))) {
k = (k + 1);
continue;
}
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125))) {
k = (k + 1);
break;
}
panic_at(src, k, "expected ',' or '}' in extern list");
}
k = parse_optional_semicolon(src, k);
let importPath = "";
if (starts_with_at(mod.text, 0, "rt::")) {
importPath = (("./rt/" + stringSlice(mod.text, 4, stringLen(mod.text))) + ".mjs");
}
if (((importPath == "") && starts_with_at(mod.text, 0, "node::"))) {
importPath = ("node:" + stringSlice(mod.text, 6, stringLen(mod.text)));
}
if ((importPath == "")) {
panic_at(src, k, ("unsupported extern module: " + mod.text));
}
return ParsedStmt((((("import { " + names) + " } from \"") + importPath) + "\";\n"), k);
}
export function parse_fn_decl2(src, i, exportAll) {
let k = parse_keyword(src, i, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
const params = parse_param_list(src, k);
k = params.v1;
const t1 = skip_ws(src, k);
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 58))) {
const _rt = parse_type_expr(src, (t1 + 1));
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body(src, k);
k = body.v1;
const exportKw = ((exportAll || (name.text == "main")) ? "export " : "");
const js = (((((((((exportKw + "function ") + name.text) + "(") + params.v0) + ") {\n") + body.body) + "return ") + body.expr) + ";\n}\n");
return ParsedStmt(js, k);
}
export function parse_class_fn_decl2(src, i, exportAll) {
let k = parse_keyword(src, i, "class");
k = parse_keyword(src, k, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
const params = parse_param_list(src, k);
k = params.v1;
const t1 = skip_ws(src, k);
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 58))) {
const _rt = parse_type_expr(src, (t1 + 1));
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body(src, k);
k = body.v1;
const exportKw = ((exportAll || (name.text == "main")) ? "export " : "");
let fields = "";
let pi = 0;
let first = true;
while ((pi < stringLen(params.v0))) {
while ((pi < stringLen(params.v0))) {
const ch = stringCharCodeAt(params.v0, pi);
if ((((((ch == 32) || (ch == 9)) || (ch == 10)) || (ch == 13)) || (ch == 44))) {
pi = (pi + 1);
continue;
}
break;
}
if ((!((pi < stringLen(params.v0))))) {
break;
}
const start = pi;
while ((pi < stringLen(params.v0))) {
const ch = stringCharCodeAt(params.v0, pi);
if ((ch == 44)) {
break;
}
pi = (pi + 1);
}
const p = stringSlice(params.v0, start, pi);
let end = stringLen(p);
while ((end > 0)) {
const ch = stringCharCodeAt(p, (end - 1));
if (((((ch == 32) || (ch == 9)) || (ch == 10)) || (ch == 13))) {
end = (end - 1);
continue;
}
break;
}
const nameOnly = stringSlice(p, 0, end);
if ((nameOnly != "")) {
if (first) {
fields = (fields + (((nameOnly + ": ") + nameOnly)));
} else {
fields = (fields + ((((", " + nameOnly) + ": ") + nameOnly)));
}
first = false;
}
}
const js = (((((((((exportKw + "function ") + name.text) + "(") + params.v0) + ") {\n") + body.body) + "return { ") + fields) + " };\n}\n");
return ParsedStmt(js, k);
}
export function parse_fn_decl(src, i) {
return parse_fn_decl2(src, i, false);
}
export function parse_optional_semicolon(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 59))) {
return (j + 1);
}
return i;
}
export function parse_required_semicolon(src, i) {
const j = skip_ws(src, i);
if ((!(((j < stringLen(src)) && (stringCharCodeAt(src, j) == 59))))) {
panic_at(src, j, "expected ';'");
}
return (j + 1);
}
export function skip_type_expr(src, i) {
let k = skip_ws(src, i);
let depth = 0;
while ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if ((ch == 60)) {
depth = (depth + 1);
k = (k + 1);
continue;
}
if ((ch == 62)) {
if ((depth > 0)) {
depth = (depth - 1);
}
k = (k + 1);
continue;
}
if (((depth == 0) && ((((ch == 44) || (ch == 59)) || (ch == 125))))) {
return k;
}
k = (k + 1);
}
return panic_at(src, k, "unterminated type");
}
export function parse_struct_decl(src, i) {
let k = parse_keyword(src, i, "struct");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
k = parse_keyword(src, k, "{");
const fields = vec_new();
while (true) {
k = skip_ws(src, k);
if ((!((k < stringLen(src))))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
const field = parse_ident(src, k);
k = field.nextPos;
k = parse_keyword(src, k, ":");
const _ty = parse_type_expr(src, k);
k = _ty.v1;
vec_push(fields, field.text);
k = skip_ws(src, k);
if ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if (((ch == 44) || (ch == 59))) {
k = (k + 1);
}
}
}
add_struct_def(name.text, fields);
return ParsedStmt("", k);
}
export function parse_type_union_decl(src, i, exportAll) {
let k = parse_keyword(src, i, "type");
const _name = parse_ident(src, k);
k = _name.nextPos;
if (is_identifier_too_short(_name.text)) {
warn_short_identifier(_name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
k = parse_keyword(src, k, "=");
let out = "";
let first = true;
while (true) {
if ((!first)) {
k = parse_keyword(src, k, "|");
}
first = false;
const v = parse_ident(src, k);
const variant = v.text;
k = v.nextPos;
let hasPayload = false;
const t1 = skip_ws(src, k);
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 60))) {
hasPayload = true;
k = skip_angle_brackets(src, t1);
}
const header = (exportAll ? "export const " : "const ");
if (hasPayload) {
out = (out + (((((header + variant) + " = (value) => ({ tag: \"") + variant) + "\", value });\n")));
} else {
out = (out + (((((header + variant) + " = { tag: \"") + variant) + "\" };\n")));
}
const t2 = skip_ws(src, k);
if ((!((t2 < stringLen(src))))) {
return ParsedStmt(out, k);
}
const ch = stringCharCodeAt(src, t2);
if ((ch == 59)) {
k = (t2 + 1);
break;
}
if ((ch == 124)) {
continue;
}
panic_at(src, t2, "expected '|' or ';' in union type");
}
return ParsedStmt(out, k);
}
export function parse_mut_opt(src, i) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "mut")) {
if (((j + 3) < stringLen(src))) {
const n = stringCharCodeAt(src, (j + 3));
if (is_ident_part(n)) {
return ParsedBool(false, i);
}
}
return ParsedBool(true, (j + 3));
}
return ParsedBool(false, i);
}
export function parse_stmt_block(src, i) {
let k = skip_ws(src, i);
if ((!(((k < stringLen(src)) && (stringCharCodeAt(src, k) == 123))))) {
panic_at(src, k, "expected '{'");
}
k = (k + 1);
let body = "";
while (true) {
const t = skip_ws(src, k);
if ((!((t < stringLen(src))))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
return ParsedExpr(body, (t + 1));
}
const st = parse_stmt(src, k);
body = (body + st.v0);
k = st.v1;
}
return ParsedExpr(body, k);
}
export function parse_stmt(src, i) {
let k = skip_ws(src, i);
if (starts_with_at(src, k, "yield")) {
k = parse_keyword(src, k, "yield");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 59))) {
return ParsedStmt("return;\n", (k + 1));
}
const e = parse_expr(src, k);
k = e.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((("return " + e.v0) + ";\n"), k);
}
if (starts_with_at(src, k, "let")) {
k = parse_keyword(src, k, "let");
const mutOpt = parse_mut_opt(src, k);
k = mutOpt.nextPos;
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
k = _ty.v1;
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
const declKw = (mutOpt.ok ? "let" : "const");
return ParsedStmt((((((declKw + " ") + name.text) + " = ") + expr.v0) + ";\n"), k);
}
if (starts_with_at(src, k, "while")) {
k = parse_keyword(src, k, "while");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const body = parse_stmt_block(src, k);
k = body.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((("while (" + cond.v0) + ") {\n") + body.v0) + "}\n"), k);
}
if (starts_with_at(src, k, "if")) {
k = parse_keyword(src, k, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const thenB = parse_stmt_block(src, k);
k = thenB.v1;
const j = skip_ws(src, k);
if (starts_with_at(src, j, "else")) {
k = parse_keyword(src, k, "else");
const elseB = parse_stmt_block(src, k);
k = elseB.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((((("if (" + cond.v0) + ") {\n") + thenB.v0) + "} else {\n") + elseB.v0) + "}\n"), k);
}
k = parse_optional_semicolon(src, k);
return ParsedStmt((((("if (" + cond.v0) + ") {\n") + thenB.v0) + "}\n"), k);
}
if (is_assign_stmt_start(src, k)) {
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(name.text);
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((name.text + " = ") + expr.v0) + ";\n"), k);
}
if (is_field_assign_stmt_start(src, k)) {
const base = parse_ident(src, k);
k = base.nextPos;
let lhs = base.text;
while (true) {
const t = skip_ws(src, k);
if ((!(((t < stringLen(src)) && (stringCharCodeAt(src, t) == 46))))) {
break;
}
k = parse_keyword(src, k, ".");
const part = parse_ident(src, k);
lhs = ((lhs + ".") + part.text);
k = part.nextPos;
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((lhs + " = ") + expr.v0) + ";\n"), k);
}
if (is_index_assign_stmt_start(src, k)) {
const name = parse_ident(src, k);
k = name.nextPos;
k = parse_keyword(src, k, "[");
const idx = parse_expr(src, k);
k = idx.v1;
k = parse_keyword(src, k, "]");
k = parse_keyword(src, k, "=");
const val = parse_expr(src, k);
k = val.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((((("vec_set(" + name.text) + ", ") + idx.v0) + ", ") + val.v0) + ");\n"), k);
}
const e = parse_expr(src, k);
k = e.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((e.v0 + ";\n"), k);
return panic_at(src, k, "expected statement");
}
export function is_index_assign_stmt_start(src, i) {
let j = skip_ws(src, i);
if ((!((j < stringLen(src))))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
return ((j < stringLen(src)) && (stringCharCodeAt(src, j) == 91));
}
export function is_assign_stmt_start(src, i) {
let j = skip_ws(src, i);
if ((!((j < stringLen(src))))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
if ((!(((j < stringLen(src)) && (stringCharCodeAt(src, j) == 61))))) {
return false;
}
if (((j + 1) < stringLen(src))) {
const n = stringCharCodeAt(src, (j + 1));
if (((n == 61) || (n == 62))) {
return false;
}
}
return true;
}
export function is_field_assign_stmt_start(src, i) {
let j = skip_ws(src, i);
if ((!((j < stringLen(src))))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
if ((!(((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46))))) {
return false;
}
while (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46))) {
j = (j + 1);
j = skip_ws(src, j);
if ((!((j < stringLen(src))))) {
return false;
}
const c1 = stringCharCodeAt(src, j);
if ((!is_ident_start(c1))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
}
if ((!(((j < stringLen(src)) && (stringCharCodeAt(src, j) == 61))))) {
return false;
}
if (((j + 1) < stringLen(src))) {
const n = stringCharCodeAt(src, (j + 1));
if (((n == 61) || (n == 62))) {
return false;
}
}
return true;
}
export function parse_main_body(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 123))) {
const b = parse_block_body(src, i);
return ParsedMain(b.body, b.expr, b.v1);
}
const e = parse_expr(src, i);
return ParsedMain("", e.v0, e.v1);
}
export function compile_tiny2(src, requireMain, exportAll) {
let i = 0;
reset_struct_defs();
let out = "// compiled by selfhost tuffc\n";
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "extern")) {
const ex = parse_extern_decl(src, i);
out = (out + ex.v0);
i = ex.v1;
continue;
}
break;
}
const imps = parse_imports(src, i);
out = (out + imps.v0);
i = imps.v1;
while (true) {
const j = skip_ws(src, i);
if ((!starts_with_at(src, j, "module"))) {
break;
}
const m = parse_module_decl(src, i, "M", true);
out = (out + m.v0);
i = m.v1;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "type")) {
const td = parse_type_union_decl(src, i, exportAll);
out = (out + td.v0);
i = td.v1;
continue;
}
if (starts_with_at(src, j, "struct")) {
const sd = parse_struct_decl(src, i);
out = (out + sd.v0);
i = sd.v1;
continue;
}
break;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "let")) {
i = parse_keyword(src, i, "let");
const mutOpt = parse_mut_opt(src, i);
i = mutOpt.nextPos;
const name = parse_ident(src, i);
i = name.nextPos;
const t0 = skip_ws(src, i);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
i = _ty.v1;
}
i = parse_keyword(src, i, "=");
const expr = parse_expr(src, i);
i = expr.v1;
i = parse_optional_semicolon(src, i);
const declKw = (mutOpt.ok ? "let" : "const");
out = (out + ((((((declKw + " ") + name.text) + " = ") + expr.v0) + ";\n")));
continue;
}
break;
}
let sawMain = false;
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "fn")) {
const f = parse_fn_decl2(src, i, exportAll);
if (starts_with_at(f.v0, 0, "export function main")) {
sawMain = true;
}
out = (out + f.v0);
i = f.v1;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl2(src, i, exportAll);
out = (out + f.v0);
i = f.v1;
continue;
}
break;
}
if ((requireMain && (!sawMain))) {
panic_at(src, i, "expected fn main");
}
return out;
}
export function compile_tiny(src) {
return compile_tiny2(src, true, false);
}
export function compile_module(src) {
return compile_tiny2(src, false, true);
}
export function compile_project(entryPath, outPath) {
const outDir = pathDirname(outPath);
let queue = vec_new();
vec_push(queue, entryPath);
let done = vec_new();
while ((vec_len(queue) > 0)) {
const path = vec_get(queue, (vec_len(queue) - 1));
set_current_file(path);
let newQ = vec_new();
let qi = 0;
while (((qi + 1) < vec_len(queue))) {
vec_push(newQ, vec_get(queue, qi));
qi = (qi + 1);
}
queue = newQ;
let already = false;
let di = 0;
while ((di < vec_len(done))) {
if ((vec_get(done, di) == path)) {
already = true;
break;
}
di = (di + 1);
}
if (already) {
continue;
}
vec_push(done, path);
const src = readTextFile(path);
let scan = 0;
while (true) {
const j = skip_ws(src, scan);
if (starts_with_at(src, j, "extern")) {
const ex = parse_extern_decl(src, scan);
scan = ex.v1;
continue;
}
break;
}
while (true) {
const j = skip_ws(src, scan);
if (starts_with_at(src, j, "import")) {
panic_at(src, j, "`import` is not supported. Use `from <module> use { ... };` instead.");
}
if ((!starts_with_at(src, j, "from"))) {
break;
}
scan = parse_keyword(src, scan, "from");
const mod = parse_module_path(src, scan);
scan = mod.nextPos;
scan = parse_keyword(src, scan, "use");
scan = parse_keyword(src, scan, "{");
while (true) {
scan = skip_ws(src, scan);
if ((!((scan < stringLen(src))))) {
panic_at(src, scan, "expected '}'");
}
if ((stringCharCodeAt(src, scan) == 125)) {
scan = (scan + 1);
break;
}
const id = parse_ident(src, scan);
scan = id.nextPos;
scan = skip_ws(src, scan);
if (((scan < stringLen(src)) && (stringCharCodeAt(src, scan) == 44))) {
scan = (scan + 1);
continue;
}
scan = skip_ws(src, scan);
if (((scan < stringLen(src)) && (stringCharCodeAt(src, scan) == 125))) {
scan = (scan + 1);
break;
}
panic_at(src, scan, "expected ',' or '}' in import list");
}
scan = parse_optional_semicolon(src, scan);
const baseDir = pathDirname(path);
const rel = module_path_to_relpath(mod.text);
const depPath = pathJoin(baseDir, (rel + ".tuff"));
vec_push(queue, depPath);
}
const js = ((path == entryPath) ? compile_tiny(src) : compile_module(src));
const outFile = ((path == entryPath) ? outPath : (() => {
const baseDir = pathDirname(entryPath);
let prefixLen = stringLen(baseDir);
let relStart = prefixLen;
if ((relStart < stringLen(path))) {
const ch = stringCharCodeAt(path, relStart);
if (((ch == 47) || (ch == 92))) {
relStart = (relStart + 1);
}
}
const relPath = stringSlice(path, relStart, stringLen(path));
const relNoExt = stringSlice(relPath, 0, (stringLen(relPath) - 5));
return pathJoin(outDir, (relNoExt + ".mjs"));
})());
writeTextFile(outFile, js);
}
return undefined;
}
