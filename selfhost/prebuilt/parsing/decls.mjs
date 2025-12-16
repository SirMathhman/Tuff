// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
import { panic_at, add_struct_def, is_identifier_too_short, warn_short_identifier } from "../util/diagnostics.mjs";
import { skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_ident, parse_keyword, parse_module_path, parse_optional_semicolon } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { ParsedMainAst } from "./expr_stmt_types.mjs";
import { parse_main_body_ast } from "./expr_stmt.mjs";
import { span, decl_extern_from, decl_extern_type, decl_import, decl_fn, decl_fn_typed, decl_class_fn, decl_class_fn_typed, decl_struct_typed, decl_type_union, type_union_variant, type_union_variant_typed, decl_module } from "../ast.mjs";
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
export function ParsedTypeParamsAst(params, nextPos) {
return { params: params, nextPos: nextPos };
}
export function parse_name_list_ast(src, i) {
let k = parse_keyword(src, i, "{");
k = skip_ws(src, k);
const names = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 125) {
return ParsedNamesAst(names, k + 1);
}
while (true) {
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '}'");
}
if (stringCharCodeAt(src, k) == 125) {
return ParsedNamesAst(names, k + 1);
}
const id = parse_ident(src, k);
vec_push(names, id.text);
k = skip_ws(src, id.nextPos);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 44) {
k = k + 1;
continue;
}
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 125) {
return ParsedNamesAst(names, k + 1);
}
panic_at(src, k, "expected ',' or '}' in name list");
}
return ParsedNamesAst(names, k);
}
export function parse_type_params_list_ast(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 60)) {
return ParsedTypeParamsAst(vec_new(), i);
}
k = k + 1;
k = skip_ws(src, k);
const params = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 62) {
return ParsedTypeParamsAst(params, k + 1);
}
while (true) {
const id = parse_ident(src, k);
vec_push(params, id.text);
k = skip_ws(src, id.nextPos);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '>' in type params");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
k = skip_ws(src, k);
continue;
}
if (ch == 62) {
return ParsedTypeParamsAst(params, k + 1);
}
panic_at(src, k, "expected ',' or '>' in type params");
}
return ParsedTypeParamsAst(params, k);
}
export function parse_param_list_ast(src, i) {
let k = parse_keyword(src, i, "(");
k = skip_ws(src, k);
const names = vec_new();
const tyAnns = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedParamsAst(names, tyAnns, k + 1);
}
while (true) {
const id = parse_ident(src, k);
k = id.nextPos;
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 58) {
const _ty = parse_type_expr(src, t0 + 1);
vec_push(tyAnns, _ty.v0);
k = _ty.v1;
} else {
vec_push(tyAnns, "");
}
vec_push(names, id.text);
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in param list");
}
const c = stringCharCodeAt(src, k);
if (c == 44) {
k = k + 1;
continue;
}
if (c == 41) {
return ParsedParamsAst(names, tyAnns, k + 1);
}
panic_at(src, k, "expected ',' or ')' in param list");
}
return ParsedParamsAst(names, tyAnns, k);
}
export function parse_extern_decl_ast(src, i) {
const start = skip_ws(src, i);
let k = start;
let isOut = false;
const j0 = skip_ws(src, k);
if (starts_with_at(src, j0, "out")) {
k = parse_keyword(src, k, "out");
isOut = true;
}
k = parse_keyword(src, k, "extern");
const j1 = skip_ws(src, k);
if (starts_with_at(src, j1, "from")) {
k = parse_keyword(src, k, "from");
const mod = parse_module_path(src, k);
k = parse_keyword(src, mod.nextPos, "use");
const names = parse_name_list_ast(src, k);
k = parse_optional_semicolon(src, names.nextPos);
return ParsedDeclAst(decl_extern_from(span(start, k), mod.text, names.names), k);
}
if (starts_with_at(src, j1, "type")) {
k = parse_keyword(src, k, "type");
const name = parse_ident(src, k);
k = name.nextPos;
let typeParams = vec_new();
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 60) {
const tp = parse_type_params_list_ast(src, t0);
typeParams = tp.params;
k = tp.nextPos;
}
k = parse_optional_semicolon(src, k);
return ParsedDeclAst(decl_extern_type(span(start, k), isOut, name.text, typeParams), k);
}
panic_at(src, j1, "expected 'from' or 'type' after extern");
return ParsedDeclAst(decl_extern_from(span(start, k), "", vec_new()), k);
}
export function parse_imports_ast(src, i) {
let k = i;
const decls = vec_new();
while (true) {
const j = skip_ws(src, k);
if (starts_with_at(src, j, "import")) {
panic_at(src, j, "`import` is not supported. Use `from <module> use { ... };` instead.");
}
if (!starts_with_at(src, j, "from")) {
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
export function ParsedFnLike(start, isOut, name, typeParams, params, retTyAnn, body, nextPos) {
return { start: start, isOut: isOut, name: name, typeParams: typeParams, params: params, retTyAnn: retTyAnn, body: body, nextPos: nextPos };
}
export function parse_fn_like_header(src, i, isClassFn) {
const start = skip_ws(src, i);
let k = start;
let isOut = false;
const j0 = skip_ws(src, k);
if (starts_with_at(src, j0, "out")) {
k = parse_keyword(src, k, "out");
isOut = true;
}
if (isClassFn) {
k = parse_keyword(src, k, "class");
}
k = parse_keyword(src, k, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
let typeParams = vec_new();
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 60) {
const tp = parse_type_params_list_ast(src, t0);
typeParams = tp.params;
k = tp.nextPos;
}
const params = parse_param_list_ast(src, k);
k = params.nextPos;
const t1 = skip_ws(src, k);
let retTyAnn = "";
if (t1 < stringLen(src) && stringCharCodeAt(src, t1) == 58) {
const _rt = parse_type_expr(src, t1 + 1);
retTyAnn = _rt.v0;
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body_ast(src, k);
k = body.nextPos;
k = parse_optional_semicolon(src, k);
return ParsedFnLike(start, isOut, name, typeParams, params, retTyAnn, body, k);
}
export function parse_fn_decl_ast2(src, i, exportAll) {
const fn = parse_fn_like_header(src, i, false);
let anyParamTy = false;
let pi = 0;
while (pi < vec_len(fn.params.tyAnns)) {
if (vec_get(fn.params.tyAnns, pi) != "") {
anyParamTy = true;
break;
}
pi = pi + 1;
}
if (anyParamTy || fn.retTyAnn != "") {
return ParsedDeclAst(decl_fn_typed(span(fn.start, fn.nextPos), fn.isOut, fn.name.text, fn.typeParams, fn.params.names, fn.params.tyAnns, fn.retTyAnn, fn.body.body, fn.body.tail), fn.nextPos);
}
return ParsedDeclAst(decl_fn(span(fn.start, fn.nextPos), fn.isOut, fn.name.text, fn.params.names, fn.body.body, fn.body.tail), fn.nextPos);
}
export function parse_class_fn_decl_ast2(src, i, exportAll) {
const fn = parse_fn_like_header(src, i, true);
let anyParamTy = false;
let pi = 0;
while (pi < vec_len(fn.params.tyAnns)) {
if (vec_get(fn.params.tyAnns, pi) != "") {
anyParamTy = true;
break;
}
pi = pi + 1;
}
if (anyParamTy || fn.retTyAnn != "") {
return ParsedDeclAst(decl_class_fn_typed(span(fn.start, fn.nextPos), fn.isOut, fn.name.text, fn.typeParams, fn.params.names, fn.params.tyAnns, fn.retTyAnn, fn.body.body, fn.body.tail), fn.nextPos);
}
return ParsedDeclAst(decl_class_fn(span(fn.start, fn.nextPos), fn.isOut, fn.name.text, fn.params.names, fn.body.body, fn.body.tail), fn.nextPos);
}
export function parse_struct_decl_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "struct");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
let typeParams = vec_new();
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 60) {
const tp = parse_type_params_list_ast(src, t0);
typeParams = tp.params;
k = tp.nextPos;
}
k = parse_keyword(src, k, "{");
const fields = vec_new();
const fieldTyAnns = vec_new();
while (true) {
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '}'");
}
if (stringCharCodeAt(src, k) == 125) {
k = k + 1;
break;
}
const field = parse_ident(src, k);
k = parse_keyword(src, field.nextPos, ":");
const _ty = parse_type_expr(src, k);
k = _ty.v1;
vec_push(fields, field.text);
vec_push(fieldTyAnns, _ty.v0);
k = skip_ws(src, k);
if (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 44 || ch == 59) {
k = k + 1;
}
}
}
add_struct_def(name.text, fields);
return ParsedDeclAst(decl_struct_typed(span(start, k), name.text, typeParams, fields, fieldTyAnns), k);
}
export function parse_type_union_decl_ast(src, i, exportAll) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "type");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
let typeParams = vec_new();
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 60) {
const tp = parse_type_params_list_ast(src, t0);
typeParams = tp.params;
k = tp.nextPos;
}
k = parse_keyword(src, k, "=");
const variants = vec_new();
let first = true;
while (true) {
if (!first) {
k = parse_keyword(src, k, "|");
}
first = false;
const vStart = skip_ws(src, k);
const v = parse_ident(src, vStart);
k = v.nextPos;
const t1 = skip_ws(src, k);
if (t1 < stringLen(src) && stringCharCodeAt(src, t1) == 60) {
let pk = parse_keyword(src, t1, "<");
const payloadTyAnns = vec_new();
while (true) {
const a = parse_type_expr(src, pk);
vec_push(payloadTyAnns, a.v0);
pk = skip_ws(src, a.v1);
if (!(pk < stringLen(src))) {
panic_at(src, pk, "expected '>' in union variant payload");
}
const chp = stringCharCodeAt(src, pk);
if (chp == 44) {
pk = pk + 1;
pk = skip_ws(src, pk);
continue;
}
if (chp == 62) {
k = pk + 1;
break;
}
panic_at(src, pk, "expected ',' or '>' in union variant payload");
}
vec_push(variants, type_union_variant_typed(span(vStart, k), v.text, payloadTyAnns));
} else {
vec_push(variants, type_union_variant(span(vStart, k), v.text, false));
}
const t2 = skip_ws(src, k);
if (!(t2 < stringLen(src))) {
break;
}
const ch = stringCharCodeAt(src, t2);
if (ch == 59) {
k = t2 + 1;
break;
}
if (ch == 124) {
continue;
}
panic_at(src, t2, "expected '|' or ';' in union type");
}
return ParsedDeclAst(decl_type_union(span(start, k), name.text, typeParams, variants), k);
}
export function parse_module_decl_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "module");
const modName = parse_ident(src, k);
k = parse_keyword(src, modName.nextPos, "{");
const decls = vec_new();
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src))) {
panic_at(src, t, "expected '}'");
}
if (stringCharCodeAt(src, t) == 125) {
k = t + 1;
break;
}
if (starts_with_at(src, t, "fn") || starts_with_at(src, t, "out")) {
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
