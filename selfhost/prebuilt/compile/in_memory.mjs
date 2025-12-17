// compiled by selfhost tuffc
import { stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
import { set_current_file, panic_at, DiagInfo } from "../util/diagnostics.mjs";
import { skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_keyword, parse_ident, parse_module_path, module_path_to_relpath, parse_optional_semicolon } from "../parsing/primitives.mjs";
import { parse_extern_decl } from "../parsing/decls_legacy.mjs";
import { parse_imports_ast } from "../parsing/decls.mjs";
import { span_start } from "../ast.mjs";
import { str_list_contains, str_list_remove } from "./string_lists.mjs";
import { module_index, fnsig_lookup_by_name } from "./export_scan.mjs";
import { cached_scan_top_level_fn_exports } from "./export_scan_cache.mjs";
import { mk_fn_sig } from "../analyzer.mjs";
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
while (vec_len(stack) > qi + 1) {
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
if ((imp.tag === "DImport")) {
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
export function compile_code_with(compile_one, entryCode, moduleLookup) {
const isCompilerBuild = false;
const graph = mem_collect_module_graph_info(entryCode, moduleLookup, isCompilerBuild);
const order = graph[0];
const moduleKeys = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
const outRelPaths = vec_new();
const jsOutputs = vec_new();
let oi = 0;
while (vec_len(order) > oi) {
const key = vec_get(order, oi);
const src = mem_read(entryCode, moduleLookup, key);
set_current_file(key);
const importedFns = mem_imported_fn_sigs(src, key, isCompilerBuild, moduleKeys, moduleOutFns, modulePrivateTopLevelFnNames);
const outRelPath = (key == "entry" ? "entry.mjs" : module_path_to_relpath(key) + ".mjs");
const js = compile_one(src, key == "entry", isCompilerBuild, outRelPath, importedFns);
vec_push(outRelPaths, outRelPath);
vec_push(jsOutputs, js);
oi = oi + 1;
}
return [outRelPaths, jsOutputs];
}
export function lint_code_with(lint_one, entryCode, moduleLookup) {
const isCompilerBuild = false;
const graph = mem_collect_module_graph_info(entryCode, moduleLookup, isCompilerBuild);
const order = graph[0];
const moduleKeys = graph[1];
const moduleOutFns = graph[2];
const modulePrivateTopLevelFnNames = graph[3];
const allErrors = vec_new();
const allWarnings = vec_new();
let oi = 0;
while (vec_len(order) > oi) {
const key = vec_get(order, oi);
const src = mem_read(entryCode, moduleLookup, key);
set_current_file(key);
const importedFns = mem_imported_fn_sigs(src, key, isCompilerBuild, moduleKeys, moduleOutFns, modulePrivateTopLevelFnNames);
const r = lint_one(src, key == "entry", isCompilerBuild, importedFns);
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
