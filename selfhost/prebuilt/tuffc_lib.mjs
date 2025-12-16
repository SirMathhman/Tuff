// compiled by selfhost tuffc
import { println, panic, readTextFile, writeTextFile, pathDirname, pathJoin, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "./rt/vec.mjs";
import { set_current_file, panic_at, reset_errors, reset_warnings, panic_if_errors, emit_errors, emit_warnings, reset_struct_defs, add_struct_def, find_struct_fields, is_identifier_too_short, warn_short_identifier, get_error_infos, get_warning_infos, get_current_file, line_col_at, DiagInfo, LineCol } from "./util/diagnostics.mjs";
import { is_digit, is_space, is_ident_start, is_ident_part, skip_ws, starts_with_at } from "./util/lexing.mjs";
import { ParsedNumber, ParsedIdent, ParsedBool, parse_keyword, parse_number, parse_ident, parse_module_path, module_path_to_relpath, parse_optional_semicolon, parse_required_semicolon } from "./parsing/primitives.mjs";
import { ParsedType, parse_type_expr, skip_angle_brackets, skip_type_expr } from "./parsing/types.mjs";
import { ParsedExpr, ParsedMain, ParsedStmt, ParsedParams, ParsedExprAst } from "./parsing/expr_stmt_types.mjs";
import { parse_expr, parse_stmt, parse_main_body, parse_mut_opt, is_assign_stmt_start, is_field_assign_stmt_start, is_index_assign_stmt_start, parse_expr_ast } from "./parsing/expr_stmt.mjs";
import { ParsedImports, ParsedFn, parse_imports, parse_extern_decl, parse_module_decl, parse_fn_decl2, parse_class_fn_decl2, parse_struct_decl, parse_type_union_decl, parse_param_list, parse_fn_decl_named, parse_fn_decl } from "./parsing/decls_legacy.mjs";
import { ParsedDeclAst, ParsedDeclsAst, parse_imports_ast, parse_extern_decl_ast, parse_module_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2, parse_struct_decl_ast, parse_type_union_decl_ast, parse_type_params_list_ast } from "./parsing/decls.mjs";
import { span, span_start, span_end, decl_let, decl_let_typed } from "./ast.mjs";
import { emit_decl_js } from "./emit/ast_js.mjs";
import { set_current_file_path, emit_runtime_vec_imports_js, decls_needs_vec_rt } from "./emit/emit_helpers.mjs";
import { analyze_program, analyze_program_with_fns, mk_fn_sig, check_file_size } from "./analyzer.mjs";
import { ParsedProgramWithTrivia, parse_program_with_trivia } from "./util/formatting.mjs";
import { lsp_check_file_impl } from "./compile/lsp_check.mjs";
import { DefLocation, lsp_find_definition_impl } from "./compile/lsp_definition.mjs";
import { str_list_contains, str_list_remove } from "./compile/string_lists.mjs";
import { parse_deprecated_reason_from_comment, deprecation_reason_before } from "./compile/deprecation_comments.mjs";
import { module_index, fnsig_lookup_by_name, scan_top_level_fn_exports } from "./compile/export_scan.mjs";
import { cached_scan_top_level_fn_exports } from "./compile/export_scan_cache.mjs";
import { workspace_root_from_path, compiler_root_from_path } from "./compile/paths.mjs";
import { collect_module_graph_info, project_compile_one_module_with, project_lint_one_module_with } from "./compile/project_compile.mjs";
import { compile_code_with, lint_code_with } from "./compile/in_memory.mjs";
export function __lsp_type_mention_smoke(x) {
return undefined;
}
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
export function parse_program_with_trivia_api(src, exportAll) {
return parse_program_with_trivia(src, exportAll);
}
export function compile_tiny2(src, requireMain, exportAll, filePath) {
return compile_tiny2_with_imported_fns(src, requireMain, exportAll, filePath, vec_new());
}
export function compile_tiny2_with_imported_fns(src, requireMain, exportAll, filePath, importedFns) {
let i = 0;
reset_struct_defs();
reset_errors();
reset_warnings();
let out = "// compiled by selfhost tuffc\n";
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
if (f.decl.tag == "DFn" && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
if (f.decl.tag == "DClassFn" && f.decl.name == "main") {
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
if (f.decl.tag == "DClassFn" && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, exportAll);
if (f.decl.tag == "DFn" && f.decl.name == "main") {
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
analyze_program_with_fns(src, decls, importedFns);
panic_if_errors();
emit_warnings();
set_current_file_path(filePath);
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
let i = 0;
reset_struct_defs();
reset_errors();
reset_warnings();
check_file_size(src);
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
if (f.decl.tag == "DFn" && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
if (f.decl.tag == "DClassFn" && f.decl.name == "main") {
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
if (f.decl.tag == "DClassFn" && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, exportAll);
if (f.decl.tag == "DFn" && f.decl.name == "main") {
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
analyze_program_with_fns(src, decls, importedFns);
panic_if_errors();
emit_warnings();
return undefined;
}
export function lint_tiny2_collect_with_imported_fns(src, requireMain, exportAll, importedFns) {
let i = 0;
reset_struct_defs();
reset_errors();
reset_warnings();
check_file_size(src);
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
if (f.decl.tag == "DFn" && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
if (f.decl.tag == "DClassFn" && f.decl.name == "main") {
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
if (f.decl.tag == "DClassFn" && f.decl.name == "main") {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, exportAll);
if (f.decl.tag == "DFn" && f.decl.name == "main") {
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
analyze_program_with_fns(src, decls, importedFns);
return [get_error_infos(), get_warning_infos()];
}
export function compile_tiny(src) {
return compile_tiny2(src, true, false, "main.mjs");
}
export function compile_module(src) {
return compile_tiny2(src, false, true, "module.mjs");
}
export function compile_code(entryCode, moduleLookup) {
return compile_code_with(compile_tiny2_with_imported_fns, entryCode, moduleLookup);
}
export function lint_code(entryCode, moduleLookup) {
return lint_code_with(lint_tiny2_collect_with_imported_fns, entryCode, moduleLookup);
}
export function compile_project(entryPath, outPath) {
const outDir = pathDirname(outPath);
const workspaceRoot = workspace_root_from_path(entryPath);
const isCompilerBuild = stringLen(compiler_root_from_path(entryPath)) > 0;
const graph = collect_module_graph_info(entryPath, workspaceRoot, isCompilerBuild, readTextFile);
const order = graph[0];
const modulePaths = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
let oi = 0;
while (oi < vec_len(order)) {
const path = vec_get(order, oi);
set_current_file(path);
const src = readTextFile(path);
const r = project_compile_one_module_with(compile_tiny2_with_imported_fns, src, path, entryPath, outDir, outPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
const outFile = r[1];
const js = r[2];
writeTextFile(outFile, js);
oi = oi + 1;
}
return undefined;
}
export function compile_project_to_outputs(entryPath, outPath, readSource) {
const outDir = pathDirname(outPath);
const workspaceRoot = workspace_root_from_path(entryPath);
const isCompilerBuild = stringLen(compiler_root_from_path(entryPath)) > 0;
const graph = collect_module_graph_info(entryPath, workspaceRoot, isCompilerBuild, readSource);
const order = graph[0];
const modulePaths = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
const outFiles = vec_new();
const jsOutputs = vec_new();
let oi = 0;
while (oi < vec_len(order)) {
const path = vec_get(order, oi);
set_current_file(path);
const src = readSource(path);
const r = project_compile_one_module_with(compile_tiny2_with_imported_fns, src, path, entryPath, outDir, outPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
const outFile = r[1];
const js = r[2];
vec_push(outFiles, outFile);
vec_push(jsOutputs, js);
oi = oi + 1;
}
return [outFiles, jsOutputs];
}
export function fluff_project(entryPath) {
fluff_project_with_reader(entryPath, readTextFile);
return undefined;
}
export function fluff_project_with_reader(entryPath, readSource) {
const workspaceRoot = workspace_root_from_path(entryPath);
const isCompilerBuild = stringLen(compiler_root_from_path(entryPath)) > 0;
const graph = collect_module_graph_info(entryPath, workspaceRoot, isCompilerBuild, readSource);
const order = graph[0];
const modulePaths = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
let oi = 0;
while (oi < vec_len(order)) {
const path = vec_get(order, oi);
set_current_file(path);
const src = readSource(path);
project_lint_one_module_with(lint_tiny2_with_imported_fns, src, path, entryPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
oi = oi + 1;
}
return undefined;
}
export function lsp_check_file(src, filePath) {
return lsp_check_file_impl(src, filePath);
}
export function lsp_get_errors() {
return get_error_infos();
}
export function lsp_get_warnings() {
return get_warning_infos();
}
export function lsp_line_col(src, offset) {
return line_col_at(src, offset);
}
export function lsp_find_definition(src, offset, filePath) {
return lsp_find_definition_impl(src, offset, filePath);
}
