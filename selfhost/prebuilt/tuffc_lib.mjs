// compiled by selfhost tuffc
import { println, panic, readTextFile, writeTextFile, pathDirname, pathJoin, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "./rt/vec.mjs";
import { set_current_file, panic_at, reset_struct_defs, add_struct_def, find_struct_fields, is_identifier_too_short, warn_short_identifier } from "./util/diagnostics.mjs";
import { is_digit, is_space, is_ident_start, is_ident_part, skip_ws, starts_with_at } from "./util/lexing.mjs";
import { ParsedNumber, ParsedIdent, ParsedBool, parse_keyword, parse_number, parse_ident, parse_module_path, module_path_to_relpath, parse_optional_semicolon, parse_required_semicolon } from "./parsing/primitives.mjs";
import { ParsedType, parse_type_expr, skip_angle_brackets, skip_type_expr } from "./parsing/types.mjs";
import { ParsedExpr, ParsedMain, ParsedStmt, ParsedParams, parse_expr, parse_stmt, parse_main_body, parse_mut_opt, is_assign_stmt_start, is_field_assign_stmt_start, is_index_assign_stmt_start } from "./parsing/expr_stmt.mjs";
import { ParsedExprAst, parse_expr_ast } from "./parsing/expr_stmt.mjs";
import { ParsedImports, ParsedFn, parse_imports, parse_extern_decl, parse_module_decl, parse_fn_decl2, parse_class_fn_decl2, parse_struct_decl, parse_type_union_decl, parse_param_list, parse_fn_decl_named, parse_fn_decl } from "./parsing/decls.mjs";
import { ParsedDeclAst, ParsedDeclsAst, parse_imports_ast, parse_extern_decl_ast, parse_module_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2, parse_struct_decl_ast, parse_type_union_decl_ast } from "./parsing/decls.mjs";
import { span, decl_let } from "./ast.mjs";
import { emit_decl_js, set_current_file_path } from "./emit/ast_js.mjs";
import { analyze_program } from "./analyzer.mjs";
import { ParsedProgramWithTrivia, parse_program_with_trivia } from "./util/formatting.mjs";
export function parse_program_with_trivia_api(src, exportAll) {
return parse_program_with_trivia(src, exportAll);
}
export function compile_tiny2(src, requireMain, exportAll, filePath) {
let i = 0;
reset_struct_defs();
let out = "// compiled by selfhost tuffc\n";
const decls = vec_new();
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "extern")) {
const ex = parse_extern_decl_ast(src, i);
vec_push(decls, ex.decl);
i = ex.nextPos;
continue;
}
break;
}
const imps = parse_imports_ast(src, i);
let ii = 0;
while ((ii < vec_len(imps.decls))) {
vec_push(decls, vec_get(imps.decls, ii));
ii = (ii + 1);
}
i = imps.nextPos;
while (true) {
const j = skip_ws(src, i);
if ((!starts_with_at(src, j, "module"))) {
break;
}
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
}
while (true) {
const j = skip_ws(src, i);
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
break;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "let")) {
const start = skip_ws(src, i);
i = parse_keyword(src, i, "let");
const mutOpt = parse_mut_opt(src, i);
i = mutOpt.nextPos;
const name = parse_ident(src, i);
i = name.nextPos;
const t0 = skip_ws(src, i);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
i = _ty.v1;
}
i = parse_keyword(src, i, "=");
const expr = parse_expr_ast(src, i);
i = expr.nextPos;
i = parse_optional_semicolon(src, i);
vec_push(decls, decl_let(span(start, i), mutOpt.ok, name.text, expr.expr));
continue;
}
break;
}
let sawMain = false;
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "fn")) {
const f = parse_fn_decl_ast2(src, i, exportAll);
if (((f.decl.tag == "DFn") && (f.decl.name == "main"))) {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, exportAll);
if (((f.decl.tag == "DClassFn") && (f.decl.name == "main"))) {
sawMain = true;
}
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
if ((requireMain && (!sawMain))) {
panic_at(src, i, "expected fn main");
}
analyze_program(src, decls);
set_current_file_path(filePath);
let di = 0;
while ((di < vec_len(decls))) {
out = (out + emit_decl_js(vec_get(decls, di), exportAll));
di = (di + 1);
}
return out;
}
export function compile_tiny(src) {
return compile_tiny2(src, true, false, "main.tuff");
}
export function compile_module(src) {
return compile_tiny2(src, false, true, "module.tuff");
}
export function find_substring(hay, needle) {
let i = 0;
while (((i + stringLen(needle)) <= stringLen(hay))) {
if (starts_with_at(hay, i, needle)) {
return i;
}
i = (i + 1);
}
return (-1);
}
export function workspace_root_from_path(p) {
let i = find_substring(p, "\\src\\");
if ((i != (-1))) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "/src/");
if ((i != (-1))) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "\\std\\");
if ((i != (-1))) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "/std/");
if ((i != (-1))) {
return stringSlice(p, 0, i);
}
return pathDirname(p);
}
export function compiler_root_from_path(p) {
const needle1 = "\\src\\main\\tuff\\compiler\\";
let i = find_substring(p, needle1);
if ((i != (-1))) {
return stringSlice(p, 0, (i + stringLen(needle1)));
}
const needle2 = "/src/main/tuff/compiler/";
i = find_substring(p, needle2);
if ((i != (-1))) {
return stringSlice(p, 0, (i + stringLen(needle2)));
}
return "";
}
export function compile_project(entryPath, outPath) {
const outDir = pathDirname(outPath);
const entryDir = pathDirname(entryPath);
const workspaceRoot = workspace_root_from_path(entryPath);
let queue = vec_new();
vec_push(queue, entryPath);
let done = vec_new();
while ((vec_len(queue) > 0)) {
const path = vec_get(queue, (vec_len(queue) - 1));
set_current_file(path);
let newQ = vec_new();
let qi = 0;
while (((qi + 1) < vec_len(queue))) {
vec_push(newQ, vec_get(queue, qi));
qi = (qi + 1);
}
queue = newQ;
let already = false;
let di = 0;
while ((di < vec_len(done))) {
if ((vec_get(done, di) == path)) {
already = true;
break;
}
di = (di + 1);
}
if (already) {
continue;
}
vec_push(done, path);
const src = readTextFile(path);
let scan = 0;
while (true) {
const j = skip_ws(src, scan);
if (starts_with_at(src, j, "extern")) {
const ex = parse_extern_decl(src, scan);
scan = ex.v1;
continue;
}
break;
}
while (true) {
const j = skip_ws(src, scan);
if (starts_with_at(src, j, "import")) {
panic_at(src, j, "`import` is not supported. Use `from <module> use { ... };` instead.");
}
if ((!starts_with_at(src, j, "from"))) {
break;
}
scan = parse_keyword(src, scan, "from");
const mod = parse_module_path(src, scan);
scan = mod.nextPos;
scan = parse_keyword(src, scan, "use");
scan = parse_keyword(src, scan, "{");
while (true) {
scan = skip_ws(src, scan);
if ((!(scan < stringLen(src)))) {
panic_at(src, scan, "expected '}'");
}
if ((stringCharCodeAt(src, scan) == 125)) {
scan = (scan + 1);
break;
}
const id = parse_ident(src, scan);
scan = id.nextPos;
scan = skip_ws(src, scan);
if (((scan < stringLen(src)) && (stringCharCodeAt(src, scan) == 44))) {
scan = (scan + 1);
continue;
}
scan = skip_ws(src, scan);
if (((scan < stringLen(src)) && (stringCharCodeAt(src, scan) == 125))) {
scan = (scan + 1);
break;
}
panic_at(src, scan, "expected ',' or '}' in import list");
}
scan = parse_optional_semicolon(src, scan);
const rel = module_path_to_relpath(mod.text);
let baseDir = pathDirname(path);
if ((starts_with_at(mod.text, 0, "src::") || starts_with_at(mod.text, 0, "std::"))) {
baseDir = workspaceRoot;
} else {
const cr = compiler_root_from_path(path);
if ((stringLen(cr) > 0)) {
baseDir = cr;
}
}
const depPath = pathJoin(baseDir, (rel + ".tuff"));
vec_push(queue, depPath);
}
let prefixLen = stringLen(entryDir);
let relStart = prefixLen;
if ((relStart < stringLen(path))) {
const ch = stringCharCodeAt(path, relStart);
if (((ch == 47) || (ch == 92))) {
relStart = (relStart + 1);
}
}
const relPath = stringSlice(path, relStart, stringLen(path));
const relNoExt = stringSlice(relPath, 0, (stringLen(relPath) - 5));
const outFile = ((path == entryPath) ? outPath : pathJoin(outDir, (relNoExt + ".mjs")));
const js = ((path == entryPath) ? compile_tiny2(src, true, false, relPath) : compile_tiny2(src, false, true, relPath));
writeTextFile(outFile, js);
}
return undefined;
}
