// compiled by selfhost tuffc
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { mk_binding, mk_binding_moved } from "./defs.mjs";
import { ty_unknown } from "./typestrings.mjs";
export function scopes_contains(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let ni = 0;
while (ni < vec_len(scope)) {
const b = vec_get(scope, ni);
if (b.name == name) {
return true;
}
ni = ni + 1;
}
si = si + 1;
}
return false;
}
export function scopes_enter(scopes, depth) {
const s = vec_new();
(depth < vec_len(scopes) ? (() => {
vec_set(scopes, depth, s);
return undefined;
})() : (() => {
vec_push(scopes, s);
return undefined;
})());
return depth + 1;
}
export function declare_name(src, pos, scopes, depth, name, isMut, tyTag) {
if (scopes_contains(scopes, depth, name)) {
error_at(src, pos, "shadowing not allowed: " + name);
}
const cur = vec_get(scopes, depth - 1);
vec_push(cur, mk_binding(name, isMut, tyTag, "", pos, false, true, false));
return undefined;
}
export function declare_name_deprecated(src, pos, scopes, depth, name, isMut, tyTag, deprecatedReason) {
if (scopes_contains(scopes, depth, name)) {
error_at(src, pos, "shadowing not allowed: " + name);
}
const cur = vec_get(scopes, depth - 1);
vec_push(cur, mk_binding(name, isMut, tyTag, deprecatedReason, pos, false, true, false));
return undefined;
}
export function scope_contains(scope, name) {
let i = 0;
while (i < vec_len(scope)) {
const b = vec_get(scope, i);
if (b.name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function declare_local_name(src, pos, scopes, depth, name, isMut, tyTag) {
const cur = vec_get(scopes, depth - 1);
if (scope_contains(cur, name)) {
error_at(src, pos, "duplicate name: " + name);
return;
}
vec_push(cur, mk_binding(name, isMut, tyTag, "", pos, false, true, true));
return undefined;
}
export function declare_local_name_deprecated(src, pos, scopes, depth, name, isMut, tyTag, deprecatedReason) {
const cur = vec_get(scopes, depth - 1);
if (scope_contains(cur, name)) {
error_at(src, pos, "duplicate name: " + name);
return;
}
vec_push(cur, mk_binding(name, isMut, tyTag, deprecatedReason, pos, false, true, true));
return undefined;
}
export function lookup_binding(src, pos, scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
return b;
}
bi = bi + 1;
}
si = si + 1;
}
error_at(src, pos, "unknown name: " + name);
return mk_binding(name, false, ty_unknown(), "", pos, false, false, false);
}
export function update_binding_ty(src, pos, scopes, depth, name, newTyTag) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
if (b.moved) {
vec_set(scope, bi, mk_binding_moved(b.name, b.isMut, newTyTag, b.deprecatedReason, b.declPos, b.read, b.written, b.isParam, b.movePos));
} else {
vec_set(scope, bi, mk_binding(b.name, b.isMut, newTyTag, b.deprecatedReason, b.declPos, b.read, b.written, b.isParam));
}
return;
}
bi = bi + 1;
}
si = si + 1;
}
error_at(src, pos, "unknown name: " + name);
return undefined;
}
export function mark_binding_read(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
if (!b.read) {
vec_set(scope, bi, mk_binding(b.name, b.isMut, b.tyTag, b.deprecatedReason, b.declPos, true, b.written, b.isParam));
}
return;
}
bi = bi + 1;
}
si = si + 1;
}
return undefined;
}
export function mark_binding_written(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
if (!b.written) {
vec_set(scope, bi, mk_binding(b.name, b.isMut, b.tyTag, b.deprecatedReason, b.declPos, b.read, true, b.isParam));
}
return;
}
bi = bi + 1;
}
si = si + 1;
}
return undefined;
}
export function mark_binding_moved(scopes, depth, name, pos) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
if (!b.moved) {
vec_set(scope, bi, mk_binding_moved(b.name, b.isMut, b.tyTag, b.deprecatedReason, b.declPos, b.read, b.written, b.isParam, pos));
}
return;
}
bi = bi + 1;
}
si = si + 1;
}
return undefined;
}
export function is_binding_moved(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
return b.moved;
}
bi = bi + 1;
}
si = si + 1;
}
return false;
}
export function infer_lookup_ty(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
return b.tyTag;
}
bi = bi + 1;
}
si = si + 1;
}
return ty_unknown();
}
export function require_name(src, pos, scopes, depth, name) {
if (name == "true") {
return;
}
if (name == "false") {
return;
}
if (name == "continue") {
return;
}
if (name == "break") {
return;
}
lookup_binding(src, pos, scopes, depth, name);
return undefined;
}
