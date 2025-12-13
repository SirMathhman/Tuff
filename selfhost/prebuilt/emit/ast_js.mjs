// compiled by selfhost tuffc
import { panic, stringLen, stringCharCodeAt, stringFromCharCode, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get, vec_set } from "../rt/vec.mjs";
import { find_struct_fields } from "../util/diagnostics.mjs";
import { starts_with_at } from "../util/lexing.mjs";
import { module_path_to_relpath } from "../parsing/primitives.mjs";
let __current_file_path = "";
export function set_current_file_path(path) {
__current_file_path = path;
return undefined;
}
export function normalize_path_seps(p) {
let out = "";
let i = 0;
while ((i < stringLen(p))) {
const ch = stringCharCodeAt(p, i);
if ((ch == 92)) {
out = (out + "/");
i = (i + 1);
continue;
}
out = (out + stringFromCharCode(ch));
i = (i + 1);
}
return out;
}
export function split_path(p) {
let segs = vec_new();
let start = 0;
let i = 0;
while ((i <= stringLen(p))) {
if (((i == stringLen(p)) || (stringCharCodeAt(p, i) == 47))) {
if ((i > start)) {
vec_push(segs, stringSlice(p, start, i));
}
start = (i + 1);
i = (i + 1);
continue;
}
i = (i + 1);
}
return segs;
}
export function rel_import_path(targetRelPath) {
const from = normalize_path_seps(__current_file_path);
const to = normalize_path_seps(targetRelPath);
const fromParts = split_path(from);
const toParts = split_path(to);
let fromDirLen = (vec_len(fromParts) - 1);
if ((vec_len(fromParts) == 0)) {
fromDirLen = 0;
}
let common = 0;
while (((common < fromDirLen) && (common < vec_len(toParts)))) {
if ((vec_get(fromParts, common) != vec_get(toParts, common))) {
break;
}
common = (common + 1);
}
let up = (fromDirLen - common);
let prefix = "";
if ((up == 0)) {
prefix = "./";
} else {
while ((up > 0)) {
prefix = (prefix + "../");
up = (up - 1);
}
}
let rest = "";
let i = common;
while ((i < vec_len(toParts))) {
if ((stringLen(rest) == 0)) {
rest = vec_get(toParts, i);
} else {
rest = ((rest + "/") + vec_get(toParts, i));
}
i = (i + 1);
}
return (prefix + rest);
}
export function escape_js_string(s) {
let out = "";
let i = 0;
while ((i < stringLen(s))) {
const ch = stringCharCodeAt(s, i);
if ((ch == 34)) {
out = (out + "\\\"");
i = (i + 1);
continue;
}
if ((ch == 92)) {
out = (out + "\\\\");
i = (i + 1);
continue;
}
if ((ch == 10)) {
out = (out + "\\n");
i = (i + 1);
continue;
}
if ((ch == 13)) {
out = (out + "\\r");
i = (i + 1);
continue;
}
if ((ch == 9)) {
out = (out + "\\t");
i = (i + 1);
continue;
}
out = (out + stringFromCharCode(ch));
i = (i + 1);
}
return out;
}
export function emit_binop_js(op) {
let out = "??";
if ((op.tag == "OpAdd")) {
out = "+";
}
if ((op.tag == "OpSub")) {
out = "-";
}
if ((op.tag == "OpMul")) {
out = "*";
}
if ((op.tag == "OpEq")) {
out = "==";
}
if ((op.tag == "OpNe")) {
out = "!=";
}
if ((op.tag == "OpLt")) {
out = "<";
}
if ((op.tag == "OpLe")) {
out = "<=";
}
if ((op.tag == "OpGt")) {
out = ">";
}
if ((op.tag == "OpGe")) {
out = ">=";
}
if ((op.tag == "OpAnd")) {
out = "&&";
}
if ((op.tag == "OpOr")) {
out = "||";
}
return out;
}
export function emit_unop_js(op) {
let out = "??";
if ((op.tag == "OpNot")) {
out = "!";
}
if ((op.tag == "OpNeg")) {
out = "-";
}
return out;
}
export function emit_path_js(parts) {
let out = "";
let i = 0;
while ((i < vec_len(parts))) {
if ((i > 0)) {
out = (out + ".");
}
out = (out + vec_get(parts, i));
i = (i + 1);
}
return out;
}
export function struct_name_for_lookup(nameExpr) {
if ((nameExpr.tag == "EIdent")) {
return nameExpr.name;
}
if ((nameExpr.tag == "EPath")) {
return emit_path_js(nameExpr.parts);
}
return panic("struct literal name must be ident or path");
}
export function emit_struct_lit_js(nameExpr, values) {
const structName = struct_name_for_lookup(nameExpr);
const fields = find_struct_fields(structName);
if ((!(vec_len(fields) == vec_len(values)))) {
panic(("wrong number of values in struct literal for " + structName));
}
let out = "({ ";
let i = 0;
while ((i < vec_len(fields))) {
if ((i > 0)) {
out = (out + ", ");
}
out = (out + ((vec_get(fields, i) + ": ") + emit_expr_js(vec_get(values, i))));
i = (i + 1);
}
out = (out + " })");
return out;
}
export function emit_expr_js(e) {
let out = "undefined";
if ((e.tag == "EUndefined")) {
out = "undefined";
}
if ((e.tag == "EInt")) {
out = ("" + e.value);
}
if ((e.tag == "EFloat")) {
if ((e.suffix == "F32")) {
out = (("Math.fround(" + e.text) + ")");
} else {
out = e.text;
}
}
if ((e.tag == "EBool")) {
if (e.value) {
out = "true";
} else {
out = "false";
}
}
if ((e.tag == "EString")) {
out = (("\"" + escape_js_string(e.value)) + "\"");
}
if ((e.tag == "EIdent")) {
out = e.name;
}
if ((e.tag == "EPath")) {
out = emit_path_js(e.parts);
}
if ((e.tag == "ELambda")) {
const params = emit_names_csv(e.params);
if ((e.body.tag == "EBlock")) {
out = (((((("((" + params) + ") => {\n") + emit_stmts_js(e.body.body)) + "return ") + emit_expr_js(e.body.tail)) + ";\n})");
} else {
out = (((("((" + params) + ") => ") + emit_expr_js(e.body)) + ")");
}
}
if ((e.tag == "EStructLit")) {
out = emit_struct_lit_js(e.nameExpr, e.values);
}
if ((e.tag == "EUnary")) {
out = ((("(" + emit_unop_js(e.op)) + emit_expr_js(e.expr)) + ")");
}
if ((e.tag == "EBinary")) {
out = (((((("(" + emit_expr_js(e.left)) + " ") + emit_binop_js(e.op)) + " ") + emit_expr_js(e.right)) + ")");
}
if ((e.tag == "ECall")) {
let s = (emit_expr_js(e.callee) + "(");
let i = 0;
while ((i < vec_len(e.args))) {
if ((i > 0)) {
s = (s + ", ");
}
s = (s + emit_expr_js(vec_get(e.args, i)));
i = (i + 1);
}
s = (s + ")");
out = s;
}
if ((e.tag == "EIf")) {
out = (((((("(" + emit_expr_js(e.cond)) + " ? ") + emit_expr_js(e.thenExpr)) + " : ") + emit_expr_js(e.elseExpr)) + ")");
}
if ((e.tag == "EBlock")) {
out = (((("(() => {\n" + emit_stmts_js(e.body)) + "return ") + emit_expr_js(e.tail)) + ";\n})()");
}
if ((e.tag == "EVecLit")) {
let pushes = "";
let i = 0;
while ((i < vec_len(e.items))) {
pushes = (pushes + (("vec_push(__v, " + emit_expr_js(vec_get(e.items, i))) + ");\n"));
i = (i + 1);
}
out = (("(() => { const __v = vec_new();\n" + pushes) + "return __v;\n})()");
}
if ((e.tag == "ETupleLit")) {
let s = "[";
let i = 0;
while ((i < vec_len(e.items))) {
if ((i > 0)) {
s = (s + ", ");
}
s = (s + emit_expr_js(vec_get(e.items, i)));
i = (i + 1);
}
s = (s + "]");
out = s;
}
if ((e.tag == "EIndex")) {
out = (((("vec_get(" + emit_expr_js(e.base)) + ", ") + emit_expr_js(e.index)) + ")");
}
if ((e.tag == "ETupleIndex")) {
out = (((emit_expr_js(e.base) + "[") + ("" + e.index)) + "]");
}
if ((e.tag == "EField")) {
out = ((emit_expr_js(e.base) + ".") + e.field);
}
if ((e.tag == "EMatch")) {
let cases = "";
let def = "";
let i = 0;
while ((i < vec_len(e.arms))) {
const arm = vec_get(e.arms, i);
if ((arm.pat.tag == "MPWildcard")) {
def = emit_expr_js(arm.expr);
} else {
let patJs = "";
if ((arm.pat.tag == "MPInt")) {
patJs = ("" + arm.pat.value);
}
if ((arm.pat.tag == "MPBool")) {
patJs = (arm.pat.value ? "true" : "false");
}
if ((arm.pat.tag == "MPString")) {
patJs = (("\"" + escape_js_string(arm.pat.value)) + "\"");
}
cases = (cases + (((("case " + patJs) + ": return ") + emit_expr_js(arm.expr)) + ";\n"));
}
i = (i + 1);
}
if ((def == "")) {
panic("match requires _ arm");
}
out = (((((("(() => { switch (" + emit_expr_js(e.scrut)) + ") {\n") + cases) + "default: return ") + def) + ";\n} })()");
}
return out;
}
export function emit_stmt_js(s) {
let out = "";
if ((s.tag == "SLet")) {
const kw = (s.isMut ? "let" : "const");
out = (((((kw + " ") + s.name) + " = ") + emit_expr_js(s.init)) + ";\n");
}
if ((s.tag == "SAssign")) {
out = (((s.name + " = ") + emit_expr_js(s.value)) + ";\n");
}
if ((s.tag == "SExpr")) {
out = (emit_expr_js(s.expr) + ";\n");
}
if ((s.tag == "SYield")) {
if ((s.expr.tag == "EUndefined")) {
out = "return;\n";
} else {
out = (("return " + emit_expr_js(s.expr)) + ";\n");
}
}
if ((s.tag == "SWhile")) {
out = (((("while (" + emit_expr_js(s.cond)) + ") {\n") + emit_stmts_js(s.body)) + "}\n");
}
if ((s.tag == "SIf")) {
if (s.hasElse) {
out = (((((("if (" + emit_expr_js(s.cond)) + ") {\n") + emit_stmts_js(s.thenBody)) + "} else {\n") + emit_stmts_js(s.elseBody)) + "}\n");
} else {
out = (((("if (" + emit_expr_js(s.cond)) + ") {\n") + emit_stmts_js(s.thenBody)) + "}\n");
}
}
if ((s.tag == "SIndexAssign")) {
out = (((((("vec_set(" + emit_expr_js(s.base)) + ", ") + emit_expr_js(s.index)) + ", ") + emit_expr_js(s.value)) + ");\n");
}
if ((s.tag == "SFieldAssign")) {
let lhs = emit_expr_js(s.base);
let i = 0;
while ((i < vec_len(s.fields))) {
lhs = ((lhs + ".") + vec_get(s.fields, i));
i = (i + 1);
}
out = (((lhs + " = ") + emit_expr_js(s.value)) + ";\n");
}
return out;
}
export function emit_stmts_js(stmts) {
let out = "";
let i = 0;
while ((i < vec_len(stmts))) {
out = (out + emit_stmt_js(vec_get(stmts, i)));
i = (i + 1);
}
return out;
}
export function emit_names_csv(names) {
let out = "";
let i = 0;
while ((i < vec_len(names))) {
if ((i > 0)) {
out = (out + ", ");
}
out = (out + vec_get(names, i));
i = (i + 1);
}
return out;
}
export function emit_extern_import_path(modPath) {
if (starts_with_at(modPath, 0, "rt::")) {
const rel = (("rt/" + stringSlice(modPath, 4, stringLen(modPath))) + ".mjs");
return rel_import_path(rel);
}
if (starts_with_at(modPath, 0, "node::")) {
return ("node:" + stringSlice(modPath, 6, stringLen(modPath)));
}
return panic(("unsupported extern module: " + modPath));
}
export function emit_fn_decl_js(d, exportAll, jsName, exportThis) {
const exportKw = (exportThis ? "export " : "");
const params = emit_names_csv(d.params);
return (((((((((exportKw + "function ") + jsName) + "(") + params) + ") {\n") + emit_stmts_js(d.body)) + "return ") + emit_expr_js(d.tail)) + ";\n}\n");
}
export function emit_type_union_js(d, exportAll) {
let out = "";
const dq = "\"";
let i = 0;
while ((i < vec_len(d.variants))) {
const v = vec_get(d.variants, i);
const header = (exportAll ? "export const " : "const ");
if (v.hasPayload) {
out = (out + ((((((header + v.name) + " = (value) => { return { tag: ") + dq) + v.name) + dq) + ", value: value }; };\n"));
} else {
out = (out + ((((((header + v.name) + " = { tag: ") + dq) + v.name) + dq) + " };\n"));
}
i = (i + 1);
}
return out;
}
export function emit_module_decl_js(d, prefix, exportThis) {
let decls = "";
let entries = "";
let first = true;
let i = 0;
while ((i < vec_len(d.decls))) {
const inner = vec_get(d.decls, i);
if ((inner.tag == "DFn")) {
const jsName = ((((prefix + "__") + d.name) + "__") + inner.name);
decls = (decls + emit_fn_decl_js(inner, false, jsName, false));
if (first) {
entries = (entries + ((inner.name + ": ") + jsName));
} else {
entries = (entries + (((", " + inner.name) + ": ") + jsName));
}
first = false;
i = (i + 1);
continue;
}
if ((inner.tag == "DModule")) {
const innerCode = emit_module_decl_js(inner, ((prefix + "__") + d.name), false);
decls = (decls + innerCode);
const prop = inner.name;
if (first) {
entries = (entries + ((prop + ": ") + prop));
} else {
entries = (entries + (((", " + prop) + ": ") + prop));
}
first = false;
i = (i + 1);
continue;
}
panic("unsupported decl inside module");
}
const header = (exportThis ? "export const " : "const ");
return (((((decls + header) + d.name) + " = { ") + entries) + " };\n");
}
export function emit_decl_js(d, exportAll) {
let out = "";
if ((d.tag == "DExternFrom")) {
const importPath = emit_extern_import_path(d.modulePath);
out = (((("import { " + emit_names_csv(d.names)) + " } from \"") + importPath) + "\";\n");
}
if ((d.tag == "DImport")) {
const targetRel = (module_path_to_relpath(d.modulePath) + ".mjs");
const importPath = rel_import_path(targetRel);
out = (((("import { " + emit_names_csv(d.names)) + " } from \"") + importPath) + "\";\n");
}
if ((d.tag == "DTypeUnion")) {
out = emit_type_union_js(d, exportAll);
}
if ((d.tag == "DStruct")) {
out = "";
}
if ((d.tag == "DLet")) {
const kw = (d.isMut ? "let" : "const");
out = (((((kw + " ") + d.name) + " = ") + emit_expr_js(d.init)) + ";\n");
}
if ((d.tag == "DFn")) {
const exportThis = (exportAll || (d.name == "main"));
out = emit_fn_decl_js(d, exportAll, d.name, exportThis);
}
if ((d.tag == "DClassFn")) {
const exportThis = (exportAll || (d.name == "main"));
const exportKw = (exportThis ? "export " : "");
const params = emit_names_csv(d.params);
let fields = "";
let i = 0;
while ((i < vec_len(d.params))) {
if ((i > 0)) {
fields = (fields + ", ");
}
const p = vec_get(d.params, i);
fields = (fields + ((p + ": ") + p));
i = (i + 1);
}
out = (((((((((exportKw + "function ") + d.name) + "(") + params) + ") {\n") + emit_stmts_js(d.body)) + "return { ") + fields) + " };\n}\n");
}
if ((d.tag == "DModule")) {
out = emit_module_decl_js(d, "M", true);
}
return out;
}
