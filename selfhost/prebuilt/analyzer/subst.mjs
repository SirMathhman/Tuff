// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "../rt/vec.mjs";
import { mk_subst } from "./defs.mjs";
import { type_is_ws, ty_skip_ws, ty_unknown, normalize_ty_ann, ty_is_type_var, ty_parse_app, ty_parse_array, ty_is_slice, ty_slice_inner } from "./typestrings.mjs";
export function subst_lookup(subst, name) {
let i = 0;
while (i < vec_len(subst)) {
const s = vec_get(subst, i);
if (s.name == name) {
return s.ty;
}
i = i + 1;
}
return "";
}
export function subst_bind(subst, name, ty) {
let i = 0;
while (i < vec_len(subst)) {
const s = vec_get(subst, i);
if (s.name == name) {
if (normalize_ty_ann(s.ty) != normalize_ty_ann(ty)) {
vec_set(subst, i, mk_subst(name, ty_unknown()));
}
return;
}
i = i + 1;
}
vec_push(subst, mk_subst(name, ty));
return undefined;
}
export function ty_apply_subst(typeParams, subst, t) {
const tt = normalize_ty_ann(t);
if (ty_is_type_var(typeParams, tt)) {
const b = subst_lookup(subst, tt);
if (b == "") {
return tt;
}
return normalize_ty_ann(b);
}
const arr = ty_parse_array(tt);
if (arr.ok) {
const inner = ty_apply_subst(typeParams, subst, arr.elem);
return "[" + inner + ";" + ("" + arr.init) + ";" + ("" + arr.len) + "]";
}
if (ty_is_slice(tt)) {
const inner = ty_apply_subst(typeParams, subst, ty_slice_inner(tt));
return "*[" + inner + "]";
}
const app = ty_parse_app(tt);
if (app.ok) {
let out = stringSlice(app.callee, ty_skip_ws(app.callee, 0), stringLen(app.callee));
out = out + "<";
let i = 0;
while (i < vec_len(app.args)) {
if (i > 0) {
out = out + ", ";
}
out = out + ty_apply_subst(typeParams, subst, vec_get(app.args, i));
i = i + 1;
}
out = out + ">";
return out;
}
return tt;
}
