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
import { compile_tiny2_with_imported_fns, lint_tiny2_with_imported_fns, lint_tiny2_collect_with_imported_fns } from "./compile/single_file_ops.mjs";
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
export function parse_program_with_trivia_api(src, exportAll) {
return parse_program_with_trivia(src, exportAll);
}
export function compile_code(entryCode, moduleLookup) {
return compile_code_with(compile_tiny2_with_imported_fns, entryCode, moduleLookup);
}
export function lint_code(entryCode, moduleLookup) {
return lint_code_with(lint_tiny2_collect_with_imported_fns, entryCode, moduleLookup);
}
export function compile_tiny(src) {
return compile_tiny2_with_imported_fns(src, true, false, "main.mjs", vec_new());
}
export function compile_module(src) {
return compile_tiny2_with_imported_fns(src, false, true, "module.mjs", vec_new());
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
export function fluff_files_with_reader(filePaths, readSource) {
if (vec_len(filePaths) == 0) {
return;
}
const entryPath = vec_get(filePaths, 0);
const workspaceRoot = workspace_root_from_path(entryPath);
const isCompilerBuild = stringLen(compiler_root_from_path(entryPath)) > 0;
let modulePaths = vec_new();
let moduleOutFns = vec_new();
let modulePrivateTopLevelFnNames = vec_new();
let fi = 0;
while (fi < vec_len(filePaths)) {
const rootPath = vec_get(filePaths, fi);
const graph = collect_module_graph_info(rootPath, workspaceRoot, isCompilerBuild, readSource);
const gPaths = graph[1];
const gOutFns = graph[2];
const gPrivate = graph[3];
let gi = 0;
while (gi < vec_len(gPaths)) {
const p = vec_get(gPaths, gi);
if (module_index(modulePaths, p) == -1) {
vec_push(modulePaths, p);
vec_push(moduleOutFns, vec_get(gOutFns, gi));
vec_push(modulePrivateTopLevelFnNames, vec_get(gPrivate, gi));
}
gi = gi + 1;
}
fi = fi + 1;
}
let ti = 0;
while (ti < vec_len(filePaths)) {
const path = vec_get(filePaths, ti);
set_current_file(path);
const src = readSource(path);
project_lint_one_module_with(lint_tiny2_with_imported_fns, src, path, "", workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
ti = ti + 1;
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
