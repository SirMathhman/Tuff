// compiled by selfhost tuffc
import { vec_len, vec_get } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { has_struct_def } from "./env.mjs";
import { normalize_ty_ann, type_is_unknown, type_is_int_like, type_is_float_like, ty_bool, ty_i8, ty_i16, ty_i32, ty_i64, ty_f32, ty_f64, ty_u8, ty_u16, ty_u32, ty_u64, ty_char, ty_string, ty_void, ty_never, ty_int_lit, ty_float_lit } from "./typestrings.mjs";
export function should_enforce_expected_type(structs, expected) {
const e = normalize_ty_ann(expected);
if (e == ty_bool()) {
return true;
}
if (e == ty_i8()) {
return true;
}
if (e == ty_i16()) {
return true;
}
if (e == ty_i32()) {
return true;
}
if (e == ty_i64()) {
return true;
}
if (e == ty_f32()) {
return true;
}
if (e == ty_f64()) {
return true;
}
if (e == ty_u8()) {
return true;
}
if (e == ty_u16()) {
return true;
}
if (e == ty_u32()) {
return true;
}
if (e == ty_u64()) {
return true;
}
if (e == ty_char()) {
return true;
}
if (e == ty_string()) {
return true;
}
if (e == ty_void()) {
return true;
}
if (e == ty_never()) {
return true;
}
if (has_struct_def(structs, e)) {
return true;
}
return false;
}
export function type_compatible(structs, expected, actual) {
if (expected == "") {
return true;
}
if (!should_enforce_expected_type(structs, expected)) {
return true;
}
if (type_is_unknown(actual)) {
return true;
}
if (normalize_ty_ann(actual) == ty_never()) {
return true;
}
if (normalize_ty_ann(actual) == ty_int_lit() && type_is_int_like(expected)) {
return true;
}
if (normalize_ty_ann(actual) == ty_float_lit() && type_is_float_like(expected)) {
return true;
}
if (type_is_int_like(normalize_ty_ann(expected)) && type_is_int_like(normalize_ty_ann(actual))) {
return true;
}
return normalize_ty_ann(expected) == normalize_ty_ann(actual);
}
export function require_type_compatible(src, pos, ctx, structs, expected, actual) {
if (!type_compatible(structs, expected, actual)) {
error_at(src, pos, ctx + ": expected " + normalize_ty_ann(expected) + ", got " + normalize_ty_ann(actual));
}
return undefined;
}
export function require_all_param_types(src, pos, prefix, params, paramTyAnns) {
let anyMissing = false;
let msg = "";
let pi = 0;
while (pi < vec_len(params)) {
let ann = "";
if (pi < vec_len(paramTyAnns)) {
ann = vec_get(paramTyAnns, pi);
}
if (ann == "") {
if (!anyMissing) {
anyMissing = true;
msg = prefix + " missing type annotation(s) for parameter(s): ";
} else {
msg = msg + ", ";
}
msg = msg + vec_get(params, pi);
}
pi = pi + 1;
}
if (anyMissing) {
error_at(src, pos, msg);
}
return undefined;
}
