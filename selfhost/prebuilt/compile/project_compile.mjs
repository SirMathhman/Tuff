// compiled by selfhost tuffc
import { pathDirname, pathJoin, stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
import { set_current_file, panic_at } from "../util/diagnostics.mjs";
import { is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_keyword, parse_ident, parse_module_path, module_path_to_relpath, parse_optional_semicolon } from "../parsing/primitives.mjs";
import { parse_extern_decl } from "../parsing/decls_legacy.mjs";
import { parse_imports_ast } from "../parsing/decls.mjs";
import { span_start } from "../ast.mjs";
import { str_list_contains, str_list_remove } from "./string_lists.mjs";
import { module_index, fnsig_lookup_by_name } from "./export_scan.mjs";
import { cached_scan_top_level_fn_exports } from "./export_scan_cache.mjs";
import { compiler_root_from_path } from "./paths.mjs";
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
if (!str_list_contains(visiting, depPath)) {
vec_push(stack, depPath);
}
}
}
return [order, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames];
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
if ((imp.tag === "DImport")) {
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
export function project_compile_one_module_with(compile_one, src, path, entryPath, outDir, outPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames) {
const importedFns = project_imported_fn_sigs(src, path, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames);
const paths = project_out_paths(path, entryPath, outDir, outPath, workspaceRoot);
const outRelPath = paths[0];
const outFile = paths[1];
const js = compile_one(src, path == entryPath, isCompilerBuild, outRelPath, importedFns);
return [outRelPath, outFile, js];
}
export function project_lint_one_module_with(lint_one, src, path, entryPath, workspaceRoot, isCompilerBuild, modulePaths, moduleOutFns, modulePrivateTopLevelFnNames) {
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
if ((imp.tag === "DImport")) {
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
lint_one(src, path == entryPath, isCompilerBuild, importedFns);
return undefined;
}
