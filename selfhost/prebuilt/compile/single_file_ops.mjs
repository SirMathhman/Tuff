// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { reset_errors, reset_warnings, reset_struct_defs, panic_at, panic_if_errors, emit_warnings, get_error_infos, get_warning_infos, DiagInfo } from "../util/diagnostics.mjs";
import { skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_ident, parse_keyword, parse_optional_semicolon } from "../parsing/primitives.mjs";
import { parse_type_expr } from "../parsing/types.mjs";
import { parse_mut_opt, parse_expr_ast } from "../parsing/expr_stmt.mjs";
import { parse_extern_decl_ast, parse_imports_ast, parse_module_decl_ast, parse_type_union_decl_ast, parse_struct_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2 } from "../parsing/decls.mjs";
import { span, decl_let, decl_let_typed } from "../ast.mjs";
import { analyze_program_with_fns, check_file_size, check_clones } from "../analyzer.mjs";
import { decls_needs_vec_rt, emit_runtime_vec_imports_js, set_current_file_path } from "../emit/emit_helpers.mjs";
import { emit_decl_js } from "../emit/ast_js.mjs";
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
export function is_ident_part(ch) {
if (ch >= 48 && ch <= 57) {
return true;
}
if (ch >= 65 && ch <= 90) {
return true;
}
if (ch >= 97 && ch <= 122) {
return true;
}
if (ch == 95) {
return true;
}
return false;
}
export function is_extern_decl_start(src, i) {
const j = skip_ws(src, i);
if (kw_at(src, j, "extern")) {
return true;
}
if (kw_at(src, j, "out")) {
const k = skip_ws(src, j + 3);
if (kw_at(src, k, "extern")) {
return true;
}
}
return false;
}
export function ParsedProgram(decls, sawMain) {
return { decls: decls, sawMain: sawMain };
}
export function parse_program_decls(src, exportAll, requireMain) {
let i = 0;
const decls = vec_new();
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
let sawMain = false;
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "module")) {
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
continue;
}
if (starts_with_at(src, j, "type")) {
const td = parse_type_union_decl_ast(src, i, exportAll);
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
const f = parse_fn_decl_ast2(src, i, exportAll);
if ((f.decl.tag === "DFn") && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
if ((f.decl.tag === "DClassFn") && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "out")) {
const k0 = parse_keyword(src, i, "out");
const j2 = skip_ws(src, k0);
if (starts_with_at(src, j2, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
if ((f.decl.tag === "DClassFn") && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, exportAll);
if ((f.decl.tag === "DFn") && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
if (requireMain && !sawMain) {
panic_at(src, i, "expected fn main");
}
return ParsedProgram(decls, sawMain);
}
export function compile_tiny2(src, requireMain, exportAll, filePath) {
return compile_tiny2_with_imported_fns(src, requireMain, exportAll, filePath, vec_new());
}
export function compile_tiny2_with_imported_fns(src, requireMain, exportAll, filePath, importedFns) {
reset_struct_defs();
reset_errors();
reset_warnings();
const parsed = parse_program_decls(src, exportAll, requireMain);
const decls = parsed.decls;
analyze_program_with_fns(src, decls, importedFns);
panic_if_errors();
emit_warnings();
set_current_file_path(filePath);
let out = "// compiled by selfhost tuffc\n";
if (decls_needs_vec_rt(decls)) {
out = out + emit_runtime_vec_imports_js();
}
let di = 0;
while (di < vec_len(decls)) {
out = out + emit_decl_js(vec_get(decls, di), exportAll);
di = di + 1;
}
return out;
}
export function lint_tiny2_with_imported_fns(src, requireMain, exportAll, importedFns) {
reset_struct_defs();
reset_errors();
reset_warnings();
check_file_size(src);
const parsed = parse_program_decls(src, exportAll, requireMain);
const decls = parsed.decls;
analyze_program_with_fns(src, decls, importedFns);
check_clones(src, decls);
panic_if_errors();
emit_warnings();
return undefined;
}
export function lint_tiny2_collect_with_imported_fns(src, requireMain, exportAll, importedFns) {
reset_struct_defs();
reset_errors();
reset_warnings();
check_file_size(src);
const parsed = parse_program_decls(src, exportAll, requireMain);
const decls = parsed.decls;
analyze_program_with_fns(src, decls, importedFns);
return [get_error_infos(), get_warning_infos()];
}
export function compile_tiny(src) {
return compile_tiny2(src, true, false, "main.mjs");
}
export function compile_module(src) {
return compile_tiny2(src, false, true, "module.mjs");
}
