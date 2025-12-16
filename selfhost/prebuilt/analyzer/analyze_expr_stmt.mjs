// compiled by selfhost tuffc
import { stringLen, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
import { error_at, warn_at } from "../util/diagnostics.mjs";
import { span_start } from "../ast.mjs";
import { deprecation_reason_before } from "./deprecation.mjs";
import { infer_int_const } from "./consts.mjs";
import { ty_unknown, ty_is_fn_type, ty_fn_type_params, ty_parse_array, ty_parse_app, ty_skip_ws, normalize_ty_ann, type_is_unknown, vec_contains_str } from "./typestrings.mjs";
import { mk_narrowed_tag, mk_union_def } from "./defs.mjs";
import { narrow_lookup, narrow_clone } from "./narrowing.mjs";
import { scope_contains, scopes_enter, declare_name, declare_name_deprecated, declare_local_name, lookup_binding, update_binding_ty, mark_binding_read, mark_binding_written, infer_lookup_ty, require_name } from "./scope.mjs";
import { has_struct_def, get_struct_field_type, has_fn_sig, find_fn_sig, has_union_def, find_union_def, union_has_variant, union_variant_has_payload } from "./env.mjs";
import { infer_expr_type } from "./infer_basic.mjs";
import { infer_expr_type_with_narrowing, parse_tag_narrowing, validate_union_variant_for_binding } from "./infer_narrowing.mjs";
import { require_all_param_types, require_type_compatible } from "./typecheck.mjs";
import { check_struct_lit_types, check_binary_operand_types, check_call_types, check_cond_is_bool } from "./checks.mjs";
import { warn_unused_locals_in_scope, warn_unused_params_in_scope, check_lambda_complexity, check_single_char_identifier } from "./fluff.mjs";
export function analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e) {
if ((e.tag === "EIdent")) {
require_name(src, span_start(e.span), scopes, depth, e.name);
if (e.name != "true" && e.name != "false" && e.name != "continue" && e.name != "break") {
mark_binding_read(scopes, depth, e.name);
const b = lookup_binding(src, span_start(e.span), scopes, depth, e.name);
if (b.deprecatedReason != "") {
warn_at(src, span_start(e.span), "use of deprecated symbol " + e.name + " - " + b.deprecatedReason);
}
}
return;
}
if ((e.tag === "ELambda")) {
require_all_param_types(src, span_start(e.span), "lambda", e.params, e.paramTyAnns);
const newDepth = scopes_enter(scopes, depth);
let pi = 0;
while (pi < vec_len(e.params)) {
const paramName = vec_get(e.params, pi);
check_single_char_identifier(src, span_start(e.span), paramName, "parameter");
let pTy = ty_unknown();
if (pi < vec_len(e.paramTyAnns)) {
const ann = vec_get(e.paramTyAnns, pi);
if (ann != "") {
pTy = normalize_ty_ann(ann);
}
}
declare_local_name(src, span_start(e.span), scopes, newDepth, paramName, false, pTy);
pi = pi + 1;
}
analyze_expr(src, structs, unions, fns, scopes, newDepth, narrowed, e.body);
if (e.retTyAnn != "") {
const expected = normalize_ty_ann(e.retTyAnn);
const bodyTy = infer_expr_type(src, structs, fns, scopes, newDepth, e.body);
require_type_compatible(src, span_start(e.span), "lambda return", structs, expected, bodyTy);
}
warn_unused_params_in_scope(src, scopes, newDepth);
warn_unused_locals_in_scope(src, scopes, newDepth);
return;
}
if ((e.tag === "EStructLit")) {
let vi = 0;
while (vi < vec_len(e.values)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.values, vi));
vi = vi + 1;
}
check_struct_lit_types(src, structs, fns, scopes, depth, e);
return;
}
if ((e.tag === "EUnary")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.expr);
if ((e.op.tag === "OpNot") && (e.expr.tag === "EBinary")) {
if ((e.expr.op.tag === "OpEq")) {
warn_at(src, span_start(e.span), "simplify !(expr == value) to expr != value");
}
if ((e.expr.op.tag === "OpNe")) {
warn_at(src, span_start(e.span), "simplify !(expr != value) to expr == value");
}
}
return;
}
if ((e.tag === "EBinary")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.left);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.right);
check_binary_operand_types(src, structs, fns, scopes, depth, e);
return;
}
if ((e.tag === "ECall")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.callee);
let ai = 0;
while (ai < vec_len(e.args)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.args, ai));
ai = ai + 1;
}
check_call_types(src, structs, fns, scopes, depth, e);
return;
}
if ((e.tag === "EIf")) {
check_cond_is_bool(src, structs, fns, scopes, depth, e.cond);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.cond);
const nar = parse_tag_narrowing(e.cond);
if (nar.ok) {
if (nar.thenVariant != "") {
validate_union_variant_for_binding(src, span_start(e.cond.span), unions, scopes, depth, nar.name, nar.thenVariant);
const narrowedThen = narrow_clone(narrowed);
vec_push(narrowedThen, mk_narrowed_tag(nar.name, nar.thenVariant));
analyze_expr(src, structs, unions, fns, scopes, depth, narrowedThen, e.thenExpr);
} else {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.thenExpr);
}
if (nar.elseVariant != "") {
validate_union_variant_for_binding(src, span_start(e.cond.span), unions, scopes, depth, nar.name, nar.elseVariant);
const narrowedElse = narrow_clone(narrowed);
vec_push(narrowedElse, mk_narrowed_tag(nar.name, nar.elseVariant));
analyze_expr(src, structs, unions, fns, scopes, depth, narrowedElse, e.elseExpr);
} else {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.elseExpr);
}
return;
}
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.thenExpr);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.elseExpr);
return;
}
if ((e.tag === "EBlock")) {
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, newDepth, narrowed, e.body);
analyze_expr(src, structs, unions, fns, scopes, newDepth, narrowed, e.tail);
warn_unused_locals_in_scope(src, scopes, newDepth);
return;
}
if ((e.tag === "EVecLit")) {
let ii = 0;
while (ii < vec_len(e.items)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.items, ii));
ii = ii + 1;
}
return;
}
if ((e.tag === "ETupleLit")) {
let ii = 0;
while (ii < vec_len(e.items)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.items, ii));
ii = ii + 1;
}
return;
}
if ((e.tag === "EIndex")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.base);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.index);
if ((e.base.tag === "EIdent")) {
const bt = infer_lookup_ty(scopes, depth, e.base.name);
const arr = ty_parse_array(normalize_ty_ann(bt));
if (arr.ok) {
const idx = infer_int_const(e.index);
if (idx >= 0) {
if (idx >= arr.len) {
error_at(src, span_start(e.span), "array index out of bounds: " + ("" + idx));
}
if (!(idx < arr.init)) {
error_at(src, span_start(e.span), "array index uninitialized: " + ("" + idx));
}
}
}
}
return;
}
if ((e.tag === "ETupleIndex")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.base);
return;
}
if ((e.tag === "EField")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.base);
if (e.field == "value" && (e.base.tag === "EIdent")) {
const bt = infer_lookup_ty(scopes, depth, e.base.name);
const app = ty_parse_app(normalize_ty_ann(bt));
if (app.ok) {
const unionName = stringSlice(app.callee, ty_skip_ws(app.callee, 0), stringLen(app.callee));
if (has_union_def(unions, unionName)) {
const u = find_union_def(unions, unionName);
const v = narrow_lookup(narrowed, e.base.name);
if (v == "") {
error_at(src, span_start(e.span), "union payload access requires narrowing (" + unionName + ".value)");
}
if (!union_has_variant(u, v)) {
error_at(src, span_start(e.span), "unknown union variant: " + v);
}
if (!union_variant_has_payload(u, v)) {
error_at(src, span_start(e.span), "union variant has no payload: " + v);
}
}
}
}
const bt = infer_expr_type(src, structs, fns, scopes, depth, e.base);
if (!type_is_unknown(bt)) {
if (has_struct_def(structs, bt)) {
const _ft = get_struct_field_type(src, span_start(e.span), structs, bt, e.field);
}
}
return;
}
if ((e.tag === "EMatch")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.scrut);
let scrutName = "";
if ((e.scrut.tag === "EIdent")) {
scrutName = e.scrut.name;
}
let scrutIsUnion = false;
let unionName = "";
let u = mk_union_def("", vec_new(), vec_new());
if (scrutName != "") {
const bt0 = infer_lookup_ty(scopes, depth, scrutName);
const bt = normalize_ty_ann(bt0);
unionName = bt;
const app = ty_parse_app(bt);
if (app.ok) {
unionName = stringSlice(app.callee, ty_skip_ws(app.callee, 0), stringLen(app.callee));
}
if (has_union_def(unions, unionName)) {
scrutIsUnion = true;
u = find_union_def(unions, unionName);
}
}
let hasWildcard = false;
const covered = vec_new();
let mi = 0;
while (mi < vec_len(e.arms)) {
const arm = vec_get(e.arms, mi);
if ((arm.pat.tag === "MPWildcard")) {
hasWildcard = true;
}
if ((arm.pat.tag === "MPVariant")) {
vec_push(covered, arm.pat.name);
if (scrutIsUnion) {
if (!union_has_variant(u, arm.pat.name)) {
error_at(src, span_start(arm.pat.span), "unknown union variant in match: " + arm.pat.name + " (for " + unionName + ")");
}
}
if (scrutName != "") {
const narrowedArm = narrow_clone(narrowed);
vec_push(narrowedArm, mk_narrowed_tag(scrutName, arm.pat.name));
analyze_expr(src, structs, unions, fns, scopes, depth, narrowedArm, arm.expr);
} else {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, arm.expr);
}
} else {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, arm.expr);
}
mi = mi + 1;
}
if (scrutIsUnion && !hasWildcard) {
let vi = 0;
while (vi < vec_len(u.variants)) {
const vn = vec_get(u.variants, vi).name;
if (!vec_contains_str(covered, vn)) {
error_at(src, span_start(e.span), "non-exhaustive match on " + unionName + ": missing " + vn);
}
vi = vi + 1;
}
}
return;
}
if ((e.tag === "EIsType")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.expr);
return;
}
return undefined;
}
export function analyze_stmt(src, structs, unions, fns, scopes, depth, narrowed, s) {
if ((s.tag === "SLet")) {
check_single_char_identifier(src, span_start(s.span), s.name, "local variable");
const depReason = deprecation_reason_before(src, span_start(s.span));
if ((s.init.tag === "ELambda")) {
const initTy0 = infer_expr_type(src, structs, fns, scopes, depth, s.init);
const bindTy = (s.tyAnn != "" ? normalize_ty_ann(s.tyAnn) : initTy0);
const cur = vec_get(scopes, depth - 1);
if (!scope_contains(cur, s.name)) {
if (depReason != "") {
declare_name_deprecated(src, span_start(s.span), scopes, depth, s.name, s.isMut, bindTy, depReason);
} else {
declare_name(src, span_start(s.span), scopes, depth, s.name, s.isMut, bindTy);
}
}
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.init);
if (s.tyAnn != "") {
require_type_compatible(src, span_start(s.span), "let " + s.name, structs, s.tyAnn, initTy0);
}
check_lambda_complexity(src, span_start(s.span), s.name, s.init.body);
return;
}
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.init);
const initTy = infer_expr_type_with_narrowing(src, structs, unions, fns, scopes, depth, narrowed, s.init);
if ((s.init.tag === "EIdent") && has_fn_sig(fns, s.init.name)) {
const sig = find_fn_sig(fns, s.init.name);
if (vec_len(sig.typeParams) > 0) {
error_at(src, span_start(s.init.span), "generic function requires type args when used as a value: " + s.init.name);
}
}
if (ty_is_fn_type(initTy)) {
const tps = ty_fn_type_params(initTy);
if (vec_len(tps) > 0) {
error_at(src, span_start(s.init.span), "generic function value must be specialized before use");
}
}
if (s.tyAnn != "") {
require_type_compatible(src, span_start(s.span), "let " + s.name, structs, s.tyAnn, initTy);
if (depReason != "") {
declare_name_deprecated(src, span_start(s.span), scopes, depth, s.name, s.isMut, normalize_ty_ann(s.tyAnn), depReason);
} else {
declare_name(src, span_start(s.span), scopes, depth, s.name, s.isMut, normalize_ty_ann(s.tyAnn));
}
return;
}
if (depReason != "") {
declare_name_deprecated(src, span_start(s.span), scopes, depth, s.name, s.isMut, initTy, depReason);
} else {
declare_name(src, span_start(s.span), scopes, depth, s.name, s.isMut, initTy);
}
return;
}
if ((s.tag === "SAssign")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.name);
if (!b.isMut) {
error_at(src, span_start(s.span), "cannot assign to immutable binding: " + s.name);
}
mark_binding_written(scopes, depth, s.name);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.value);
return;
}
if ((s.tag === "SExpr")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.expr);
return;
}
if ((s.tag === "SYield")) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.expr);
return;
}
if ((s.tag === "SWhile")) {
check_cond_is_bool(src, structs, fns, scopes, depth, s.cond);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.cond);
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, newDepth, narrowed, s.body);
warn_unused_locals_in_scope(src, scopes, newDepth);
return;
}
if ((s.tag === "SIf")) {
check_cond_is_bool(src, structs, fns, scopes, depth, s.cond);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.cond);
const nar = parse_tag_narrowing(s.cond);
if (nar.ok) {
let thenNar = narrowed;
if (nar.thenVariant != "") {
validate_union_variant_for_binding(src, span_start(s.cond.span), unions, scopes, depth, nar.name, nar.thenVariant);
thenNar = narrow_clone(narrowed);
vec_push(thenNar, mk_narrowed_tag(nar.name, nar.thenVariant));
}
const thenDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, thenDepth, thenNar, s.thenBody);
warn_unused_locals_in_scope(src, scopes, thenDepth);
if (s.hasElse) {
let elseNar = narrowed;
if (nar.elseVariant != "") {
validate_union_variant_for_binding(src, span_start(s.cond.span), unions, scopes, depth, nar.name, nar.elseVariant);
elseNar = narrow_clone(narrowed);
vec_push(elseNar, mk_narrowed_tag(nar.name, nar.elseVariant));
}
const elseDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, elseDepth, elseNar, s.elseBody);
warn_unused_locals_in_scope(src, scopes, elseDepth);
}
return;
}
const thenDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, thenDepth, narrowed, s.thenBody);
warn_unused_locals_in_scope(src, scopes, thenDepth);
if (s.hasElse) {
const elseDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, elseDepth, narrowed, s.elseBody);
warn_unused_locals_in_scope(src, scopes, elseDepth);
}
return;
}
if ((s.tag === "SIndexAssign")) {
if ((s.base.tag === "EIdent")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.base.name);
if (!b.isMut) {
error_at(src, span_start(s.span), "cannot assign through immutable binding: " + s.base.name);
}
}
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.base);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.index);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.value);
if ((s.base.tag === "EIdent")) {
const bt = infer_lookup_ty(scopes, depth, s.base.name);
const arr = ty_parse_array(normalize_ty_ann(bt));
if (arr.ok) {
const idx = infer_int_const(s.index);
if (idx >= 0) {
if (idx >= arr.len) {
error_at(src, span_start(s.span), "array index out of bounds: " + ("" + idx));
}
if (idx > arr.init) {
error_at(src, span_start(s.span), "cannot skip array initialization at index " + ("" + idx));
}
const elemExpected = normalize_ty_ann(arr.elem);
const actual = infer_expr_type(src, structs, fns, scopes, depth, s.value);
require_type_compatible(src, span_start(s.span), "array element", structs, elemExpected, actual);
if (idx == arr.init) {
update_binding_ty(src, span_start(s.span), scopes, depth, s.base.name, "[" + elemExpected + ";" + ("" + (arr.init + 1)) + ";" + ("" + arr.len) + "]");
}
}
}
}
return;
}
if ((s.tag === "SFieldAssign")) {
if ((s.base.tag === "EIdent")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.base.name);
if (!b.isMut) {
error_at(src, span_start(s.span), "cannot assign through immutable binding: " + s.base.name);
}
}
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.base);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.value);
return;
}
return undefined;
}
export function analyze_stmts(src, structs, unions, fns, scopes, depth, narrowed, stmts) {
const cur = vec_get(scopes, depth - 1);
let pi = 0;
while (pi < vec_len(stmts)) {
const st = vec_get(stmts, pi);
if ((st.tag === "SLet") && (st.init.tag === "ELambda")) {
if (!scope_contains(cur, st.name)) {
const initTy0 = infer_expr_type(src, structs, fns, scopes, depth, st.init);
const bindTy = (st.tyAnn != "" ? normalize_ty_ann(st.tyAnn) : initTy0);
declare_name(src, span_start(st.span), scopes, depth, st.name, st.isMut, bindTy);
}
}
pi = pi + 1;
}
let i = 0;
while (i < vec_len(stmts)) {
analyze_stmt(src, structs, unions, fns, scopes, depth, narrowed, vec_get(stmts, i));
i = i + 1;
}
return undefined;
}
