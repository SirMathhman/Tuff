// compiled by selfhost tuffc
import { stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
import { ty_i8, ty_i16, ty_i32, ty_i64, ty_u8, ty_u16, ty_u32, ty_u64, ty_f32, ty_f64, ty_bool, ty_char, ty_void, ty_never, ty_string, ty_unknown, ty_int_lit, ty_float_lit, ty_parse_array, ty_parse_app, ty_is_fn_type, ty_is_pointer, normalize_ty_ann, ty_skip_ws } from "./typestrings.mjs";
export function is_primitive_type(t) {
const tt = normalize_ty_ann(t);
if (tt == ty_i8()) {
return true;
}
if (tt == ty_i16()) {
return true;
}
if (tt == ty_i32()) {
return true;
}
if (tt == ty_i64()) {
return true;
}
if (tt == ty_u8()) {
return true;
}
if (tt == ty_u16()) {
return true;
}
if (tt == ty_u32()) {
return true;
}
if (tt == ty_u64()) {
return true;
}
if (tt == ty_f32()) {
return true;
}
if (tt == ty_f64()) {
return true;
}
if (tt == ty_bool()) {
return true;
}
if (tt == ty_char()) {
return true;
}
if (tt == ty_void()) {
return true;
}
if (tt == ty_never()) {
return true;
}
if (tt == ty_int_lit()) {
return true;
}
if (tt == ty_float_lit()) {
return true;
}
if (tt == ty_string()) {
return true;
}
return false;
}
export function is_copy_type(t, structDefs) {
const tt = normalize_ty_ann(t);
if (is_primitive_type(tt)) {
return true;
}
if (ty_is_pointer(tt)) {
return true;
}
if (tt == ty_unknown() || tt == "") {
return true;
}
if (ty_is_fn_type(tt)) {
return false;
}
const arr = ty_parse_array(tt);
if (arr.ok) {
return is_copy_type(arr.elem, structDefs);
}
if (stringLen(tt) > 0 && stringCharCodeAt(tt, 0) == 40) {
return false;
}
const app = ty_parse_app(tt);
if (app.ok) {
return true;
}
let i = 0;
while (i < vec_len(structDefs)) {
const s = vec_get(structDefs, i);
if (s.name == tt) {
let fi = 0;
while (fi < vec_len(s.fieldTyAnns)) {
const fieldTy = vec_get(s.fieldTyAnns, fi);
if (!is_copy_type(fieldTy, structDefs)) {
return false;
}
fi = fi + 1;
}
return true;
}
i = i + 1;
}
return false;
}
export function is_move_type(t, structDefs) {
return !is_copy_type(t, structDefs);
}
