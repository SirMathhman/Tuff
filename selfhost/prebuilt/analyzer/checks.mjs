// compiled by selfhost tuffc
import { vec_new, vec_len, vec_get } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { span_start } from "../ast.mjs";
import { infer_expr_type } from "./infer_basic.mjs";
import { require_type_compatible } from "./typecheck.mjs";
import { subst_bind, ty_apply_subst } from "./subst.mjs";
import { struct_name_of_expr, has_struct_def, find_struct_def, has_fn_sig, find_fn_sig } from "./env.mjs";
import { normalize_ty_ann, type_is_unknown, type_is_int_like, type_is_float_like, ty_is_fn_type, ty_fn_param_tys, ty_fn_type_params, ty_is_type_var, ty_i32, ty_u32, ty_char, ty_int_lit, ty_f32, ty_f64, ty_float_lit, ty_string } from "./typestrings.mjs";
export function check_cond_is_bool(src, structs, fns, scopes, depth, cond) {
const t = infer_expr_type(src, structs, fns, scopes, depth, cond);
if (t == ty_i32() || t == ty_u32() || t == ty_char() || t == ty_int_lit()) {
error_at(src, span_start(cond.span), "condition must be Bool (got I32)");
}
if (t == ty_f32() || t == ty_f64() || t == ty_float_lit()) {
error_at(src, span_start(cond.span), "condition must be Bool (got F64)");
}
if (t == ty_string()) {
error_at(src, span_start(cond.span), "condition must be Bool (got String)");
}
return undefined;
}
export function check_binary_operand_types(src, structs, fns, scopes, depth, e) {
if (e.tag != "EBinary") {
return;
}
const lt = infer_expr_type(src, structs, fns, scopes, depth, e.left);
const rt = infer_expr_type(src, structs, fns, scopes, depth, e.right);
if (type_is_unknown(lt) || type_is_unknown(rt)) {
return;
}
if ((e.op.tag === "OpAdd")) {
if (lt == ty_string() || rt == ty_string()) {
return;
}
if (!(type_is_int_like(lt) && type_is_int_like(rt) || type_is_float_like(lt) && type_is_float_like(rt))) {
error_at(src, span_start(e.span), "invalid operands to '+': expected numbers or strings");
}
return;
}
if ((e.op.tag === "OpSub") || (e.op.tag === "OpMul") || (e.op.tag === "OpDiv")) {
if (!(type_is_int_like(lt) && type_is_int_like(rt) || type_is_float_like(lt) && type_is_float_like(rt))) {
error_at(src, span_start(e.span), "invalid operands to arithmetic operator");
}
return;
}
if ((e.op.tag === "OpLt") || (e.op.tag === "OpLe") || (e.op.tag === "OpGt") || (e.op.tag === "OpGe")) {
if (!(type_is_int_like(lt) && type_is_int_like(rt) || type_is_float_like(lt) && type_is_float_like(rt))) {
error_at(src, span_start(e.span), "invalid operands to comparison operator: expected numbers");
}
return;
}
return undefined;
}
export function check_struct_lit_types(src, structs, fns, scopes, depth, e) {
const structName = struct_name_of_expr(src, e.nameExpr);
if (!has_struct_def(structs, structName)) {
error_at(src, span_start(e.span), "unknown struct: " + structName);
return;
}
const sd = find_struct_def(structs, structName);
if (!(vec_len(sd.fields) == vec_len(e.values))) {
error_at(src, span_start(e.span), "wrong number of values in struct literal for " + structName);
}
let i = 0;
while (i < vec_len(e.values) && i < vec_len(sd.fieldTyAnns)) {
const expected = vec_get(sd.fieldTyAnns, i);
if (expected != "") {
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.values, i));
require_type_compatible(src, span_start(e.span), "struct " + structName + " field " + vec_get(sd.fields, i), structs, expected, actual);
}
i = i + 1;
}
return undefined;
}
export function check_call_types(src, structs, fns, scopes, depth, e) {
if ((e.callee.tag === "ELambda")) {
if (!(vec_len(e.args) == vec_len(e.callee.params))) {
error_at(src, span_start(e.span), "wrong number of args in lambda call");
}
const subst = vec_new();
if (vec_len(e.callee.typeParams) > 0) {
if (vec_len(e.typeArgs) > 0) {
if (!(vec_len(e.typeArgs) == vec_len(e.callee.typeParams))) {
error_at(src, span_start(e.span), "wrong number of type args in lambda call");
}
let ti = 0;
while (ti < vec_len(e.callee.typeParams)) {
subst_bind(subst, vec_get(e.callee.typeParams, ti), normalize_ty_ann(vec_get(e.typeArgs, ti)));
ti = ti + 1;
}
} else {
let ai = 0;
while (ai < vec_len(e.args) && ai < vec_len(e.callee.paramTyAnns)) {
const expected = vec_get(e.callee.paramTyAnns, ai);
if (expected != "" && ty_is_type_var(e.callee.typeParams, normalize_ty_ann(expected))) {
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, ai));
subst_bind(subst, normalize_ty_ann(expected), normalize_ty_ann(actual));
}
ai = ai + 1;
}
}
} else {
if (vec_len(e.typeArgs) > 0) {
error_at(src, span_start(e.span), "cannot supply type args to non-generic lambda");
}
}
let i = 0;
while (i < vec_len(e.args) && i < vec_len(e.callee.paramTyAnns)) {
const expected = vec_get(e.callee.paramTyAnns, i);
if (expected != "") {
const expected1 = (vec_len(e.callee.typeParams) > 0 ? ty_apply_subst(e.callee.typeParams, subst, expected) : normalize_ty_ann(expected));
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, i));
require_type_compatible(src, span_start(e.span), "lambda arg " + ("" + (i + 1)), structs, expected1, actual);
}
i = i + 1;
}
return;
}
const ct = infer_expr_type(src, structs, fns, scopes, depth, e.callee);
if (ty_is_fn_type(ct)) {
const paramTys = ty_fn_param_tys(ct);
if (!(vec_len(e.args) == vec_len(paramTys))) {
error_at(src, span_start(e.span), "wrong number of args in call");
}
const tps = ty_fn_type_params(ct);
const subst = vec_new();
if (vec_len(tps) > 0) {
if (vec_len(e.typeArgs) > 0) {
if (!(vec_len(e.typeArgs) == vec_len(tps))) {
error_at(src, span_start(e.span), "wrong number of type args in call");
}
let ti = 0;
while (ti < vec_len(tps)) {
subst_bind(subst, vec_get(tps, ti), normalize_ty_ann(vec_get(e.typeArgs, ti)));
ti = ti + 1;
}
} else {
let ai = 0;
while (ai < vec_len(e.args) && ai < vec_len(paramTys)) {
const expected = vec_get(paramTys, ai);
if (expected != "" && ty_is_type_var(tps, normalize_ty_ann(expected))) {
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, ai));
subst_bind(subst, normalize_ty_ann(expected), normalize_ty_ann(actual));
}
ai = ai + 1;
}
}
} else {
if (vec_len(e.typeArgs) > 0) {
error_at(src, span_start(e.span), "cannot supply type args to non-generic function");
}
}
let i = 0;
while (i < vec_len(e.args) && i < vec_len(paramTys)) {
const expected0 = vec_get(paramTys, i);
if (!type_is_unknown(expected0)) {
const expected = (vec_len(tps) > 0 ? ty_apply_subst(tps, subst, expected0) : normalize_ty_ann(expected0));
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, i));
require_type_compatible(src, span_start(e.span), "arg " + ("" + (i + 1)), structs, expected, actual);
}
i = i + 1;
}
return;
}
if (e.callee.tag != "EIdent") {
return;
}
const name = e.callee.name;
if (!has_fn_sig(fns, name)) {
return;
}
const sig = find_fn_sig(fns, name);
if (!(vec_len(e.args) == vec_len(sig.params))) {
error_at(src, span_start(e.span), "wrong number of args in call to " + name);
}
const subst = vec_new();
(vec_len(sig.typeParams) > 0 ? (() => {
return (vec_len(e.typeArgs) > 0 ? (() => {
if (!(vec_len(e.typeArgs) == vec_len(sig.typeParams))) {
error_at(src, span_start(e.span), "wrong number of type args in call to " + name);
}
let ti = 0;
while (ti < vec_len(sig.typeParams)) {
subst_bind(subst, vec_get(sig.typeParams, ti), normalize_ty_ann(vec_get(e.typeArgs, ti)));
ti = ti + 1;
}
return undefined;
})() : (() => {
let ai = 0;
while (ai < vec_len(e.args) && ai < vec_len(sig.paramTyAnns)) {
const expected = vec_get(sig.paramTyAnns, ai);
if (expected != "" && ty_is_type_var(sig.typeParams, normalize_ty_ann(expected))) {
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, ai));
subst_bind(subst, normalize_ty_ann(expected), normalize_ty_ann(actual));
}
ai = ai + 1;
}
return undefined;
})());
})() : (() => {
if (vec_len(e.typeArgs) > 0) {
error_at(src, span_start(e.span), "cannot supply type args to non-generic function: " + name);
}
return undefined;
})());
let i = 0;
while (i < vec_len(e.args) && i < vec_len(sig.paramTyAnns)) {
const expected0 = vec_get(sig.paramTyAnns, i);
if (expected0 != "") {
const expected = (vec_len(sig.typeParams) > 0 ? ty_apply_subst(sig.typeParams, subst, expected0) : normalize_ty_ann(expected0));
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, i));
require_type_compatible(src, span_start(e.span), "arg " + ("" + (i + 1)) + " to " + name, structs, expected, actual);
}
i = i + 1;
}
return undefined;
}
