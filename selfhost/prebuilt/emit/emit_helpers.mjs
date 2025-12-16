// compiled by selfhost tuffc
import { stringLen, stringCharAt, stringFromChar, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
let __current_file_path = "";
export function set_current_file_path(path) {
__current_file_path = path;
return undefined;
}
export function get_current_file_path() {
return __current_file_path;
}
export function emit_runtime_vec_imports_js() {
const importPath = rel_import_path("rt/vec.mjs");
return "import { vec_new as __tuff_vec_new, vec_push as __tuff_vec_push, vec_get as __tuff_vec_get, vec_set as __tuff_vec_set } from \"" + importPath + "\";\n";
}
export function expr_needs_vec_rt(e) {
if ((e.tag === "EVecLit")) {
return true;
}
if ((e.tag === "EIndex")) {
return true;
}
if ((e.tag === "EUnary")) {
return expr_needs_vec_rt(e.expr);
}
if ((e.tag === "EBinary")) {
if (expr_needs_vec_rt(e.left)) {
return true;
}
return expr_needs_vec_rt(e.right);
}
if ((e.tag === "ECall")) {
if (expr_needs_vec_rt(e.callee)) {
return true;
}
let i = 0;
while (i < vec_len(e.args)) {
if (expr_needs_vec_rt(vec_get(e.args, i))) {
return true;
}
i = i + 1;
}
return false;
}
if ((e.tag === "EIf")) {
if (expr_needs_vec_rt(e.cond)) {
return true;
}
if (expr_needs_vec_rt(e.thenExpr)) {
return true;
}
return expr_needs_vec_rt(e.elseExpr);
}
if ((e.tag === "EBlock")) {
let i = 0;
while (i < vec_len(e.body)) {
if (stmt_needs_vec_rt(vec_get(e.body, i))) {
return true;
}
i = i + 1;
}
return expr_needs_vec_rt(e.tail);
}
if ((e.tag === "ELambda")) {
return expr_needs_vec_rt(e.body);
}
if ((e.tag === "EStructLit")) {
if (expr_needs_vec_rt(e.nameExpr)) {
return true;
}
let i = 0;
while (i < vec_len(e.values)) {
if (expr_needs_vec_rt(vec_get(e.values, i))) {
return true;
}
i = i + 1;
}
return false;
}
if ((e.tag === "ETupleLit")) {
let i = 0;
while (i < vec_len(e.items)) {
if (expr_needs_vec_rt(vec_get(e.items, i))) {
return true;
}
i = i + 1;
}
return false;
}
if ((e.tag === "ETupleIndex")) {
return expr_needs_vec_rt(e.base);
}
if ((e.tag === "EField")) {
return expr_needs_vec_rt(e.base);
}
if ((e.tag === "EMatch")) {
if (expr_needs_vec_rt(e.scrut)) {
return true;
}
let i = 0;
while (i < vec_len(e.arms)) {
const arm = vec_get(e.arms, i);
if (expr_needs_vec_rt(arm.expr)) {
return true;
}
i = i + 1;
}
return false;
}
return false;
}
export function stmt_needs_vec_rt(s) {
if ((s.tag === "SIndexAssign")) {
return true;
}
if ((s.tag === "SLet")) {
return expr_needs_vec_rt(s.init);
}
if ((s.tag === "SAssign")) {
return expr_needs_vec_rt(s.value);
}
if ((s.tag === "SExpr")) {
return expr_needs_vec_rt(s.expr);
}
if ((s.tag === "SYield")) {
return expr_needs_vec_rt(s.expr);
}
if ((s.tag === "SWhile")) {
if (expr_needs_vec_rt(s.cond)) {
return true;
}
let i = 0;
while (i < vec_len(s.body)) {
if (stmt_needs_vec_rt(vec_get(s.body, i))) {
return true;
}
i = i + 1;
}
return false;
}
if ((s.tag === "SIf")) {
if (expr_needs_vec_rt(s.cond)) {
return true;
}
let i = 0;
while (i < vec_len(s.thenBody)) {
if (stmt_needs_vec_rt(vec_get(s.thenBody, i))) {
return true;
}
i = i + 1;
}
if (s.hasElse) {
i = 0;
while (i < vec_len(s.elseBody)) {
if (stmt_needs_vec_rt(vec_get(s.elseBody, i))) {
return true;
}
i = i + 1;
}
}
return false;
}
if ((s.tag === "SFieldAssign")) {
if (expr_needs_vec_rt(s.base)) {
return true;
}
return expr_needs_vec_rt(s.value);
}
return false;
}
export function decl_needs_vec_rt(d) {
if ((d.tag === "DLet")) {
return expr_needs_vec_rt(d.init);
}
if ((d.tag === "DFn")) {
let i = 0;
while (i < vec_len(d.body)) {
if (stmt_needs_vec_rt(vec_get(d.body, i))) {
return true;
}
i = i + 1;
}
return expr_needs_vec_rt(d.tail);
}
if ((d.tag === "DClassFn")) {
let i = 0;
while (i < vec_len(d.body)) {
if (stmt_needs_vec_rt(vec_get(d.body, i))) {
return true;
}
i = i + 1;
}
return false;
}
if ((d.tag === "DModule")) {
let i = 0;
while (i < vec_len(d.decls)) {
if (decl_needs_vec_rt(vec_get(d.decls, i))) {
return true;
}
i = i + 1;
}
return false;
}
return false;
}
export function decls_needs_vec_rt(decls) {
let i = 0;
while (i < vec_len(decls)) {
if (decl_needs_vec_rt(vec_get(decls, i))) {
return true;
}
i = i + 1;
}
return false;
}
export function normalize_path_seps(p) {
let out = "";
let i = 0;
while (i < stringLen(p)) {
const ch = stringCharAt(p, i);
if (ch == 92) {
out = out + "/";
i = i + 1;
continue;
}
out = out + stringFromChar(ch);
i = i + 1;
}
return out;
}
export function split_path(p) {
let segs = vec_new();
let start = 0;
let i = 0;
while (i <= stringLen(p)) {
if (i == stringLen(p) || stringCharAt(p, i) == 47) {
if (i > start) {
vec_push(segs, stringSlice(p, start, i));
}
start = i + 1;
i = i + 1;
continue;
}
i = i + 1;
}
return segs;
}
export function rel_import_path(targetRelPath) {
const from = normalize_path_seps(__current_file_path);
const to = normalize_path_seps(targetRelPath);
const fromParts = split_path(from);
const toParts = split_path(to);
let fromDirLen = vec_len(fromParts) - 1;
if (vec_len(fromParts) == 0) {
fromDirLen = 0;
}
let common = 0;
while (common < fromDirLen && common < vec_len(toParts)) {
if (vec_get(fromParts, common) != vec_get(toParts, common)) {
break;
}
common = common + 1;
}
let up = fromDirLen - common;
let prefix = "";
(up == 0 ? (() => {
prefix = "./";
return undefined;
})() : (() => {
while (up > 0) {
prefix = prefix + "../";
up = up - 1;
}
return undefined;
})());
let rest = "";
let i = common;
while (i < vec_len(toParts)) {
if (stringLen(rest) == 0) {
rest = vec_get(toParts, i);
} else {
rest = rest + "/" + vec_get(toParts, i);
}
i = i + 1;
}
return prefix + rest;
}
export function escape_js_string(s) {
let out = "";
let i = 0;
while (i < stringLen(s)) {
const ch = stringCharAt(s, i);
if (ch == 34) {
out = out + "\\\"";
i = i + 1;
continue;
}
if (ch == 92) {
out = out + "\\\\";
i = i + 1;
continue;
}
if (ch == 10) {
out = out + "\\n";
i = i + 1;
continue;
}
if (ch == 13) {
out = out + "\\r";
i = i + 1;
continue;
}
if (ch == 9) {
out = out + "\\t";
i = i + 1;
continue;
}
out = out + stringFromChar(ch);
i = i + 1;
}
return out;
}
