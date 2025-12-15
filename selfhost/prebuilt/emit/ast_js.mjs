// compiled by selfhost tuffc
import { panic, stringLen, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { find_struct_fields } from "../util/diagnostics.mjs";
import { starts_with_at } from "../util/lexing.mjs";
import { module_path_to_relpath } from "../parsing/primitives.mjs";
import { set_current_file_path, emit_runtime_vec_imports_js, decls_needs_vec_rt, rel_import_path, escape_js_string } from "./emit_helpers.mjs";
export function emit_binop_js(op) {
let out = "??";
if (op.tag == "OpAdd") {
out = "+";
}
if (op.tag == "OpSub") {
out = "-";
}
if (op.tag == "OpMul") {
out = "*";
}
if (op.tag == "OpEq") {
out = "==";
}
if (op.tag == "OpNe") {
out = "!=";
}
if (op.tag == "OpLt") {
out = "<";
}
if (op.tag == "OpLe") {
out = "<=";
}
if (op.tag == "OpGt") {
out = ">";
}
if (op.tag == "OpGe") {
out = ">=";
}
if (op.tag == "OpAnd") {
out = "&&";
}
if (op.tag == "OpOr") {
out = "||";
}
return out;
}
export function emit_unop_js(op) {
let out = "??";
if (op.tag == "OpNot") {
out = "!";
}
if (op.tag == "OpNeg") {
out = "-";
}
return out;
}
export function binop_prec_js(op) {
if (op.tag == "OpMul") {
return 14;
}
if (op.tag == "OpAdd" || op.tag == "OpSub") {
return 13;
}
if (op.tag == "OpLt" || op.tag == "OpLe" || op.tag == "OpGt" || op.tag == "OpGe") {
return 11;
}
if (op.tag == "OpEq" || op.tag == "OpNe") {
return 10;
}
if (op.tag == "OpAnd") {
return 6;
}
if (op.tag == "OpOr") {
return 5;
}
return 0;
}
export function expr_prec_js(e) {
if (e.tag == "EIf") {
return 4;
}
if (e.tag == "EBinary") {
return binop_prec_js(e.op);
}
if (e.tag == "EUnary") {
return 17;
}
return 20;
}
export function emit_path_js(parts) {
let out = "";
let i = 0;
while (i < vec_len(parts)) {
if (i > 0) {
out = out + ".";
}
out = out + vec_get(parts, i);
i = i + 1;
}
return out;
}
export function struct_name_for_lookup(nameExpr) {
if (nameExpr.tag == "EIdent") {
return nameExpr.name;
}
if (nameExpr.tag == "EPath") {
return emit_path_js(nameExpr.parts);
}
return panic("struct literal name must be ident or path");
}
export function emit_struct_lit_js(nameExpr, values) {
const structName = struct_name_for_lookup(nameExpr);
const fields = find_struct_fields(structName);
if (!(vec_len(fields) == vec_len(values))) {
panic("wrong number of values in struct literal for " + structName);
}
let out = "({ ";
let i = 0;
while (i < vec_len(fields)) {
if (i > 0) {
out = out + ", ";
}
out = out + (vec_get(fields, i) + ": " + emit_expr_js(vec_get(values, i)));
i = i + 1;
}
out = out + " })";
return out;
}
export function emit_expr_js(e) {
let out = "undefined";
if (e.tag == "EUndefined") {
out = "undefined";
}
if (e.tag == "EInt") {
out = "" + e.value;
}
if (e.tag == "EFloat") {
if (e.suffix == "F32") {
out = "Math.fround(" + e.text + ")";
} else {
out = e.text;
}
}
if (e.tag == "EBool") {
if (e.value) {
out = "true";
} else {
out = "false";
}
}
if (e.tag == "EString") {
out = "\"" + escape_js_string(e.value) + "\"";
}
if (e.tag == "EIdent") {
out = e.name;
}
if (e.tag == "EPath") {
out = emit_path_js(e.parts);
}
if (e.tag == "ELambda") {
const params = emit_names_csv(e.params);
if (e.body.tag == "EBlock") {
out = "((" + params + ") => {\n" + emit_stmts_js(e.body.body) + "return " + emit_expr_js(e.body.tail) + ";\n})";
} else {
out = "((" + params + ") => " + emit_expr_js(e.body) + ")";
}
}
if (e.tag == "EStructLit") {
out = emit_struct_lit_js(e.nameExpr, e.values);
}
if (e.tag == "EUnary") {
const inner = emit_expr_js(e.expr);
const innerStr = (expr_prec_js(e.expr) < 17 ? "(" + inner + ")" : inner);
out = emit_unop_js(e.op) + innerStr;
}
if (e.tag == "EBinary") {
const left = emit_expr_js(e.left);
const right = emit_expr_js(e.right);
const curPrec = binop_prec_js(e.op);
const leftStr = (expr_prec_js(e.left) < curPrec ? "(" + left + ")" : left);
const rightStr = (expr_prec_js(e.right) <= curPrec ? "(" + right + ")" : right);
out = leftStr + " " + emit_binop_js(e.op) + " " + rightStr;
}
if (e.tag == "ECall") {
let s = emit_expr_js(e.callee) + "(";
let i = 0;
while (i < vec_len(e.args)) {
if (i > 0) {
s = s + ", ";
}
s = s + emit_expr_js(vec_get(e.args, i));
i = i + 1;
}
s = s + ")";
out = s;
}
if (e.tag == "EIf") {
out = "(" + emit_expr_js(e.cond) + " ? " + emit_expr_js(e.thenExpr) + " : " + emit_expr_js(e.elseExpr) + ")";
}
if (e.tag == "EBlock") {
out = "(() => {\n" + emit_stmts_js(e.body) + "return " + emit_expr_js(e.tail) + ";\n})()";
}
if (e.tag == "EVecLit") {
let pushes = "";
let i = 0;
while (i < vec_len(e.items)) {
pushes = pushes + ("__tuff_vec_push(__v, " + emit_expr_js(vec_get(e.items, i)) + ");\n");
i = i + 1;
}
out = "(() => { const __v = __tuff_vec_new();\n" + pushes + "return __v;\n})()";
}
if (e.tag == "ETupleLit") {
let s = "[";
let i = 0;
while (i < vec_len(e.items)) {
if (i > 0) {
s = s + ", ";
}
s = s + emit_expr_js(vec_get(e.items, i));
i = i + 1;
}
s = s + "]";
out = s;
}
if (e.tag == "EIndex") {
out = "__tuff_vec_get(" + emit_expr_js(e.base) + ", " + emit_expr_js(e.index) + ")";
}
if (e.tag == "ETupleIndex") {
out = emit_expr_js(e.base) + "[" + ("" + e.index) + "]";
}
if (e.tag == "EField") {
out = emit_expr_js(e.base) + "." + e.field;
}
if (e.tag == "EMatch") {
let cases = "";
let def = "";
let sawVariant = false;
let i = 0;
while (i < vec_len(e.arms)) {
const arm = vec_get(e.arms, i);
if (arm.pat.tag == "MPWildcard") {
def = emit_expr_js(arm.expr);
} else {
let patJs = "";
if (arm.pat.tag == "MPInt") {
patJs = "" + arm.pat.value;
}
if (arm.pat.tag == "MPBool") {
patJs = (arm.pat.value ? "true" : "false");
}
if (arm.pat.tag == "MPString") {
patJs = "\"" + escape_js_string(arm.pat.value) + "\"";
}
if (arm.pat.tag == "MPVariant") {
patJs = "\"" + escape_js_string(arm.pat.name) + "\"";
sawVariant = true;
}
cases = cases + ("case " + patJs + ": return " + emit_expr_js(arm.expr) + ";\n");
}
i = i + 1;
}
if (def == "" && !sawVariant) {
panic("match requires _ arm");
}
if (def == "" && sawVariant) {
def = "(() => { throw new Error(\"non-exhaustive match\"); })()";
}
const scrutJs = (sawVariant ? "(" + emit_expr_js(e.scrut) + ").tag" : emit_expr_js(e.scrut));
out = "(() => { switch (" + scrutJs + ") {\n" + cases + "default: return " + def + ";\n} })()";
}
return out;
}
export function emit_stmt_js(s) {
let out = "";
if (s.tag == "SLet") {
const kw = (s.isMut ? "let" : "const");
out = kw + " " + s.name + " = " + emit_expr_js(s.init) + ";\n";
}
if (s.tag == "SAssign") {
out = s.name + " = " + emit_expr_js(s.value) + ";\n";
}
if (s.tag == "SExpr") {
out = emit_expr_js(s.expr) + ";\n";
}
if (s.tag == "SYield") {
if (s.expr.tag == "EUndefined") {
out = "return;\n";
} else {
out = "return " + emit_expr_js(s.expr) + ";\n";
}
}
if (s.tag == "SWhile") {
const cond = emit_expr_js(s.cond);
out = "while (" + cond + ") {\n" + emit_stmts_js(s.body) + "}\n";
}
if (s.tag == "SIf") {
if (s.hasElse) {
out = "if (" + emit_expr_js(s.cond) + ") {\n" + emit_stmts_js(s.thenBody) + "} else {\n" + emit_stmts_js(s.elseBody) + "}\n";
} else {
out = "if (" + emit_expr_js(s.cond) + ") {\n" + emit_stmts_js(s.thenBody) + "}\n";
}
}
if (s.tag == "SIndexAssign") {
out = "__tuff_vec_set(" + emit_expr_js(s.base) + ", " + emit_expr_js(s.index) + ", " + emit_expr_js(s.value) + ");\n";
}
if (s.tag == "SFieldAssign") {
let lhs = emit_expr_js(s.base);
let i = 0;
while (i < vec_len(s.fields)) {
lhs = lhs + "." + vec_get(s.fields, i);
i = i + 1;
}
out = lhs + " = " + emit_expr_js(s.value) + ";\n";
}
return out;
}
export function emit_stmts_js(stmts) {
let out = "";
let i = 0;
while (i < vec_len(stmts)) {
out = out + emit_stmt_js(vec_get(stmts, i));
i = i + 1;
}
return out;
}
export function emit_names_csv(names) {
let out = "";
let i = 0;
while (i < vec_len(names)) {
if (i > 0) {
out = out + ", ";
}
out = out + vec_get(names, i);
i = i + 1;
}
return out;
}
export function emit_extern_import_path(modPath) {
if (starts_with_at(modPath, 0, "rt::")) {
const rel = "rt/" + stringSlice(modPath, 4, stringLen(modPath)) + ".mjs";
return rel_import_path(rel);
}
if (starts_with_at(modPath, 0, "node::")) {
return "node:" + stringSlice(modPath, 6, stringLen(modPath));
}
return panic("unsupported extern module: " + modPath);
}
export function emit_fn_decl_js(d, exportAll, jsName, exportThis) {
const exportKw = (exportThis ? "export " : "");
const params = emit_names_csv(d.params);
return exportKw + "function " + jsName + "(" + params + ") {\n" + emit_stmts_js(d.body) + "return " + emit_expr_js(d.tail) + ";\n}\n";
}
export function emit_type_union_js(d, exportAll) {
let out = "";
const dq = "\"";
let i = 0;
while (i < vec_len(d.variants)) {
const v = vec_get(d.variants, i);
const header = "export const ";
if (v.hasPayload) {
out = out + (header + v.name + " = (value) => { return { tag: " + dq + v.name + dq + ", value: value }; };\n");
} else {
out = out + (header + v.name + " = { tag: " + dq + v.name + dq + " };\n");
}
i = i + 1;
}
return out;
}
export function emit_module_decl_js(d, prefix, exportThis) {
let decls = "";
let entries = "";
let first = true;
let i = 0;
while (i < vec_len(d.decls)) {
const inner = vec_get(d.decls, i);
if (inner.tag == "DFn") {
const jsName = prefix + "__" + d.name + "__" + inner.name;
decls = decls + emit_fn_decl_js(inner, false, jsName, false);
if (first) {
entries = entries + (inner.name + ": " + jsName);
} else {
entries = entries + (", " + inner.name + ": " + jsName);
}
first = false;
i = i + 1;
continue;
}
if (inner.tag == "DModule") {
const innerCode = emit_module_decl_js(inner, prefix + "__" + d.name, false);
decls = decls + innerCode;
const prop = inner.name;
if (first) {
entries = entries + (prop + ": " + prop);
} else {
entries = entries + (", " + prop + ": " + prop);
}
first = false;
i = i + 1;
continue;
}
panic("unsupported decl inside module");
}
const header = (exportThis ? "export const " : "const ");
return decls + header + d.name + " = { " + entries + " };\n";
}
export function emit_decl_js(d, exportAll) {
let out = "";
if (d.tag == "DExternFrom") {
const importPath = emit_extern_import_path(d.modulePath);
out = "import { " + emit_names_csv(d.names) + " } from \"" + importPath + "\";\n";
}
if (d.tag == "DExternType") {
out = "";
}
if (d.tag == "DImport") {
let targetModulePath = d.modulePath;
const compilerSrcPrefix = "src::main::tuff::compiler::";
if (starts_with_at(targetModulePath, 0, compilerSrcPrefix)) {
targetModulePath = stringSlice(targetModulePath, stringLen(compilerSrcPrefix), stringLen(targetModulePath));
}
const targetRel = module_path_to_relpath(targetModulePath) + ".mjs";
const importPath = rel_import_path(targetRel);
out = "import { " + emit_names_csv(d.names) + " } from \"" + importPath + "\";\n";
}
if (d.tag == "DTypeUnion") {
out = emit_type_union_js(d, exportAll);
}
if (d.tag == "DStruct") {
out = "";
}
if (d.tag == "DLet") {
const kw = (d.isMut ? "let" : "const");
out = kw + " " + d.name + " = " + emit_expr_js(d.init) + ";\n";
}
if (d.tag == "DFn") {
const exportThis = exportAll || d.isOut || d.name == "main";
out = emit_fn_decl_js(d, exportAll, d.name, exportThis);
}
if (d.tag == "DClassFn") {
const exportThis = exportAll || d.isOut || d.name == "main";
const exportKw = (exportThis ? "export " : "");
const params = emit_names_csv(d.params);
const fieldNames = vec_new();
let i = 0;
while (i < vec_len(d.params)) {
vec_push(fieldNames, vec_get(d.params, i));
i = i + 1;
}
i = 0;
while (i < vec_len(d.body)) {
const s = vec_get(d.body, i);
if (s.tag == "SLet") {
let found = false;
let j = 0;
while (j < vec_len(fieldNames)) {
if (vec_get(fieldNames, j) == s.name) {
found = true;
j = vec_len(fieldNames);
} else {
j = j + 1;
}
}
if (!found) {
vec_push(fieldNames, s.name);
}
}
i = i + 1;
}
let fields = "";
i = 0;
while (i < vec_len(fieldNames)) {
if (i > 0) {
fields = fields + ", ";
}
const p = vec_get(fieldNames, i);
fields = fields + (p + ": " + p);
i = i + 1;
}
out = exportKw + "function " + d.name + "(" + params + ") {\n" + emit_stmts_js(d.body) + "return { " + fields + " };\n}\n";
}
if (d.tag == "DModule") {
out = emit_module_decl_js(d, "M", true);
}
return out;
}
