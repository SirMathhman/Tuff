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
export function mem_read(entryCode, moduleLookup, key) {
if (key == "entry") {
return entryCode;
}
return moduleLookup(key);
}
export function mem_collect_module_graph_info(entryCode, moduleLookup, isCompilerBuild) {
const entryKey = "entry";
let stack = vec_new();
vec_push(stack, entryKey);
let visited = vec_new();
let visiting = vec_new();
let order = vec_new();
let moduleKeys = vec_new();
let moduleOutFns = vec_new();
let modulePrivateTopLevelFnNames = vec_new();
while (vec_len(stack) > 0) {
const item = vec_get(stack, vec_len(stack) - 1);
let newStack = vec_new();
let qi = 0;
while (qi + 1 < vec_len(stack)) {
vec_push(newStack, vec_get(stack, qi));
qi = qi + 1;
}
stack = newStack;
if (starts_with_at(item, 0, "POST:")) {
const key = stringSlice(item, 5, stringLen(item));
visiting = str_list_remove(visiting, key);
vec_push(order, key);
continue;
}
const key = item;
if (str_list_contains(visited, key)) {
continue;
}
vec_push(visited, key);
vec_push(visiting, key);
vec_push(stack, "POST:" + key);
const src = mem_read(entryCode, moduleLookup, key);
set_current_file(key);
const ex = cached_scan_top_level_fn_exports(key, src);
vec_push(moduleKeys, key);
if (isCompilerBuild) {
vec_push(moduleOutFns, ex[2]);
vec_push(modulePrivateTopLevelFnNames, vec_new());
} else {
vec_push(moduleOutFns, ex[0]);
vec_push(modulePrivateTopLevelFnNames, ex[1]);
}
let scan = 0;
while (true) {
if (is_extern_decl_start(src, scan)) {
const ex2 = parse_extern_decl(src, scan);
scan = ex2.v1;
continue;
}
break;
}
while (true) {
const j = skip_ws(src, scan);
if (starts_with_at(src, j, "import")) {
panic_at(src, j, "`import` is not supported. Use `from <module> use { ... };` instead.");
}
if (!starts_with_at(src, j, "from")) {
break;
}
scan = parse_keyword(src, scan, "from");
const mod = parse_module_path(src, scan);
scan = mod.nextPos;
scan = parse_keyword(src, scan, "use");
scan = parse_keyword(src, scan, "{");
while (true) {
scan = skip_ws(src, scan);
if (!(scan < stringLen(src))) {
panic_at(src, scan, "expected '}'");
}
if (stringCharCodeAt(src, scan) == 125) {
scan = scan + 1;
break;
}
const id = parse_ident(src, scan);
scan = id.nextPos;
scan = skip_ws(src, scan);
if (scan < stringLen(src) && stringCharCodeAt(src, scan) == 44) {
scan = scan + 1;
continue;
}
scan = skip_ws(src, scan);
if (scan < stringLen(src) && stringCharCodeAt(src, scan) == 125) {
scan = scan + 1;
break;
}
panic_at(src, scan, "expected ',' or '}' in import list");
}
scan = parse_optional_semicolon(src, scan);
const depKey = mod.text;
if (!str_list_contains(visiting, depKey)) {
vec_push(stack, depKey);
}
}
}
return [order, moduleKeys, moduleOutFns, modulePrivateTopLevelFnNames];
}
export function mem_imported_fn_sigs(src, key, isCompilerBuild, moduleKeys, moduleOutFns, modulePrivateTopLevelFnNames) {
const importedFns = vec_new();
const seedImportedFns = !isCompilerBuild;
if (!isCompilerBuild) {
let scan = 0;
while (true) {
if (is_extern_decl_start(src, scan)) {
const ex2 = parse_extern_decl(src, scan);
scan = ex2.v1;
continue;
}
break;
}
const impsAst = parse_imports_ast(src, scan);
let ii = 0;
while (ii < vec_len(impsAst.decls)) {
const imp = vec_get(impsAst.decls, ii);
if (imp.tag == "DImport") {
const depKey = imp.modulePath;
const depIdx = module_index(moduleKeys, depKey);
if (depIdx != -1) {
const outFns = vec_get(moduleOutFns, depIdx);
const privateNames = vec_get(modulePrivateTopLevelFnNames, depIdx);
let ni = 0;
while (ni < vec_len(imp.names)) {
const name = vec_get(imp.names, ni);
const sig = fnsig_lookup_by_name(outFns, name);
if (!(sig.name == "")) {
if (seedImportedFns) {
vec_push(importedFns, sig);
}
} else {
if (str_list_contains(privateNames, name)) {
panic_at(src, span_start(imp.span), "imported function '" + name + "' is not exported (missing `out fn`)");
}
}
ni = ni + 1;
}
}
}
ii = ii + 1;
}
}
return importedFns;
}
export function compile_code(entryCode, moduleLookup) {
const isCompilerBuild = false;
const graph = mem_collect_module_graph_info(entryCode, moduleLookup, isCompilerBuild);
const order = graph[0];
const moduleKeys = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
const outRelPaths = vec_new();
const jsOutputs = vec_new();
let oi = 0;
while (oi < vec_len(order)) {
const key = vec_get(order, oi);
const src = mem_read(entryCode, moduleLookup, key);
set_current_file(key);
const importedFns = mem_imported_fn_sigs(src, key, isCompilerBuild, moduleKeys, moduleOutFns, modulePrivateTopLevelFnNames);
const outRelPath = (key == "entry" ? "entry.mjs" : module_path_to_relpath(key) + ".mjs");
const js = compile_tiny2_with_imported_fns(src, key == "entry", isCompilerBuild, outRelPath, importedFns);
vec_push(outRelPaths, outRelPath);
vec_push(jsOutputs, js);
oi = oi + 1;
}
return [outRelPaths, jsOutputs];
}
export function lint_code(entryCode, moduleLookup) {
const isCompilerBuild = false;
const graph = mem_collect_module_graph_info(entryCode, moduleLookup, isCompilerBuild);
const order = graph[0];
const moduleKeys = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
const allErrors = vec_new();
const allWarnings = vec_new();
let oi = 0;
while (oi < vec_len(order)) {
const key = vec_get(order, oi);
const src = mem_read(entryCode, moduleLookup, key);
set_current_file(key);
const importedFns = mem_imported_fn_sigs(src, key, isCompilerBuild, moduleKeys, moduleOutFns, modulePrivateTopLevelFnNames);
const r = lint_tiny2_collect_with_imported_fns(src, key == "entry", isCompilerBuild, importedFns);
const errs = r[0];
const warns = r[1];
let ei = 0;
while (ei < vec_len(errs)) {
vec_push(allErrors, vec_get(errs, ei));
ei = ei + 1;
}
let wi = 0;
while (wi < vec_len(warns)) {
vec_push(allWarnings, vec_get(warns, wi));
wi = wi + 1;
}
oi = oi + 1;
}
return [allErrors, allWarnings];
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
