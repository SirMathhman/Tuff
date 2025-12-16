// compiled by selfhost tuffc
import { pathDirname, pathJoin, stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { is_ident_start, is_ident_part } from "../util/lexing.mjs";
import { module_path_to_relpath } from "../parsing/primitives.mjs";
export function find_substring(hay, needle) {
let i = 0;
while (i + stringLen(needle) <= stringLen(hay)) {
let ok = true;
let j = 0;
while (j < stringLen(needle)) {
if (stringCharCodeAt(hay, i + j) != stringCharCodeAt(needle, j)) {
ok = false;
break;
}
j = j + 1;
}
if (ok) {
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
export function starts_with_at_simple(s, i, prefix) {
if (i < 0) {
return false;
}
if (i + stringLen(prefix) > stringLen(s)) {
return false;
}
let j = 0;
while (j < stringLen(prefix)) {
if (stringCharCodeAt(s, i + j) != stringCharCodeAt(prefix, j)) {
return false;
}
j = j + 1;
}
return true;
}
export function lsp_resolve_module_path_impl(modulePath, currentFilePath) {
const workspaceRoot = workspace_root_from_path(currentFilePath);
const rel = module_path_to_relpath(modulePath);
let baseDir = pathDirname(currentFilePath);
const compilerSrcPrefix = "src::main::tuff::compiler::";
let rel2 = rel;
(starts_with_at_simple(modulePath, 0, compilerSrcPrefix) ? (() => {
const compilerRootDir = pathJoin(workspaceRoot, "src/main/tuff/compiler");
baseDir = compilerRootDir;
const rest = stringSlice(modulePath, stringLen(compilerSrcPrefix), stringLen(modulePath));
rel2 = module_path_to_relpath(rest);
return undefined;
})() : (() => {
return (starts_with_at_simple(modulePath, 0, "src::") || starts_with_at_simple(modulePath, 0, "std::") ? (() => {
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
export function lsp_ident_at_impl(src, offset) {
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
export function lsp_module_path_at_impl(src, offset) {
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
