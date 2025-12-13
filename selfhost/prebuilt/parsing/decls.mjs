// compiled by selfhost tuffc
import { stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
import { panic_at, add_struct_def, is_identifier_too_short, warn_short_identifier } from "../util/diagnostics.mjs";
import { is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { ParsedIdent, parse_ident, parse_keyword, parse_module_path, module_path_to_relpath, parse_optional_semicolon } from "./primitives.mjs";
import { ParsedType, parse_type_expr, skip_angle_brackets } from "./types.mjs";
import { ParsedMain, ParsedParams, ParsedStmt, parse_expr, parse_main_body, parse_mut_opt } from "./expr_stmt.mjs";
import { ParsedMainAst, parse_main_body_ast } from "./expr_stmt.mjs";
import { span, decl_extern_from, decl_import, decl_fn, decl_fn_typed, decl_class_fn, decl_class_fn_typed, decl_struct, decl_struct_typed, decl_type_union, type_union_variant, decl_module } from "../ast.mjs";
export function ParsedDeclAst(decl, nextPos) {
return { decl: decl, nextPos: nextPos };
}
export function ParsedDeclsAst(decls, nextPos) {
return { decls: decls, nextPos: nextPos };
}
export function ParsedNamesAst(names, nextPos) {
return { names: names, nextPos: nextPos };
}
export function ParsedParamsAst(names, tyAnns, nextPos) {
return { names: names, tyAnns: tyAnns, nextPos: nextPos };
}
export function ParsedImports(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedFn(v0, v1, v2) {
return { v0: v0, v1: v1, v2: v2 };
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
if ((!(k < stringLen(src)))) {
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
export function parse_name_list_ast(src, i) {
let k = parse_keyword(src, i, "{");
k = skip_ws(src, k);
const names = vec_new();
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125))) {
return ParsedNamesAst(names, (k + 1));
}
while (true) {
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
return ParsedNamesAst(names, (k + 1));
}
const id = parse_ident(src, k);
vec_push(names, id.text);
k = skip_ws(src, id.nextPos);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 44))) {
k = (k + 1);
continue;
}
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125))) {
return ParsedNamesAst(names, (k + 1));
}
panic_at(src, k, "expected ',' or '}' in name list");
}
return ParsedNamesAst(names, k);
}
export function parse_param_list_ast(src, i) {
let k = parse_keyword(src, i, "(");
k = skip_ws(src, k);
const names = vec_new();
const tyAnns = vec_new();
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedParamsAst(names, tyAnns, (k + 1));
}
while (true) {
const id = parse_ident(src, k);
k = id.nextPos;
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
vec_push(tyAnns, _ty.v0);
k = _ty.v1;
} else {
vec_push(tyAnns, "");
}
vec_push(names, id.text);
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ')' in param list");
}
const c = stringCharCodeAt(src, k);
if ((c == 44)) {
k = (k + 1);
continue;
}
if ((c == 41)) {
return ParsedParamsAst(names, tyAnns, (k + 1));
}
panic_at(src, k, "expected ',' or ')' in param list");
}
return ParsedParamsAst(names, tyAnns, k);
}
export function parse_extern_decl_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "extern");
k = parse_keyword(src, k, "from");
const mod = parse_module_path(src, k);
k = parse_keyword(src, mod.nextPos, "use");
const names = parse_name_list_ast(src, k);
k = parse_optional_semicolon(src, names.nextPos);
return ParsedDeclAst(decl_extern_from(span(start, k), mod.text, names.names), k);
}
export function parse_imports_ast(src, i) {
let k = i;
const decls = vec_new();
while (true) {
const j = skip_ws(src, k);
if (starts_with_at(src, j, "import")) {
panic_at(src, j, "`import` is not supported. Use `from <module> use { ... };` instead.");
}
if ((!starts_with_at(src, j, "from"))) {
break;
}
const start = skip_ws(src, k);
k = parse_keyword(src, k, "from");
const mod = parse_module_path(src, k);
k = parse_keyword(src, mod.nextPos, "use");
const names = parse_name_list_ast(src, k);
k = parse_optional_semicolon(src, names.nextPos);
vec_push(decls, decl_import(span(start, k), mod.text, names.names));
}
return ParsedDeclsAst(decls, k);
}
export function parse_fn_decl_ast(src, i) {
return parse_fn_decl_ast2(src, i, false);
}
export function parse_fn_decl_ast2(src, i, exportAll) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
const params = parse_param_list_ast(src, k);
k = params.nextPos;
const t1 = skip_ws(src, k);
let retTyAnn = "";
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 58))) {
const _rt = parse_type_expr(src, (t1 + 1));
retTyAnn = _rt.v0;
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body_ast(src, k);
k = body.nextPos;
let anyParamTy = false;
let pi = 0;
while ((pi < vec_len(params.tyAnns))) {
if ((vec_get(params.tyAnns, pi) != "")) {
anyParamTy = true;
break;
}
pi = (pi + 1);
}
if ((anyParamTy || (retTyAnn != ""))) {
return ParsedDeclAst(decl_fn_typed(span(start, k), name.text, params.names, params.tyAnns, retTyAnn, body.body, body.tail), k);
}
return ParsedDeclAst(decl_fn(span(start, k), name.text, params.names, body.body, body.tail), k);
}
export function parse_class_fn_decl_ast2(src, i, exportAll) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "class");
k = parse_keyword(src, k, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
const params = parse_param_list_ast(src, k);
k = params.nextPos;
const t1 = skip_ws(src, k);
let retTyAnn = "";
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 58))) {
const _rt = parse_type_expr(src, (t1 + 1));
retTyAnn = _rt.v0;
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body_ast(src, k);
k = body.nextPos;
let anyParamTy = false;
let pi = 0;
while ((pi < vec_len(params.tyAnns))) {
if ((vec_get(params.tyAnns, pi) != "")) {
anyParamTy = true;
break;
}
pi = (pi + 1);
}
if ((anyParamTy || (retTyAnn != ""))) {
return ParsedDeclAst(decl_class_fn_typed(span(start, k), name.text, params.names, params.tyAnns, retTyAnn, body.body, body.tail), k);
}
return ParsedDeclAst(decl_class_fn(span(start, k), name.text, params.names, body.body, body.tail), k);
}
export function parse_struct_decl_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "struct");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
k = parse_keyword(src, k, "{");
const fields = vec_new();
const fieldTyAnns = vec_new();
while (true) {
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
const field = parse_ident(src, k);
k = parse_keyword(src, field.nextPos, ":");
const _ty = parse_type_expr(src, k);
k = _ty.v1;
vec_push(fields, field.text);
vec_push(fieldTyAnns, _ty.v0);
k = skip_ws(src, k);
if ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if (((ch == 44) || (ch == 59))) {
k = (k + 1);
}
}
}
add_struct_def(name.text, fields);
return ParsedDeclAst(decl_struct_typed(span(start, k), name.text, fields, fieldTyAnns), k);
}
export function parse_type_union_decl_ast(src, i, exportAll) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "type");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
k = parse_keyword(src, k, "=");
const variants = vec_new();
let first = true;
while (true) {
if ((!first)) {
k = parse_keyword(src, k, "|");
}
first = false;
const vStart = skip_ws(src, k);
const v = parse_ident(src, vStart);
k = v.nextPos;
let hasPayload = false;
const t1 = skip_ws(src, k);
if (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 60))) {
hasPayload = true;
k = skip_angle_brackets(src, t1);
}
vec_push(variants, type_union_variant(span(vStart, k), v.text, hasPayload));
const t2 = skip_ws(src, k);
if ((!(t2 < stringLen(src)))) {
break;
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
return ParsedDeclAst(decl_type_union(span(start, k), name.text, variants), k);
}
export function parse_module_decl_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "module");
const modName = parse_ident(src, k);
k = parse_keyword(src, modName.nextPos, "{");
const decls = vec_new();
while (true) {
const t = skip_ws(src, k);
if ((!(t < stringLen(src)))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
k = (t + 1);
break;
}
if (starts_with_at(src, t, "fn")) {
const d = parse_fn_decl_ast2(src, k, false);
vec_push(decls, d.decl);
k = d.nextPos;
continue;
}
if (starts_with_at(src, t, "module")) {
const d = parse_module_decl_ast(src, k);
vec_push(decls, d.decl);
k = d.nextPos;
continue;
}
panic_at(src, t, "expected fn or module inside module");
}
return ParsedDeclAst(decl_module(span(start, k), modName.text, decls), k);
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
if ((!(k < stringLen(src)))) {
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
if ((!(k < stringLen(src)))) {
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
out = (out + (((("import { " + names) + " } from \"") + importPath) + "\";\n"));
}
return ParsedImports(out, k);
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
if ((!(t < stringLen(src)))) {
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
entries = (entries + ((fn2.v2 + ": ") + ((((prefix + "__") + modName.text) + "__") + fn2.v2)));
} else {
entries = (entries + (((", " + fn2.v2) + ": ") + ((((prefix + "__") + modName.text) + "__") + fn2.v2)));
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
entries = (entries + ((prop + ": ") + prop));
} else {
entries = (entries + (((", " + prop) + ": ") + prop));
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
export function parse_fn_decl2(src, i, exportAll) {
let k = parse_keyword(src, i, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
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
warn_short_identifier(src, name.startPos, name.text);
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
if ((!(pi < stringLen(params.v0)))) {
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
fields = (fields + ((nameOnly + ": ") + nameOnly));
} else {
fields = (fields + (((", " + nameOnly) + ": ") + nameOnly));
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
export function parse_struct_decl(src, i) {
let k = parse_keyword(src, i, "struct");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 60))) {
k = skip_angle_brackets(src, t0);
}
k = parse_keyword(src, k, "{");
const fields = vec_new();
while (true) {
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
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
warn_short_identifier(src, _name.startPos, _name.text);
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
out = (out + ((((header + variant) + " = (value) => ({ tag: \"") + variant) + "\", value });\n"));
} else {
out = (out + ((((header + variant) + " = { tag: \"") + variant) + "\" };\n"));
}
const t2 = skip_ws(src, k);
if ((!(t2 < stringLen(src)))) {
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
