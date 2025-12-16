// compiled by selfhost tuffc
import { panic, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "../rt/stdlib.mjs";
import { vec_len, vec_get } from "../rt/vec.mjs";
import { panic_at, find_struct_fields } from "../util/diagnostics.mjs";
import { is_digit, is_ident_start, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_ident, parse_keyword, parse_number } from "./primitives.mjs";
import { ParsedExpr, ParsedMain } from "./expr_stmt_types.mjs";
import { parse_expr } from "./expr_stmt_legacy_expr.mjs";
import { parse_stmt } from "./expr_stmt_legacy_stmt.mjs";
import { is_assign_stmt_start_impl, is_field_assign_stmt_start_impl, is_index_assign_stmt_start_impl } from "./expr_stmt_stmt_starts.mjs";
export function parse_primary(src, i) {
const j = skip_ws(src, i);
if (!(j < stringLen(src))) {
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
if (c == 91) {
const ve = parse_vec_lit(src, j);
return ve;
}
if (c == 123) {
const be = parse_block_expr(src, j);
return be;
}
if (c == 39) {
const start = j;
let k = j + 1;
if (!(k < stringLen(src))) {
panic_at(src, start, "unterminated char literal");
}
let code = 0;
const ch0 = stringCharCodeAt(src, k);
if (ch0 == 92) {
k = k + 1;
if (!(k < stringLen(src))) {
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
k = k + 1;
} else {
code = ch0;
k = k + 1;
}
if (!(k < stringLen(src))) {
panic_at(src, start, "unterminated char literal");
}
if (stringCharCodeAt(src, k) != 39) {
panic_at(src, start, "char literal must contain exactly one character");
}
return ParsedExpr("" + code, k + 1);
}
if (c == 34) {
const start = j;
let k = j + 1;
while (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 34) {
return ParsedExpr(stringSlice(src, start, k + 1), k + 1);
}
if (ch == 92) {
k = k + 1;
if (k < stringLen(src)) {
k = k + 1;
continue;
}
panic_at(src, start, "unterminated string");
}
k = k + 1;
}
panic_at(src, start, "unterminated string");
}
if (c == 40) {
const first = parse_expr(src, j + 1);
let k = skip_ws(src, first.v1);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedExpr("(" + first.v0 + ")", k + 1);
}
if (k < stringLen(src) && stringCharCodeAt(src, k) == 44) {
let out = "[" + first.v0;
while (true) {
k = k + 1;
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedExpr(out + "]", k + 1);
}
const e = parse_expr(src, k);
out = out + ", " + e.v0;
k = skip_ws(src, e.v1);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in tuple literal");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
continue;
}
if (ch == 41) {
return ParsedExpr(out + "]", k + 1);
}
panic_at(src, k, "expected ',' or ')' in tuple literal");
}
}
panic_at(src, k, "expected ')'");
}
if (is_digit(c)) {
const n = parse_number(src, j);
return ParsedExpr("" + n.value, n.nextPos);
}
if (is_ident_start(c)) {
const id = parse_ident(src, j);
let k = id.nextPos;
let out = id.text;
while (true) {
const t = skip_ws(src, k);
if (!(t + 1 < stringLen(src))) {
break;
}
if (!(stringCharCodeAt(src, t) == 58 && stringCharCodeAt(src, t + 1) == 58)) {
break;
}
const next = parse_ident(src, t + 2);
out = out + "." + next.text;
k = next.nextPos;
}
const t2 = skip_ws(src, k);
if (t2 < stringLen(src) && stringCharCodeAt(src, t2) == 123) {
const lit = parse_struct_lit(src, out, t2);
return lit;
}
return ParsedExpr(out, k);
}
let end = j + 32;
if (end > stringLen(src)) {
end = stringLen(src);
}
return panic_at(src, j, "expected expression near '" + stringSlice(src, j, end) + "'");
}
export function parse_struct_lit(src, structName, i) {
const fields = find_struct_fields(structName);
let k = skip_ws(src, i);
k = parse_keyword(src, k, "{");
let out = "({ ";
let idx = 0;
while (true) {
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '}' in struct literal");
}
if (stringCharCodeAt(src, k) == 125) {
if (!(idx == vec_len(fields))) {
panic_at(src, k, "wrong number of values in struct literal for " + structName);
}
return ParsedExpr(out + " })", k + 1);
}
if (!(idx < vec_len(fields))) {
panic_at(src, k, "too many values in struct literal for " + structName);
}
const e = parse_expr(src, k);
k = e.v1;
const fieldName = vec_get(fields, idx);
if (idx == 0) {
out = out + (fieldName + ": " + e.v0);
} else {
out = out + (", " + fieldName + ": " + e.v0);
}
idx = idx + 1;
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ',' or '}' in struct literal");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
continue;
}
if (ch == 125) {
continue;
}
panic_at(src, k, "expected ',' or '}' in struct literal");
}
return ParsedExpr(out + " })", k);
}
export function parse_vec_lit(src, i) {
let k = parse_keyword(src, i, "[");
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 93) {
return ParsedExpr("(() => { const __v = vec_new(); return __v; })()", k + 1);
}
let pushes = "";
while (true) {
const e = parse_expr(src, k);
k = e.v1;
pushes = pushes + ("vec_push(__v, " + e.v0 + ");\n");
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ']' in vec literal");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
continue;
}
if (ch == 93) {
return ParsedExpr("(() => { const __v = vec_new();\n" + pushes + "return __v;\n})()", k + 1);
}
panic_at(src, k, "expected ',' or ']' in vec literal");
}
return ParsedExpr("None", k);
}
export function parse_block_body(src, i) {
const j = skip_ws(src, i);
if (!(j < stringLen(src) && stringCharCodeAt(src, j) == 123)) {
panic_at(src, j, "expected '{'");
}
let k = j + 1;
let body = "";
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src))) {
panic_at(src, t, "expected '}'");
}
if (stringCharCodeAt(src, t) == 125) {
break;
}
const isStmt = starts_with_at(src, t, "let") || starts_with_at(src, t, "fn") || starts_with_at(src, t, "while") || starts_with_at(src, t, "if") || starts_with_at(src, t, "yield") || is_field_assign_stmt_start_impl(src, t) || is_assign_stmt_start_impl(src, t) || is_index_assign_stmt_start_impl(src, t);
if (isStmt) {
const st = parse_stmt(src, k);
body = body + st.v0;
k = st.v1;
continue;
}
const e = parse_expr(src, k);
const after = skip_ws(src, e.v1);
if (after < stringLen(src) && stringCharCodeAt(src, after) == 59) {
body = body + (e.v0 + ";\n");
k = after + 1;
continue;
}
if (after < stringLen(src) && stringCharCodeAt(src, after) != 125) {
body = body + (e.v0 + ";\n");
k = e.v1;
continue;
}
break;
}
const t2 = skip_ws(src, k);
if (t2 < stringLen(src) && stringCharCodeAt(src, t2) == 125) {
return ParsedMain(body, "undefined", t2 + 1);
}
const tail = parse_expr(src, k);
k = skip_ws(src, tail.v1);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 125)) {
panic_at(src, k, "expected '}'");
}
return ParsedMain(body, tail.v0, k + 1);
}
export function parse_block_expr(src, i) {
const b = parse_block_body(src, i);
return ParsedExpr("(() => {\n" + b.body + "return " + b.expr + ";\n})()", b.v1);
}
export function parse_if_expr(src, i) {
let k = parse_keyword(src, i, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const t1 = skip_ws(src, k);
const thenE = (t1 < stringLen(src) && stringCharCodeAt(src, t1) == 123 ? parse_block_expr(src, k) : parse_expr(src, k));
k = thenE.v1;
k = parse_keyword(src, k, "else");
const t2 = skip_ws(src, k);
const elseE = (t2 < stringLen(src) && stringCharCodeAt(src, t2) == 123 ? parse_block_expr(src, k) : parse_expr(src, k));
return ParsedExpr("(" + cond.v0 + " ? " + thenE.v0 + " : " + elseE.v0 + ")", elseE.v1);
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
let sawVariant = false;
while (true) {
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '}'");
}
if (stringCharCodeAt(src, k) == 125) {
k = k + 1;
break;
}
let pat = "";
const c0 = stringCharCodeAt(src, k);
if (c0 == 34) {
const lit = parse_primary(src, k);
pat = lit.v0;
k = lit.v1;
} else {
if (is_digit(c0)) {
const n = parse_number(src, k);
pat = "" + n.value;
k = n.nextPos;
} else {
const id = parse_ident(src, k);
k = id.nextPos;
let name = id.text;
while (true) {
const t = skip_ws(src, k);
if (!(t + 1 < stringLen(src))) {
break;
}
if (!(stringCharCodeAt(src, t) == 58 && stringCharCodeAt(src, t + 1) == 58)) {
break;
}
const next = parse_ident(src, t + 2);
name = next.text;
k = next.nextPos;
}
if (id.text == "_" || id.text == "true" || id.text == "false") {
pat = id.text;
} else {
const q = stringFromCharCode(34);
pat = q + name + q;
sawVariant = true;
}
}
}
k = parse_keyword(src, k, "=>");
const t = skip_ws(src, k);
const arm = (t < stringLen(src) && stringCharCodeAt(src, t) == 123 ? parse_block_expr(src, k) : parse_expr(src, k));
k = arm.v1;
if (pat == "_") {
def = arm.v0;
} else {
cases = cases + ("case " + pat + ": return " + arm.v0 + ";\n");
}
k = skip_ws(src, k);
if (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 44 || ch == 59) {
k = k + 1;
}
}
}
if (def == "" && !sawVariant) {
panic_at(src, k, "match requires _ arm");
}
if (def == "" && sawVariant) {
def = "(() => { throw new Error(\\\"non-exhaustive match\\\"); })()";
}
const scrutJs = (sawVariant ? "(" + scrut.v0 + ").tag" : scrut.v0);
return ParsedExpr("(() => { switch (" + scrutJs + ") {\n" + cases + "default: return " + def + ";\n} })()", k);
}
