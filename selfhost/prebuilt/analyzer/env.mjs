// compiled by selfhost tuffc
import { vec_new, vec_len, vec_get } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { span_start } from "../ast.mjs";
import { mk_struct_def, mk_fn_sig_def, mk_union_def } from "./defs.mjs";
import { ty_unknown, normalize_ty_ann } from "./typestrings.mjs";
export function this_struct_name(className) {
return "__This__" + className;
}
export function path_dotted(parts) {
let out = "";
let i = 0;
while (i < vec_len(parts)) {
if (i > 0) {
out = out + ".";
}
out = out + vec_get(parts, i);
i = i + 1;
}
return out;
}
export function struct_name_of_expr(src, nameExpr) {
if (nameExpr.tag == "EIdent") {
return nameExpr.name;
}
if (nameExpr.tag == "EPath") {
return path_dotted(nameExpr.parts);
}
error_at(src, span_start(nameExpr.span), "struct literal name must be ident or path");
return "";
}
export function find_struct_def(structs, name) {
let i = 0;
while (i < vec_len(structs)) {
const s = vec_get(structs, i);
if (s.name == name) {
return s;
}
i = i + 1;
}
return mk_struct_def(name, vec_new(), vec_new());
}
export function has_struct_def(structs, name) {
let i = 0;
while (i < vec_len(structs)) {
if (vec_get(structs, i).name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function struct_field_index(s, field) {
let i = 0;
while (i < vec_len(s.fields)) {
if (vec_get(s.fields, i) == field) {
return i;
}
i = i + 1;
}
return -1;
}
export function get_struct_field_type(src, pos, structs, structName, field) {
if (!has_struct_def(structs, structName)) {
error_at(src, pos, "unknown struct: " + structName);
return ty_unknown();
}
const s = find_struct_def(structs, structName);
const idx = struct_field_index(s, field);
if (idx == -1) {
error_at(src, pos, "unknown field " + field + " on struct " + structName);
return ty_unknown();
}
if (idx < vec_len(s.fieldTyAnns)) {
const t = vec_get(s.fieldTyAnns, idx);
if (t != "") {
return normalize_ty_ann(t);
}
}
return ty_unknown();
}
export function find_fn_sig(fns, name) {
let i = 0;
while (i < vec_len(fns)) {
const s = vec_get(fns, i);
if (s.name == name) {
return s;
}
i = i + 1;
}
return mk_fn_sig_def(name, "", vec_new(), vec_new(), vec_new(), "");
}
export function has_fn_sig(fns, name) {
let i = 0;
while (i < vec_len(fns)) {
if (vec_get(fns, i).name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function find_union_def(unions, name) {
let i = 0;
while (i < vec_len(unions)) {
const u = vec_get(unions, i);
if (u.name == name) {
return u;
}
i = i + 1;
}
return mk_union_def(name, vec_new(), vec_new());
}
export function has_union_def(unions, name) {
let i = 0;
while (i < vec_len(unions)) {
if (vec_get(unions, i).name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function union_has_variant(u, variantName) {
const vs = u.variants;
let i = 0;
while (i < vec_len(vs)) {
if (vec_get(vs, i).name == variantName) {
return true;
}
i = i + 1;
}
return false;
}
export function find_union_by_variant(unions, variantName) {
let i = 0;
while (i < vec_len(unions)) {
const u = vec_get(unions, i);
if (union_has_variant(u, variantName)) {
return u;
}
i = i + 1;
}
return mk_union_def("", vec_new(), vec_new());
}
export function union_variant_index(u, variantName) {
const vs = u.variants;
let i = 0;
while (i < vec_len(vs)) {
if (vec_get(vs, i).name == variantName) {
return i;
}
i = i + 1;
}
return -1;
}
export function union_variant_has_payload(u, variantName) {
const idx = union_variant_index(u, variantName);
if (idx == -1) {
return false;
}
return vec_get(u.variants, idx).hasPayload;
}
export function union_variant_payload_ty_anns(u, variantName) {
const idx = union_variant_index(u, variantName);
if (idx == -1) {
return vec_new();
}
return vec_get(u.variants, idx).payloadTyAnns;
}
