// compiled by selfhost tuffc
import { println, panic, readTextFile, writeTextFile, pathDirname, pathJoin, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "./rt/vec.mjs";
import { set_current_file, panic_at, reset_errors, reset_warnings, panic_if_errors, emit_errors, emit_warnings, reset_struct_defs, add_struct_def, find_struct_fields, is_identifier_too_short, warn_short_identifier, get_error_infos, get_warning_infos, get_current_file, line_col_at, DiagInfo, LineCol } from "./util/diagnostics.mjs";
import { is_digit, is_space, is_ident_start, is_ident_part, skip_ws, starts_with_at } from "./util/lexing.mjs";
import { ParsedNumber, ParsedIdent, ParsedBool, parse_keyword, parse_number, parse_ident, parse_module_path, module_path_to_relpath, parse_optional_semicolon, parse_required_semicolon } from "./parsing/primitives.mjs";
import { ParsedType, parse_type_expr, skip_angle_brackets, skip_type_expr } from "./parsing/types.mjs";
import { ParsedExpr, ParsedMain, ParsedStmt, ParsedParams, parse_expr, parse_stmt, parse_main_body, parse_mut_opt, is_assign_stmt_start, is_field_assign_stmt_start, is_index_assign_stmt_start } from "./parsing/expr_stmt.mjs";
import { ParsedExprAst, parse_expr_ast } from "./parsing/expr_stmt.mjs";
import { ParsedImports, ParsedFn, parse_imports, parse_extern_decl, parse_module_decl, parse_fn_decl2, parse_class_fn_decl2, parse_struct_decl, parse_type_union_decl, parse_param_list, parse_fn_decl_named, parse_fn_decl } from "./parsing/decls_legacy.mjs";
import { ParsedDeclAst, ParsedDeclsAst, parse_imports_ast, parse_extern_decl_ast, parse_module_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2, parse_struct_decl_ast, parse_type_union_decl_ast, parse_type_params_list_ast } from "./parsing/decls.mjs";
import { span, span_start, span_end, decl_let, decl_let_typed } from "./ast.mjs";
import { emit_decl_js } from "./emit/ast_js.mjs";
import { set_current_file_path, emit_runtime_vec_imports_js, decls_needs_vec_rt } from "./emit/emit_helpers.mjs";
import { analyze_program, analyze_program_with_fns, mk_fn_sig, check_file_size } from "./analyzer.mjs";
import { ParsedProgramWithTrivia, parse_program_with_trivia } from "./util/formatting.mjs";
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
let __tuffc_scan_cache = vec_new();
export function ScanCacheEntry(path, outSigs, privateNames, allSigs) {
return { path: path, outSigs: outSigs, privateNames: privateNames, allSigs: allSigs };
}
export function cached_scan_top_level_fn_exports(path, src) {
let i = 0;
while (i < vec_len(__tuffc_scan_cache)) {
const e = vec_get(__tuffc_scan_cache, i);
if (e.path == path) {
return [e.outSigs, e.privateNames, e.allSigs];
}
i = i + 1;
}
const ex = scan_top_level_fn_exports(src);
vec_push(__tuffc_scan_cache, ScanCacheEntry(path, ex[0], ex[1], ex[2]));
return ex;
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
export function find_substring(hay, needle) {
let i = 0;
while (i + stringLen(needle) <= stringLen(hay)) {
if (starts_with_at(hay, i, needle)) {
return i;
}
i = i + 1;
}
return -1;
}
export function workspace_root_from_path(p) {
let i = find_substring(p, "\\src\\");
if (i != -1) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "/src/");
if (i != -1) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "\\std\\");
if (i != -1) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "/std/");
if (i != -1) {
return stringSlice(p, 0, i);
}
return pathDirname(p);
}
export function compiler_root_from_path(p) {
const needle1 = "\\src\\main\\tuff\\compiler\\";
let i = find_substring(p, needle1);
if (i != -1) {
return stringSlice(p, 0, i + stringLen(needle1));
}
const needle2 = "/src/main/tuff/compiler/";
i = find_substring(p, needle2);
if (i != -1) {
return stringSlice(p, 0, i + stringLen(needle2));
}
return "";
}
export function str_list_contains(xs, s) {
let i = 0;
while (i < vec_len(xs)) {
if (vec_get(xs, i) == s) {
return true;
}
i = i + 1;
}
return false;
}
export function str_list_remove(xs, s) {
const out = vec_new();
let i = 0;
while (i < vec_len(xs)) {
const v = vec_get(xs, i);
if (!(v == s)) {
vec_push(out, v);
}
i = i + 1;
}
return out;
}
export function is_ascii_ws(ch) {
return ch == 32 || ch == 9 || ch == 10 || ch == 13;
}
export function is_ascii_space_tab(ch) {
return ch == 32 || ch == 9;
}
export function ascii_lower(ch) {
if (ch >= 65 && ch <= 90) {
return ch + 32;
}
return ch;
}
export function trim_ascii_ws(s) {
let start = 0;
let end = stringLen(s);
while (start < end && is_ascii_ws(stringCharCodeAt(s, start))) {
start = start + 1;
}
while (end > start && is_ascii_ws(stringCharCodeAt(s, end - 1))) {
end = end - 1;
}
return stringSlice(s, start, end);
}
export function starts_with_deprecated_ci(s) {
if (stringLen(s) < 10) {
return false;
}
let i = 0;
while (i < 10) {
const ch = ascii_lower(stringCharCodeAt(s, i));
const want = stringCharCodeAt("deprecated", i);
if (ch != want) {
return false;
}
i = i + 1;
}
return true;
}
export function parse_deprecated_reason_from_comment(commentText) {
const t0 = trim_ascii_ws(commentText);
if (!starts_with_deprecated_ci(t0)) {
return "";
}
let i = 10;
while (i < stringLen(t0) && is_ascii_ws(stringCharCodeAt(t0, i))) {
i = i + 1;
}
if (i >= stringLen(t0)) {
return "";
}
const sep = stringCharCodeAt(t0, i);
if (!(sep == 45 || sep == 58)) {
return "";
}
i = i + 1;
while (i < stringLen(t0) && is_ascii_ws(stringCharCodeAt(t0, i))) {
i = i + 1;
}
return trim_ascii_ws(stringSlice(t0, i, stringLen(t0)));
}
export function skip_ws_back(src, pos) {
let i = pos;
while (i > 0 && is_ascii_ws(stringCharCodeAt(src, i - 1))) {
i = i - 1;
}
return i;
}
export function line_start(src, pos) {
let i = pos;
while (i > 0 && stringCharCodeAt(src, i - 1) != 10) {
i = i - 1;
}
return i;
}
export function line_end(src, pos) {
let i = pos;
while (i < stringLen(src) && stringCharCodeAt(src, i) != 10) {
i = i + 1;
}
return i;
}
export function block_comment_start(src, endStarPos) {
let i = endStarPos;
while (i >= 2) {
if (stringCharCodeAt(src, i - 2) == 47 && stringCharCodeAt(src, i - 1) == 42) {
return i - 2;
}
i = i - 1;
}
return -1;
}
export function deprecation_reason_before(src, pos) {
let k = pos;
while (true) {
k = skip_ws_back(src, k);
if (k <= 0) {
return "";
}
if (k >= 2 && stringCharCodeAt(src, k - 2) == 42 && stringCharCodeAt(src, k - 1) == 47) {
const start = block_comment_start(src, k - 2);
if (start == -1) {
return "";
}
const inner = stringSlice(src, start + 2, k - 2);
const reason = parse_deprecated_reason_from_comment(inner);
if (reason != "") {
return reason;
}
k = start;
continue;
}
const ls = line_start(src, k);
let p = ls;
while (p < k && is_ascii_space_tab(stringCharCodeAt(src, p))) {
p = p + 1;
}
if (p + 1 < stringLen(src) && stringCharCodeAt(src, p) == 47 && stringCharCodeAt(src, p + 1) == 47) {
const le = line_end(src, p + 2);
const inner = stringSlice(src, p + 2, le);
const reason = parse_deprecated_reason_from_comment(inner);
if (reason != "") {
return reason;
}
k = ls;
continue;
}
return "";
}
return undefined;
}
export function module_index(modulePaths, path) {
let i = 0;
while (i < vec_len(modulePaths)) {
if (vec_get(modulePaths, i) == path) {
return i;
}
i = i + 1;
}
return -1;
}
export function fnsig_lookup_by_name(fns, name) {
let i = 0;
while (i < vec_len(fns)) {
const s = vec_get(fns, i);
if (s.name == name) {
return s;
}
i = i + 1;
}
return mk_fn_sig("", "", vec_new(), vec_new(), vec_new(), "");
}
export function scan_top_level_fn_exports(src) {
const outSigs = vec_new();
const privateNames = vec_new();
const allSigs = vec_new();
let decls = vec_new();
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
if (!starts_with_at(src, j, "module")) {
break;
}
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
}
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
break;
}
while (true) {
const j = skip_ws(src, i);
if (!starts_with_at(src, j, "let")) {
break;
}
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
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "fn")) {
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "out")) {
const k0 = parse_keyword(src, i, "out");
const j2 = skip_ws(src, k0);
if (starts_with_at(src, j2, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
let di = 0;
while (di < vec_len(decls)) {
const d = vec_get(decls, di);
if (d.tag == "DFn") {
const depReason = deprecation_reason_before(src, span_start(d.span));
const sig = mk_fn_sig(d.name, depReason, d.typeParams, d.params, d.paramTyAnns, d.retTyAnn);
vec_push(allSigs, sig);
if (d.isOut) {
vec_push(outSigs, sig);
} else {
vec_push(privateNames, d.name);
}
}
if (d.tag == "DClassFn") {
const depReason = deprecation_reason_before(src, span_start(d.span));
const sig = mk_fn_sig(d.name, depReason, d.typeParams, d.params, d.paramTyAnns, d.retTyAnn);
vec_push(allSigs, sig);
if (d.isOut) {
vec_push(outSigs, sig);
} else {
vec_push(privateNames, d.name);
}
}
di = di + 1;
}
return [outSigs, privateNames, allSigs];
}
export function project_imported_fn_sigs(src, path, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames) {
const importedFns = vec_new();
const seedImportedFns = !(stringLen(compiler_root_from_path(path)) > 0);
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
const rel = module_path_to_relpath(imp.modulePath);
let baseDir = pathDirname(path);
const compilerSrcPrefix = "src::main::tuff::compiler::";
let rel2 = rel;
if (starts_with_at(imp.modulePath, 0, compilerSrcPrefix)) {
const compilerRootDir = pathJoin(workspaceRoot, "src/main/tuff/compiler");
baseDir = compilerRootDir;
const rest = stringSlice(imp.modulePath, stringLen(compilerSrcPrefix), stringLen(imp.modulePath));
rel2 = module_path_to_relpath(rest);
} else {
if (starts_with_at(imp.modulePath, 0, "src::") || starts_with_at(imp.modulePath, 0, "std::")) {
baseDir = workspaceRoot;
} else {
const cr = compiler_root_from_path(path);
if (stringLen(cr) > 0) {
baseDir = cr;
}
}
}
const depPath = pathJoin(baseDir, rel2 + ".tuff");
const depIdx = module_index(modulePaths, depPath);
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
export function project_out_paths(path, entryPath, outDir, outPath, workspaceRoot) {
const crHere = compiler_root_from_path(path);
const relRoot = (stringLen(crHere) > 0 ? crHere : workspaceRoot);
let prefixLen = stringLen(relRoot);
let relStart = prefixLen;
if (relStart < stringLen(path)) {
const ch = stringCharCodeAt(path, relStart);
if (ch == 47 || ch == 92) {
relStart = relStart + 1;
}
}
const relSrcPath = stringSlice(path, relStart, stringLen(path));
const relNoExt = stringSlice(relSrcPath, 0, stringLen(relSrcPath) - 5);
const outRelPath = (path == entryPath ? (() => {
let pfx = stringLen(outDir);
let s = pfx;
if (s < stringLen(outPath)) {
const ch2 = stringCharCodeAt(outPath, s);
if (ch2 == 47 || ch2 == 92) {
s = s + 1;
}
}
return stringSlice(outPath, s, stringLen(outPath));
})() : (() => {
return relNoExt + ".mjs";
})());
const outFile = (path == entryPath ? outPath : pathJoin(outDir, relNoExt + ".mjs"));
return [outRelPath, outFile];
}
export function project_compile_one_module(src, path, entryPath, outDir, outPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames) {
const importedFns = project_imported_fn_sigs(src, path, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
const paths = project_out_paths(path, entryPath, outDir, outPath, workspaceRoot);
const outRelPath = paths[0];
const outFile = paths[1];
const js = compile_tiny2_with_imported_fns(src, path == entryPath, isCompilerBuild, outRelPath, importedFns);
return [outRelPath, outFile, js];
}
export function project_lint_one_module(src, path, entryPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames) {
const importedFns = vec_new();
const seedImportedFns = !isCompilerBuild && !(stringLen(compiler_root_from_path(path)) > 0);
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
const rel = module_path_to_relpath(imp.modulePath);
let baseDir = pathDirname(path);
const compilerSrcPrefix = "src::main::tuff::compiler::";
let rel2 = rel;
if (starts_with_at(imp.modulePath, 0, compilerSrcPrefix)) {
const compilerRootDir = pathJoin(workspaceRoot, "src/main/tuff/compiler");
baseDir = compilerRootDir;
const rest = stringSlice(imp.modulePath, stringLen(compilerSrcPrefix), stringLen(imp.modulePath));
rel2 = module_path_to_relpath(rest);
} else {
if (starts_with_at(imp.modulePath, 0, "src::") || starts_with_at(imp.modulePath, 0, "std::")) {
baseDir = workspaceRoot;
} else {
const cr = compiler_root_from_path(path);
if (stringLen(cr) > 0) {
baseDir = cr;
}
}
}
const depPath = pathJoin(baseDir, rel2 + ".tuff");
const depIdx = module_index(modulePaths, depPath);
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
lint_tiny2_with_imported_fns(src, path == entryPath, isCompilerBuild, importedFns);
return undefined;
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
if (str_list_contains(visiting, depKey)) {
panic_at(src, j, "circular dependency detected");
}
vec_push(stack, depKey);
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
const r = project_compile_one_module(src, path, entryPath, outDir, outPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
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
const r = project_compile_one_module(src, path, entryPath, outDir, outPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
const outFile = r[1];
const js = r[2];
vec_push(outFiles, outFile);
vec_push(jsOutputs, js);
oi = oi + 1;
}
return [outFiles, jsOutputs];
}
export function collect_module_graph_info(entryPath, workspaceRoot, isCompilerBuild, readSource) {
let stack = vec_new();
vec_push(stack, entryPath);
let visited = vec_new();
let visiting = vec_new();
let order = vec_new();
let modulePaths = vec_new();
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
const path = stringSlice(item, 5, stringLen(item));
visiting = str_list_remove(visiting, path);
vec_push(order, path);
continue;
}
const path = item;
if (str_list_contains(visited, path)) {
continue;
}
vec_push(visited, path);
vec_push(visiting, path);
vec_push(stack, "POST:" + path);
set_current_file(path);
const src = readSource(path);
const ex = cached_scan_top_level_fn_exports(path, src);
vec_push(modulePaths, path);
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
const compilerSrcPrefix = "src::main::tuff::compiler::";
let rel = module_path_to_relpath(mod.text);
let baseDir = pathDirname(path);
if (starts_with_at(mod.text, 0, compilerSrcPrefix)) {
const compilerRootDir = pathJoin(workspaceRoot, "src/main/tuff/compiler");
baseDir = compilerRootDir;
const rest = stringSlice(mod.text, stringLen(compilerSrcPrefix), stringLen(mod.text));
rel = module_path_to_relpath(rest);
} else {
if (starts_with_at(mod.text, 0, "src::") || starts_with_at(mod.text, 0, "std::")) {
baseDir = workspaceRoot;
} else {
const cr = compiler_root_from_path(path);
if (stringLen(cr) > 0) {
baseDir = cr;
}
}
}
const depPath = pathJoin(baseDir, rel + ".tuff");
if (str_list_contains(visiting, depPath)) {
panic_at(src, j, "circular dependency detected");
}
vec_push(stack, depPath);
}
}
return [order, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames];
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
project_lint_one_module(src, path, entryPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
oi = oi + 1;
}
return undefined;
}
export function lsp_check_file(src, filePath) {
reset_struct_defs();
reset_errors();
reset_warnings();
set_current_file(filePath);
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
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "out")) {
const k0 = parse_keyword(src, i, "out");
const j2 = skip_ws(src, k0);
if (starts_with_at(src, j2, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
analyze_program(src, decls);
return vec_len(get_error_infos()) == 0;
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
export function lsp_resolve_module_path(modulePath, currentFilePath) {
const workspaceRoot = workspace_root_from_path(currentFilePath);
const rel = module_path_to_relpath(modulePath);
let baseDir = pathDirname(currentFilePath);
const compilerSrcPrefix = "src::main::tuff::compiler::";
let rel2 = rel;
(starts_with_at(modulePath, 0, compilerSrcPrefix) ? (() => {
const compilerRootDir = pathJoin(workspaceRoot, "src/main/tuff/compiler");
baseDir = compilerRootDir;
const rest = stringSlice(modulePath, stringLen(compilerSrcPrefix), stringLen(modulePath));
rel2 = module_path_to_relpath(rest);
return undefined;
})() : (() => {
return (starts_with_at(modulePath, 0, "src::") || starts_with_at(modulePath, 0, "std::") ? (() => {
baseDir = workspaceRoot;
return undefined;
})() : (() => {
const cr = compiler_root_from_path(currentFilePath);
if (stringLen(cr) > 0) {
baseDir = cr;
}
return undefined;
})());
})());
return pathJoin(baseDir, rel2 + ".tuff");
}
export function DefLocation(found, defStart, defEnd, defFile) {
return { found: found, defStart: defStart, defEnd: defEnd, defFile: defFile };
}
export function lsp_def(name, defStart, defEnd, kind) {
return ({ tag: "LspDef", name: name, defStart: defStart, defEnd: defEnd, kind: kind, defFile: "" });
}
export function lsp_def_ext(name, defStart, defEnd, kind, defFile) {
return ({ tag: "LspDef", name: name, defStart: defStart, defEnd: defEnd, kind: kind, defFile: defFile });
}
export function lsp_ref(refStart, refEnd, defStart, defEnd) {
return ({ tag: "LspRef", refStart: refStart, refEnd: refEnd, defStart: defStart, defEnd: defEnd, defFile: "" });
}
export function lsp_ref_ext(refStart, refEnd, defStart, defEnd, defFile) {
return ({ tag: "LspRef", refStart: refStart, refEnd: refEnd, defStart: defStart, defEnd: defEnd, defFile: defFile });
}
export function lsp_lookup(defs, name) {
let i = vec_len(defs) - 1;
while (i >= 0) {
const d = vec_get(defs, i);
if (d.name == name) {
return d;
}
i = i - 1;
}
return lsp_def("", -1, -1, "");
}
export function lsp_lookup_type(defs, name) {
let i = vec_len(defs) - 1;
while (i >= 0) {
const d = vec_get(defs, i);
if (d.name == name && (d.kind == "struct" || d.kind == "type")) {
return d;
}
i = i - 1;
}
return lsp_def("", -1, -1, "");
}
export function lsp_lookup_field(defs, structName, fieldName) {
const fullName = structName + "." + fieldName;
let i = 0;
while (i < vec_len(defs)) {
const d = vec_get(defs, i);
if (d.name == fullName && d.kind == "field") {
return d;
}
i = i + 1;
}
return lsp_def("", -1, -1, "");
}
export function lsp_in_range(offset, start, end) {
return offset >= start && offset < end;
}
export function lsp_collect_decls(decls, defs, filePath) {
let i = 0;
while (i < vec_len(decls)) {
lsp_collect_decl(vec_get(decls, i), defs, filePath);
i = i + 1;
}
return undefined;
}
export function lsp_collect_decl(d, defs, filePath) {
if (d.tag == "DExternFrom") {
let ni = 0;
while (ni < vec_len(d.names)) {
vec_push(defs, lsp_def(vec_get(d.names, ni), span_start(d.span), span_end(d.span), "extern"));
ni = ni + 1;
}
}
if (d.tag == "DImport") {
const targetFile = lsp_resolve_module_path(d.modulePath, filePath);
let ni = 0;
while (ni < vec_len(d.names)) {
vec_push(defs, lsp_def_ext(vec_get(d.names, ni), 0, 0, "import", targetFile));
ni = ni + 1;
}
}
if (d.tag == "DLet") {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "var"));
}
if (d.tag == "DFn") {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "fn"));
}
if (d.tag == "DClassFn") {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "fn"));
}
if (d.tag == "DStruct") {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "struct"));
let fi = 0;
while (fi < vec_len(d.fields)) {
const fieldName = vec_get(d.fields, fi);
vec_push(defs, lsp_def(d.name + "." + fieldName, span_start(d.span), span_end(d.span), "field"));
fi = fi + 1;
}
}
if (d.tag == "DTypeUnion") {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "type"));
let vi = 0;
while (vi < vec_len(d.variants)) {
const v = vec_get(d.variants, vi);
vec_push(defs, lsp_def(v.name, span_start(v.span), span_end(v.span), "variant"));
vi = vi + 1;
}
}
if (d.tag == "DModule") {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "module"));
lsp_collect_decls(d.decls, defs, filePath);
}
return undefined;
}
export function lsp_resolve_expr(e, defs, refs) {
if (e.tag == "EIdent") {
const d = lsp_lookup(defs, e.name);
if (d.defStart >= 0 || stringLen(d.defFile) > 0) {
vec_push(refs, lsp_ref_ext(span_start(e.span), span_end(e.span), d.defStart, d.defEnd, d.defFile));
}
return "";
}
if (e.tag == "EStructLit") {
let structName = "";
let nameSpan = e.span;
if (e.nameExpr.tag == "EIdent") {
structName = e.nameExpr.name;
nameSpan = e.nameExpr.span;
}
if (e.nameExpr.tag == "EPath") {
if (vec_len(e.nameExpr.parts) > 0) {
structName = vec_get(e.nameExpr.parts, vec_len(e.nameExpr.parts) - 1);
nameSpan = e.nameExpr.span;
}
}
if (stringLen(structName) > 0) {
const tyDef = lsp_lookup_type(defs, structName);
if (tyDef.defStart >= 0 || stringLen(tyDef.defFile) > 0) {
vec_push(refs, lsp_ref_ext(span_start(nameSpan), span_end(nameSpan), tyDef.defStart, tyDef.defEnd, tyDef.defFile));
}
}
let vi = 0;
while (vi < vec_len(e.values)) {
lsp_resolve_expr(vec_get(e.values, vi), defs, refs);
vi = vi + 1;
}
return structName;
}
if (e.tag == "EField") {
const baseTy = lsp_resolve_expr(e.base, defs, refs);
if (stringLen(baseTy) > 0) {
const fieldDef = lsp_lookup_field(defs, baseTy, e.field);
if (fieldDef.defStart >= 0) {
const fieldStart = span_end(e.base.span) + 1;
vec_push(refs, lsp_ref_ext(fieldStart, span_end(e.span), fieldDef.defStart, fieldDef.defEnd, fieldDef.defFile));
}
}
return "";
}
if (e.tag == "ECall") {
lsp_resolve_expr(e.callee, defs, refs);
let ai = 0;
while (ai < vec_len(e.args)) {
lsp_resolve_expr(vec_get(e.args, ai), defs, refs);
ai = ai + 1;
}
}
if (e.tag == "EBinary") {
lsp_resolve_expr(e.left, defs, refs);
lsp_resolve_expr(e.right, defs, refs);
}
if (e.tag == "EUnary") {
lsp_resolve_expr(e.expr, defs, refs);
}
if (e.tag == "EIf") {
lsp_resolve_expr(e.cond, defs, refs);
lsp_resolve_expr(e.thenExpr, defs, refs);
lsp_resolve_expr(e.elseExpr, defs, refs);
}
if (e.tag == "EBlock") {
lsp_resolve_stmts(e.body, defs, refs);
lsp_resolve_expr(e.tail, defs, refs);
}
if (e.tag == "ELambda") {
let pi = 0;
while (pi < vec_len(e.params)) {
vec_push(defs, lsp_def(vec_get(e.params, pi), span_start(e.span), span_end(e.span), "param"));
pi = pi + 1;
}
lsp_resolve_expr(e.body, defs, refs);
}
if (e.tag == "EMatch") {
lsp_resolve_expr(e.scrut, defs, refs);
let mi = 0;
while (mi < vec_len(e.arms)) {
const arm = vec_get(e.arms, mi);
let bi = 0;
while (bi < vec_len(arm.bindings)) {
vec_push(defs, lsp_def(vec_get(arm.bindings, bi), span_start(arm.span), span_end(arm.span), "binding"));
bi = bi + 1;
}
lsp_resolve_expr(arm.expr, defs, refs);
mi = mi + 1;
}
}
if (e.tag == "EIndex") {
lsp_resolve_expr(e.base, defs, refs);
lsp_resolve_expr(e.index, defs, refs);
}
if (e.tag == "ETupleIndex") {
lsp_resolve_expr(e.base, defs, refs);
}
if (e.tag == "EVecLit") {
let ii = 0;
while (ii < vec_len(e.items)) {
lsp_resolve_expr(vec_get(e.items, ii), defs, refs);
ii = ii + 1;
}
}
if (e.tag == "ETupleLit") {
let ii = 0;
while (ii < vec_len(e.items)) {
lsp_resolve_expr(vec_get(e.items, ii), defs, refs);
ii = ii + 1;
}
}
return "";
}
export function lsp_resolve_stmt(s, defs, refs) {
if (s.tag == "SLet") {
lsp_resolve_expr(s.init, defs, refs);
vec_push(defs, lsp_def(s.name, span_start(s.span), span_end(s.span), "var"));
}
if (s.tag == "SAssign") {
const d = lsp_lookup(defs, s.name);
if (d.defStart >= 0) {
vec_push(refs, lsp_ref(span_start(s.span), span_start(s.span) + stringLen(s.name), d.defStart, d.defEnd));
}
lsp_resolve_expr(s.value, defs, refs);
}
if (s.tag == "SExpr") {
lsp_resolve_expr(s.expr, defs, refs);
}
if (s.tag == "SYield") {
lsp_resolve_expr(s.expr, defs, refs);
}
if (s.tag == "SWhile") {
lsp_resolve_expr(s.cond, defs, refs);
lsp_resolve_stmts(s.body, defs, refs);
}
if (s.tag == "SIf") {
lsp_resolve_expr(s.cond, defs, refs);
lsp_resolve_stmts(s.thenBody, defs, refs);
if (s.hasElse) {
lsp_resolve_stmts(s.elseBody, defs, refs);
}
}
if (s.tag == "SIndexAssign") {
lsp_resolve_expr(s.base, defs, refs);
lsp_resolve_expr(s.index, defs, refs);
lsp_resolve_expr(s.value, defs, refs);
}
if (s.tag == "SFieldAssign") {
lsp_resolve_expr(s.base, defs, refs);
lsp_resolve_expr(s.value, defs, refs);
}
return undefined;
}
export function lsp_resolve_stmts(stmts, defs, refs) {
let i = 0;
while (i < vec_len(stmts)) {
lsp_resolve_stmt(vec_get(stmts, i), defs, refs);
i = i + 1;
}
return undefined;
}
export function lsp_resolve_decl(d, defs, refs) {
if (d.tag == "DLet") {
lsp_resolve_expr(d.init, defs, refs);
}
if (d.tag == "DFn") {
let pi = 0;
while (pi < vec_len(d.params)) {
vec_push(defs, lsp_def(vec_get(d.params, pi), span_start(d.span), span_end(d.span), "param"));
pi = pi + 1;
}
lsp_resolve_stmts(d.body, defs, refs);
lsp_resolve_expr(d.tail, defs, refs);
}
if (d.tag == "DClassFn") {
let pi = 0;
while (pi < vec_len(d.params)) {
vec_push(defs, lsp_def(vec_get(d.params, pi), span_start(d.span), span_end(d.span), "param"));
pi = pi + 1;
}
lsp_resolve_stmts(d.body, defs, refs);
lsp_resolve_expr(d.tail, defs, refs);
}
if (d.tag == "DModule") {
lsp_resolve_decls(d.decls, defs, refs);
}
return undefined;
}
export function lsp_resolve_decls(decls, defs, refs) {
let i = 0;
while (i < vec_len(decls)) {
lsp_resolve_decl(vec_get(decls, i), defs, refs);
i = i + 1;
}
return undefined;
}
export function lsp_find_ref_at(refs, offset) {
let i = 0;
while (i < vec_len(refs)) {
const r = vec_get(refs, i);
if (lsp_in_range(offset, r.refStart, r.refEnd)) {
return r;
}
i = i + 1;
}
return lsp_ref_ext(-1, -1, -1, -1, "");
}
export function lsp_ident_at(src, offset) {
if (offset < 0 || offset >= stringLen(src)) {
return "";
}
let i = offset;
if (!is_ident_part(stringCharCodeAt(src, i)) && i > 0 && is_ident_part(stringCharCodeAt(src, i - 1))) {
i = i - 1;
}
if (!is_ident_part(stringCharCodeAt(src, i))) {
return "";
}
let start = i;
while (start > 0 && is_ident_part(stringCharCodeAt(src, start - 1))) {
start = start - 1;
}
if (!is_ident_start(stringCharCodeAt(src, start))) {
return "";
}
let end = i + 1;
while (end < stringLen(src) && is_ident_part(stringCharCodeAt(src, end))) {
end = end + 1;
}
return stringSlice(src, start, end);
}
export function lsp_has_double_colon(s) {
let i = 0;
while (i + 1 < stringLen(s)) {
if (stringCharCodeAt(s, i) == 58 && stringCharCodeAt(s, i + 1) == 58) {
return true;
}
i = i + 1;
}
return false;
}
export function lsp_is_module_path_part(code) {
return is_ident_part(code) || code == 58;
}
export function lsp_module_path_at(src, offset) {
if (offset < 0 || offset >= stringLen(src)) {
return "";
}
let i = offset;
if (!lsp_is_module_path_part(stringCharCodeAt(src, i)) && i > 0 && lsp_is_module_path_part(stringCharCodeAt(src, i - 1))) {
i = i - 1;
}
if (!lsp_is_module_path_part(stringCharCodeAt(src, i))) {
return "";
}
let start = i;
while (start > 0 && lsp_is_module_path_part(stringCharCodeAt(src, start - 1))) {
start = start - 1;
}
let end = i + 1;
while (end < stringLen(src) && lsp_is_module_path_part(stringCharCodeAt(src, end))) {
end = end + 1;
}
let s = stringSlice(src, start, end);
while (stringLen(s) > 0 && stringCharCodeAt(s, 0) == 58) {
s = stringSlice(s, 1, stringLen(s));
}
while (stringLen(s) > 0 && stringCharCodeAt(s, stringLen(s) - 1) == 58) {
s = stringSlice(s, 0, stringLen(s) - 1);
}
if (!lsp_has_double_colon(s)) {
return "";
}
return s;
}
export function lsp_find_definition(src, offset, filePath) {
reset_struct_defs();
reset_errors();
reset_warnings();
set_current_file(filePath);
const decls = lsp_parse_file(src);
const defs = vec_new();
const refs = vec_new();
lsp_collect_decls(decls, defs, filePath);
lsp_resolve_decls(decls, defs, refs);
const r = lsp_find_ref_at(refs, offset);
if (r.refStart < 0) {
const modulePath = lsp_module_path_at(src, offset);
if (stringLen(modulePath) > 0) {
const targetFile = lsp_resolve_module_path(modulePath, filePath);
return DefLocation(true, 0, 0, targetFile);
}
const ident = lsp_ident_at(src, offset);
if (stringLen(ident) > 0) {
const d = lsp_lookup(defs, ident);
if (d.defStart >= 0 || stringLen(d.defFile) > 0) {
return DefLocation(true, d.defStart, d.defEnd, d.defFile);
}
}
return DefLocation(false, 0, 0, "");
}
return DefLocation(true, r.defStart, r.defEnd, r.defFile);
}
export function lsp_parse_file(src) {
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
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "out")) {
const k0 = parse_keyword(src, i, "out");
const j2 = skip_ws(src, k0);
if (starts_with_at(src, j2, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
return decls;
}
