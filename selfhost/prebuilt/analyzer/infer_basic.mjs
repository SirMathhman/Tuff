// compiled by selfhost tuffc
import { stringLen, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_get } from "../rt/vec.mjs";
import { span_start } from "../ast.mjs";
import { ty_unknown, ty_bool, ty_int_lit, ty_float_lit, ty_i32, ty_f32, ty_f64, ty_char, ty_string, ty_never, ty_fn_type, ty_is_fn_type, ty_fn_type_params, ty_fn_ret, ty_fn_param_tys, normalize_ty_ann, ty_is_type_var, type_is_unknown, type_is_int_like, type_is_concrete_int, type_is_float_like, type_is_concrete_float, ty_parse_app, ty_parse_array, ty_skip_ws } from "./typestrings.mjs";
import { this_struct_name, struct_name_of_expr, has_struct_def, get_struct_field_type, has_fn_sig, find_fn_sig } from "./env.mjs";
import { infer_lookup_ty } from "./scope.mjs";
import { subst_bind, ty_apply_subst } from "./subst.mjs";
export function infer_expr_type(src, structs, fns, scopes, depth, e) {
if (e.tag == "EBool") {
return ty_bool();
}
if (e.tag == "EInt") {
return ty_int_lit();
}
if (e.tag == "EFloat") {
if (e.suffix == "F32") {
return ty_f32();
}
if (e.suffix == "F64") {
return ty_f64();
}
return ty_float_lit();
}
if (e.tag == "EString") {
return ty_string();
}
if (e.tag == "EIdent") {
if (e.name == "true") {
return ty_bool();
}
if (e.name == "false") {
return ty_bool();
}
return infer_lookup_ty(scopes, depth, e.name);
}
if (e.tag == "ELambda") {
return ty_fn_type(e.typeParams, e.paramTyAnns, e.retTyAnn);
}
if (e.tag == "EStructLit") {
return struct_name_of_expr(src, e.nameExpr);
}
if (e.tag == "EUnary") {
if (e.op.tag == "OpNot") {
const t = infer_expr_type(src, structs, fns, scopes, depth, e.expr);
if (t == ty_bool()) {
return ty_bool();
}
return ty_unknown();
}
if (e.op.tag == "OpNeg") {
const t = infer_expr_type(src, structs, fns, scopes, depth, e.expr);
if (t == ty_i32()) {
return ty_i32();
}
if (t == ty_int_lit()) {
return ty_i32();
}
if (t == ty_f32()) {
return ty_f32();
}
if (t == ty_f64()) {
return ty_f64();
}
if (t == ty_float_lit()) {
return ty_f64();
}
return ty_unknown();
}
}
if (e.tag == "EBinary") {
if (e.op.tag == "OpAnd") {
return ty_bool();
}
if (e.op.tag == "OpOr") {
return ty_bool();
}
if (e.op.tag == "OpEq") {
return ty_bool();
}
if (e.op.tag == "OpNe") {
return ty_bool();
}
if (e.op.tag == "OpLt") {
return ty_bool();
}
if (e.op.tag == "OpLe") {
return ty_bool();
}
if (e.op.tag == "OpGt") {
return ty_bool();
}
if (e.op.tag == "OpGe") {
return ty_bool();
}
if (e.op.tag == "OpAdd") {
const lt = infer_expr_type(src, structs, fns, scopes, depth, e.left);
const rt = infer_expr_type(src, structs, fns, scopes, depth, e.right);
if (lt == ty_string() || rt == ty_string()) {
return ty_string();
}
if (type_is_float_like(lt) && type_is_float_like(rt)) {
const nlt = normalize_ty_ann(lt);
const nrt = normalize_ty_ann(rt);
if (type_is_concrete_float(nlt) && nlt == nrt) {
return nlt;
}
if (type_is_concrete_float(nlt) && nrt == ty_float_lit()) {
return nlt;
}
if (type_is_concrete_float(nrt) && nlt == ty_float_lit()) {
return nrt;
}
return ty_f64();
}
if (type_is_int_like(lt) && type_is_int_like(rt)) {
if (normalize_ty_ann(lt) == ty_char() || normalize_ty_ann(rt) == ty_char()) {
return ty_i32();
}
const nlt = normalize_ty_ann(lt);
const nrt = normalize_ty_ann(rt);
if (type_is_concrete_int(nlt) && nlt == nrt) {
return nlt;
}
return ty_i32();
}
return ty_unknown();
}
if (e.op.tag == "OpSub" || e.op.tag == "OpMul" || e.op.tag == "OpDiv") {
const lt = infer_expr_type(src, structs, fns, scopes, depth, e.left);
const rt = infer_expr_type(src, structs, fns, scopes, depth, e.right);
if (type_is_float_like(lt) && type_is_float_like(rt)) {
const nlt = normalize_ty_ann(lt);
const nrt = normalize_ty_ann(rt);
if (type_is_concrete_float(nlt) && nlt == nrt) {
return nlt;
}
if (type_is_concrete_float(nlt) && nrt == ty_float_lit()) {
return nlt;
}
if (type_is_concrete_float(nrt) && nlt == ty_float_lit()) {
return nrt;
}
return ty_f64();
}
if (type_is_int_like(lt) && type_is_int_like(rt)) {
if (normalize_ty_ann(lt) == ty_char() || normalize_ty_ann(rt) == ty_char()) {
return ty_i32();
}
const nlt = normalize_ty_ann(lt);
const nrt = normalize_ty_ann(rt);
if (type_is_concrete_int(nlt) && nlt == nrt) {
return nlt;
}
return ty_i32();
}
return ty_unknown();
}
}
if (e.tag == "EField") {
const bt = infer_expr_type(src, structs, fns, scopes, depth, e.base);
if (!type_is_unknown(bt) && has_struct_def(structs, bt)) {
return get_struct_field_type(src, span_start(e.span), structs, bt, e.field);
}
return ty_unknown();
}
if (e.tag == "EIndex") {
const bt = infer_expr_type(src, structs, fns, scopes, depth, e.base);
const arr = ty_parse_array(bt);
if (arr.ok) {
return normalize_ty_ann(arr.elem);
}
if (bt != "" && bt != ty_unknown() && bt != ty_int_lit() && bt != ty_float_lit()) {
if (stringLen(bt) >= 2 && stringSlice(bt, 0, 2) == "*[") {
const inner = stringSlice(bt, 2, stringLen(bt) - 1);
return normalize_ty_ann(inner);
}
}
ty_unknown();
}
if (e.tag == "ECall") {
const ct = infer_expr_type(src, structs, fns, scopes, depth, e.callee);
if (ty_is_fn_type(ct)) {
const ret0 = ty_fn_ret(ct);
const tps = ty_fn_type_params(ct);
if (vec_len(tps) > 0) {
const subst = vec_new();
if (vec_len(e.typeArgs) > 0) {
let ti = 0;
while (ti < vec_len(tps) && ti < vec_len(e.typeArgs)) {
subst_bind(subst, vec_get(tps, ti), normalize_ty_ann(vec_get(e.typeArgs, ti)));
ti = ti + 1;
}
} else {
const paramTys = ty_fn_param_tys(ct);
let ai = 0;
while (ai < vec_len(e.args) && ai < vec_len(paramTys)) {
const expected = vec_get(paramTys, ai);
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, ai));
if (expected != "" && ty_is_type_var(tps, normalize_ty_ann(expected))) {
subst_bind(subst, normalize_ty_ann(expected), normalize_ty_ann(actual));
}
ai = ai + 1;
}
}
return ty_apply_subst(tps, subst, ret0);
}
return ret0;
}
if (e.callee.tag == "EIdent" && has_fn_sig(fns, e.callee.name)) {
const sig = find_fn_sig(fns, e.callee.name);
if (sig.retTyAnn != "") {
if (vec_len(sig.typeParams) > 0) {
const subst = vec_new();
if (vec_len(e.typeArgs) > 0) {
let ti = 0;
while (ti < vec_len(sig.typeParams) && ti < vec_len(e.typeArgs)) {
subst_bind(subst, vec_get(sig.typeParams, ti), normalize_ty_ann(vec_get(e.typeArgs, ti)));
ti = ti + 1;
}
} else {
let ai = 0;
while (ai < vec_len(e.args) && ai < vec_len(sig.paramTyAnns)) {
const expected = vec_get(sig.paramTyAnns, ai);
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, ai));
if (expected != "" && ty_is_type_var(sig.typeParams, normalize_ty_ann(expected))) {
subst_bind(subst, normalize_ty_ann(expected), normalize_ty_ann(actual));
}
ai = ai + 1;
}
}
return ty_apply_subst(sig.typeParams, subst, sig.retTyAnn);
}
return normalize_ty_ann(sig.retTyAnn);
}
const thisTy = this_struct_name(e.callee.name);
if (has_struct_def(structs, thisTy)) {
return thisTy;
}
}
return ty_unknown();
}
if (e.tag == "EIf") {
const t1 = infer_expr_type(src, structs, fns, scopes, depth, e.thenExpr);
const t2 = infer_expr_type(src, structs, fns, scopes, depth, e.elseExpr);
if (normalize_ty_ann(t1) == ty_never()) {
return normalize_ty_ann(t2);
}
if (normalize_ty_ann(t2) == ty_never()) {
return normalize_ty_ann(t1);
}
if (!type_is_unknown(t1) && normalize_ty_ann(t1) == normalize_ty_ann(t2)) {
return normalize_ty_ann(t1);
}
return ty_unknown();
}
if (e.tag == "EBlock") {
return infer_expr_type(src, structs, fns, scopes, depth, e.tail);
}
return ty_unknown();
}
