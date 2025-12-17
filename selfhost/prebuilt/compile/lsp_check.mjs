// compiled by selfhost tuffc
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { set_current_file, reset_errors, reset_warnings, reset_struct_defs, get_error_infos } from "../util/diagnostics.mjs";
import { is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_keyword, parse_ident, parse_optional_semicolon } from "../parsing/primitives.mjs";
import { parse_type_expr } from "../parsing/types.mjs";
import { parse_mut_opt, parse_expr_ast } from "../parsing/expr_stmt.mjs";
import { parse_imports_ast, parse_extern_decl_ast, parse_module_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2, parse_struct_decl_ast, parse_type_union_decl_ast, is_fn_decl_start } from "../parsing/decls.mjs";
import { span, decl_let, decl_let_typed } from "../ast.mjs";
import { analyze_program } from "../analyzer.mjs";
export function kw_at(src, i, kw) {
if (!starts_with_at(src, i, kw)) {
return false;
}
const end = i + stringLen(kw);
if (end < stringLen(src) && is_ident_part(stringCharCodeAt(src, end))) {
return false;
}
return true;
}
export function is_extern_decl_start(src, i) {
const j = skip_ws(src, i);
if (kw_at(src, j, "extern")) {
const k = skip_ws(src, j + 6);
if (kw_at(src, k, "fn")) {
return false;
}
if (kw_at(src, k, "out")) {
return false;
}
if (kw_at(src, k, "class")) {
return false;
}
if (kw_at(src, k, "extern")) {
return false;
}
return true;
}
if (kw_at(src, j, "out")) {
const k = skip_ws(src, j + 3);
if (kw_at(src, k, "extern")) {
const m = skip_ws(src, k + 6);
if (kw_at(src, m, "fn")) {
return false;
}
if (kw_at(src, m, "class")) {
return false;
}
if (kw_at(src, m, "extern")) {
return false;
}
return true;
}
}
return false;
}
export function lsp_parse_file_impl(src) {
const decls = vec_new();
let i = 0;
while (true) {
if (is_extern_decl_start(src, i)) {
const ex = parse_extern_decl_ast(src, i);
vec_push(decls, ex.decl);
i = ex.nextPos;
continue;
}
break;
}
const imps = parse_imports_ast(src, i);
let ii = 0;
while (ii < vec_len(imps.decls)) {
vec_push(decls, vec_get(imps.decls, ii));
ii = ii + 1;
}
i = imps.nextPos;
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "module")) {
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
continue;
}
if (starts_with_at(src, j, "type")) {
const td = parse_type_union_decl_ast(src, i, false);
vec_push(decls, td.decl);
i = td.nextPos;
continue;
}
if (starts_with_at(src, j, "struct")) {
const sd = parse_struct_decl_ast(src, i);
vec_push(decls, sd.decl);
i = sd.nextPos;
continue;
}
if (starts_with_at(src, j, "let")) {
const start = skip_ws(src, i);
i = parse_keyword(src, i, "let");
const mutOpt = parse_mut_opt(src, i);
i = mutOpt.nextPos;
const name = parse_ident(src, i);
i = name.nextPos;
let tyAnn = "";
const t0 = skip_ws(src, i);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 58) {
const _ty = parse_type_expr(src, t0 + 1);
tyAnn = _ty.v0;
i = _ty.v1;
}
i = parse_keyword(src, i, "=");
const expr = parse_expr_ast(src, i);
i = expr.nextPos;
i = parse_optional_semicolon(src, i);
if (tyAnn == "") {
vec_push(decls, decl_let(span(start, i), mutOpt.ok, name.text, expr.expr));
} else {
vec_push(decls, decl_let_typed(span(start, i), mutOpt.ok, name.text, tyAnn, expr.expr));
}
continue;
}
if (starts_with_at(src, j, "fn")) {
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (is_fn_decl_start(src, j)) {
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
return decls;
}
export function lsp_check_file_impl(src, filePath) {
reset_struct_defs();
reset_errors();
reset_warnings();
set_current_file(filePath);
const decls = lsp_parse_file_impl(src);
analyze_program(src, decls);
return vec_len(get_error_infos()) == 0;
}
