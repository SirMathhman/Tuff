// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "./rt/vec.mjs";
import { error_at, warn_at } from "./util/diagnostics.mjs";
import { span_start } from "./ast.mjs";
import { deprecation_reason_before } from "./analyzer/deprecation.mjs";
import { type_is_ws, ty_is_digit, ty_skip_ws, ty_starts_with, ty_unknown, ty_int_lit, ty_float_lit, ty_bool, ty_i32, ty_i8, ty_i16, ty_i64, ty_f32, ty_f64, ty_u32, ty_u8, ty_u16, ty_u64, ty_char, ty_string, ty_void, ty_never, ty_fn_type, ty_is_fn_type, ty_fn_type_params, ty_fn_ret, ty_fn_param_tys, normalize_ty_ann, vec_contains_str, ty_is_type_var, ty_parse_app, ty_parse_array, ty_is_slice, ty_slice_inner, type_is_unknown, type_is_int_like, type_is_concrete_int, type_is_float_like, type_is_concrete_float } from "./analyzer/typestrings.mjs";
import { fluff_set_options, fluff_set_complexity_options, fluff_set_file_size_options, fluff_check_file_size, fluff_warn_unused_locals_in_scope, fluff_warn_unused_params_in_scope, fluff_check_fn_complexity, fluff_check_lambda_complexity } from "./analyzer/fluff.mjs";
import { mk_union_variant_info, mk_struct_def, mk_fn_sig_def, mk_union_def, mk_binding, mk_subst, mk_narrowed_tag } from "./analyzer/defs.mjs";
import { narrow_lookup, narrow_clone } from "./analyzer/narrowing.mjs";
import { infer_int_const } from "./analyzer/consts.mjs";
import { subst_lookup, subst_bind, ty_apply_subst } from "./analyzer/subst.mjs";
import { infer_expr_type } from "./analyzer/infer_basic.mjs";
import { infer_expr_type_with_narrowing, parse_tag_narrowing, validate_union_variant_for_binding } from "./analyzer/infer_narrowing.mjs";
import { analyze_expr, analyze_stmt, analyze_stmts } from "./analyzer/analyze_expr_stmt.mjs";
import { this_struct_name, path_dotted, struct_name_of_expr, find_struct_def, has_struct_def, get_struct_field_type, find_fn_sig, has_fn_sig, find_union_def, has_union_def, union_has_variant, find_union_by_variant, union_variant_has_payload, union_variant_payload_ty_anns } from "./analyzer/env.mjs";
import { scopes_contains, scopes_enter, declare_name, declare_name_deprecated, scope_contains, declare_local_name, declare_local_name_deprecated, lookup_binding, update_binding_ty, mark_binding_read, mark_binding_written, infer_lookup_ty, require_name } from "./analyzer/scope.mjs";
import { require_type_compatible, require_all_param_types } from "./analyzer/typecheck.mjs";
import { check_cond_is_bool, check_binary_operand_types, check_struct_lit_types, check_call_types } from "./analyzer/checks.mjs";
export function set_fluff_options(unusedLocalsSeverity, unusedParamsSeverity) {
return fluff_set_options(unusedLocalsSeverity, unusedParamsSeverity);
}
export function set_fluff_complexity_options(complexitySeverity, threshold) {
return fluff_set_complexity_options(complexitySeverity, threshold);
}
export function set_fluff_file_size_options(severity, threshold) {
return fluff_set_file_size_options(severity, threshold);
}
export function check_file_size(src) {
return fluff_check_file_size(src);
}
export function mk_fn_sig(name, deprecatedReason, typeParams, params, paramTyAnns, retTyAnn) {
return mk_fn_sig_def(name, deprecatedReason, typeParams, params, paramTyAnns, retTyAnn);
}
export function warn_unused_locals_in_scope(src, scopes, depth) {
return fluff_warn_unused_locals_in_scope(src, scopes, depth);
}
export function warn_unused_params_in_scope(src, scopes, depth) {
return fluff_warn_unused_params_in_scope(src, scopes, depth);
}
export function check_fn_complexity(src, pos, fnName, body, tail) {
return fluff_check_fn_complexity(src, pos, fnName, body, tail);
}
export function check_lambda_complexity(src, pos, name, body) {
return fluff_check_lambda_complexity(src, pos, name, body);
}
export function analyze_fn_decl(src, structs, unions, fns, outerScopes, outerDepth, d) {
const depth = scopes_enter(outerScopes, outerDepth);
let pi = 0;
while (pi < vec_len(d.params)) {
let pTy = ty_unknown();
if (pi < vec_len(d.paramTyAnns)) {
const ann = vec_get(d.paramTyAnns, pi);
if (ann != "") {
pTy = normalize_ty_ann(ann);
}
}
declare_local_name(src, span_start(d.span), outerScopes, depth, vec_get(d.params, pi), false, pTy);
pi = pi + 1;
}
const narrowed = vec_new();
analyze_stmts(src, structs, unions, fns, outerScopes, depth, narrowed, d.body);
analyze_expr(src, structs, unions, fns, outerScopes, depth, narrowed, d.tail);
if (d.retTyAnn != "") {
const expected = normalize_ty_ann(d.retTyAnn);
const tailTy = infer_expr_type(src, structs, fns, outerScopes, depth, d.tail);
require_type_compatible(src, span_start(d.span), "function " + d.name + " return", structs, expected, tailTy);
let si = 0;
while (si < vec_len(d.body)) {
const st = vec_get(d.body, si);
if (st.tag == "SYield") {
const yTy = (st.expr.tag == "EUndefined" ? ty_void() : infer_expr_type(src, structs, fns, outerScopes, depth, st.expr));
require_type_compatible(src, span_start(st.span), "function " + d.name + " yield", structs, expected, yTy);
}
si = si + 1;
}
}
warn_unused_params_in_scope(src, outerScopes, depth);
warn_unused_locals_in_scope(src, outerScopes, depth);
check_fn_complexity(src, span_start(d.span), d.name, d.body, d.tail);
return undefined;
}
export function analyze_class_fn_decl(src, structs, unions, fns, outerScopes, outerDepth, d) {
const depth = scopes_enter(outerScopes, outerDepth);
let pi = 0;
while (pi < vec_len(d.params)) {
let pTy = ty_unknown();
if (pi < vec_len(d.paramTyAnns)) {
const ann = vec_get(d.paramTyAnns, pi);
if (ann != "") {
pTy = normalize_ty_ann(ann);
}
}
declare_local_name(src, span_start(d.span), outerScopes, depth, vec_get(d.params, pi), false, pTy);
pi = pi + 1;
}
const narrowed = vec_new();
analyze_stmts(src, structs, unions, fns, outerScopes, depth, narrowed, d.body);
analyze_expr(src, structs, unions, fns, outerScopes, depth, narrowed, d.tail);
if (d.retTyAnn != "") {
const expected = normalize_ty_ann(d.retTyAnn);
const tailTy = infer_expr_type(src, structs, fns, outerScopes, depth, d.tail);
require_type_compatible(src, span_start(d.span), "function " + d.name + " return", structs, expected, tailTy);
let si = 0;
while (si < vec_len(d.body)) {
const st = vec_get(d.body, si);
if (st.tag == "SYield") {
const yTy = (st.expr.tag == "EUndefined" ? ty_void() : infer_expr_type(src, structs, fns, outerScopes, depth, st.expr));
require_type_compatible(src, span_start(st.span), "function " + d.name + " yield", structs, expected, yTy);
}
si = si + 1;
}
}
warn_unused_params_in_scope(src, outerScopes, depth);
warn_unused_locals_in_scope(src, outerScopes, depth);
check_fn_complexity(src, span_start(d.span), d.name, d.body, d.tail);
return undefined;
}
export function analyze_module(src, d) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
const structs = vec_new();
const unions = vec_new();
const fns = vec_new();
analyze_decls(src, structs, unions, fns, scopes, depth, d.decls);
return undefined;
}
export function predeclare_decl(src, structs, unions, fns, scopes, depth, d) {
if (d.tag == "DExternFrom") {
let ni = 0;
while (ni < vec_len(d.names)) {
declare_name(src, span_start(d.span), scopes, depth, vec_get(d.names, ni), false, ty_unknown());
ni = ni + 1;
}
return;
}
if (d.tag == "DExternType") {
return;
}
if (d.tag == "DImport") {
let ni = 0;
while (ni < vec_len(d.names)) {
const name = vec_get(d.names, ni);
if (has_fn_sig(fns, name)) {
const sig = find_fn_sig(fns, name);
if (sig.deprecatedReason != "") {
warn_at(src, span_start(d.span), "importing deprecated symbol " + name + " - " + sig.deprecatedReason);
declare_name_deprecated(src, span_start(d.span), scopes, depth, name, false, ty_unknown(), sig.deprecatedReason);
ni = ni + 1;
continue;
}
}
declare_name(src, span_start(d.span), scopes, depth, name, false, ty_unknown());
ni = ni + 1;
}
return;
}
if (d.tag == "DTypeUnion") {
const depReason = deprecation_reason_before(src, span_start(d.span));
let vi = 0;
const infos = vec_new();
while (vi < vec_len(d.variants)) {
const v = vec_get(d.variants, vi);
if (depReason != "") {
declare_name_deprecated(src, span_start(v.span), scopes, depth, v.name, false, ty_unknown(), depReason);
} else {
declare_name(src, span_start(v.span), scopes, depth, v.name, false, ty_unknown());
}
vec_push(infos, mk_union_variant_info(v.name, v.hasPayload, v.payloadTyAnns));
vi = vi + 1;
}
vec_push(unions, mk_union_def(d.name, d.typeParams, infos));
return;
}
if (d.tag == "DFn") {
const depReason = deprecation_reason_before(src, span_start(d.span));
if (depReason != "") {
declare_name_deprecated(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown(), depReason);
} else {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
}
let paramTyAnns = d.paramTyAnns;
if (vec_len(paramTyAnns) == 0) {
paramTyAnns = vec_new();
let i = 0;
while (i < vec_len(d.params)) {
vec_push(paramTyAnns, "");
i = i + 1;
}
}
require_all_param_types(src, span_start(d.span), "function " + d.name, d.params, paramTyAnns);
vec_push(fns, mk_fn_sig(d.name, depReason, d.typeParams, d.params, paramTyAnns, d.retTyAnn));
return;
}
if (d.tag == "DClassFn") {
const depReason = deprecation_reason_before(src, span_start(d.span));
if (depReason != "") {
declare_name_deprecated(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown(), depReason);
} else {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
}
const thisName = this_struct_name(d.name);
if (!has_struct_def(structs, thisName)) {
const fields = vec_new();
const fieldTyAnns = vec_new();
let pi = 0;
while (pi < vec_len(d.params)) {
vec_push(fields, vec_get(d.params, pi));
let t = "";
if (pi < vec_len(d.paramTyAnns)) {
t = vec_get(d.paramTyAnns, pi);
}
vec_push(fieldTyAnns, (t == "" ? "" : normalize_ty_ann(t)));
pi = pi + 1;
}
let si = 0;
while (si < vec_len(d.body)) {
const st = vec_get(d.body, si);
if (st.tag == "SLet") {
vec_push(fields, st.name);
if (st.tyAnn != "") {
vec_push(fieldTyAnns, normalize_ty_ann(st.tyAnn));
} else {
if (st.init.tag == "ELambda") {
vec_push(fieldTyAnns, ty_fn_type(st.init.typeParams, st.init.paramTyAnns, st.init.retTyAnn));
} else {
vec_push(fieldTyAnns, "");
}
}
}
si = si + 1;
}
vec_push(structs, mk_struct_def(thisName, fields, fieldTyAnns));
}
let paramTyAnns = d.paramTyAnns;
if (vec_len(paramTyAnns) == 0) {
paramTyAnns = vec_new();
let i = 0;
while (i < vec_len(d.params)) {
vec_push(paramTyAnns, "");
i = i + 1;
}
}
require_all_param_types(src, span_start(d.span), "class fn " + d.name, d.params, paramTyAnns);
vec_push(fns, mk_fn_sig(d.name, depReason, d.typeParams, d.params, paramTyAnns, d.retTyAnn));
return;
}
if (d.tag == "DStruct") {
vec_push(structs, mk_struct_def(d.name, d.fields, d.fieldTyAnns));
return;
}
if (d.tag == "DModule") {
const depReason = deprecation_reason_before(src, span_start(d.span));
if (depReason != "") {
declare_name_deprecated(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown(), depReason);
} else {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
}
return;
}
return undefined;
}
export function analyze_decl_body(src, structs, unions, fns, scopes, depth, d) {
if (d.tag == "DLet") {
const narrowed = vec_new();
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, d.init);
const initTy = infer_expr_type(src, structs, fns, scopes, depth, d.init);
if (d.init.tag == "EIdent" && has_fn_sig(fns, d.init.name)) {
const sig = find_fn_sig(fns, d.init.name);
if (vec_len(sig.typeParams) > 0) {
error_at(src, span_start(d.init.span), "generic function requires type args when used as a value: " + d.init.name);
}
}
if (ty_is_fn_type(initTy)) {
const tps = ty_fn_type_params(initTy);
if (vec_len(tps) > 0) {
error_at(src, span_start(d.init.span), "generic function value must be specialized before use");
}
}
const depReason = deprecation_reason_before(src, span_start(d.span));
if (d.tyAnn != "") {
require_type_compatible(src, span_start(d.span), "let " + d.name, structs, d.tyAnn, initTy);
if (depReason != "") {
declare_name_deprecated(src, span_start(d.span), scopes, depth, d.name, d.isMut, normalize_ty_ann(d.tyAnn), depReason);
} else {
declare_name(src, span_start(d.span), scopes, depth, d.name, d.isMut, normalize_ty_ann(d.tyAnn));
}
return;
}
if (depReason != "") {
declare_name_deprecated(src, span_start(d.span), scopes, depth, d.name, d.isMut, initTy, depReason);
} else {
declare_name(src, span_start(d.span), scopes, depth, d.name, d.isMut, initTy);
}
return;
}
if (d.tag == "DFn") {
analyze_fn_decl(src, structs, unions, fns, scopes, depth, d);
return;
}
if (d.tag == "DClassFn") {
analyze_class_fn_decl(src, structs, unions, fns, scopes, depth, d);
return;
}
if (d.tag == "DModule") {
analyze_module(src, d);
return;
}
return undefined;
}
export function analyze_decls(src, structs, unions, fns, scopes, depth, decls) {
let i = 0;
while (i < vec_len(decls)) {
predeclare_decl(src, structs, unions, fns, scopes, depth, vec_get(decls, i));
i = i + 1;
}
i = 0;
while (i < vec_len(decls)) {
analyze_decl_body(src, structs, unions, fns, scopes, depth, vec_get(decls, i));
i = i + 1;
}
return undefined;
}
export function analyze_program(src, decls) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
const structs = vec_new();
const unions = vec_new();
const fns = vec_new();
analyze_decls(src, structs, unions, fns, scopes, depth, decls);
return undefined;
}
export function analyze_program_with_fns(src, decls, importedFns) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
const structs = vec_new();
const unions = vec_new();
const fns = vec_new();
let i = 0;
while (i < vec_len(importedFns)) {
vec_push(fns, vec_get(importedFns, i));
i = i + 1;
}
analyze_decls(src, structs, unions, fns, scopes, depth, decls);
return undefined;
}
