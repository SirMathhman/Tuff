// compiled by selfhost tuffc
import { stringLen, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_get } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { span_start } from "../ast.mjs";
import { ty_unknown, normalize_ty_ann, ty_parse_app, ty_skip_ws, type_is_unknown } from "./typestrings.mjs";
import { infer_expr_type } from "./infer_basic.mjs";
import { has_union_def, find_union_def, union_has_variant, union_variant_payload_ty_anns } from "./env.mjs";
import { infer_lookup_ty } from "./scope.mjs";
import { narrow_lookup } from "./narrowing.mjs";
import { subst_bind, ty_apply_subst } from "./subst.mjs";
export function infer_expr_type_with_narrowing(src, structs, unions, fns, scopes, depth, narrowed, e) {
if (e.tag == "EField" && e.field == "value" && e.base.tag == "EIdent") {
const t = infer_union_payload_type_from_narrowing(src, unions, scopes, depth, narrowed, e.base.name);
if (!type_is_unknown(t)) {
return t;
}
}
return infer_expr_type(src, structs, fns, scopes, depth, e);
}
export function ParsedTagEq(ok, name, variant) {
return { ok: ok, name: name, variant: variant };
}
export function parse_tag_eq(cond) {
if (cond.tag != "EBinary") {
return ParsedTagEq(false, "", "");
}
if (cond.op.tag != "OpEq") {
return ParsedTagEq(false, "", "");
}
if (cond.left.tag == "EField" && cond.left.field == "tag" && cond.left.base.tag == "EIdent" && cond.right.tag == "EString") {
return ParsedTagEq(true, cond.left.base.name, cond.right.value);
}
if (cond.right.tag == "EField" && cond.right.field == "tag" && cond.right.base.tag == "EIdent" && cond.left.tag == "EString") {
return ParsedTagEq(true, cond.right.base.name, cond.left.value);
}
return ParsedTagEq(false, "", "");
}
export function ParsedTagNarrowing(ok, name, thenVariant, elseVariant) {
return { ok: ok, name: name, thenVariant: thenVariant, elseVariant: elseVariant };
}
export function parse_tag_narrowing(cond) {
if (cond.tag == "EUnary" && cond.op.tag == "OpNot") {
const inner = parse_tag_narrowing(cond.expr);
if (inner.ok) {
return ParsedTagNarrowing(true, inner.name, inner.elseVariant, inner.thenVariant);
}
return ParsedTagNarrowing(false, "", "", "");
}
if (cond.tag != "EBinary") {
return ParsedTagNarrowing(false, "", "", "");
}
if (!(cond.op.tag == "OpEq" || cond.op.tag == "OpNe")) {
return ParsedTagNarrowing(false, "", "", "");
}
if (cond.left.tag == "EField" && cond.left.field == "tag" && cond.left.base.tag == "EIdent" && cond.right.tag == "EString") {
const v = cond.right.value;
if (cond.op.tag == "OpEq") {
return ParsedTagNarrowing(true, cond.left.base.name, v, "");
}
return ParsedTagNarrowing(true, cond.left.base.name, "", v);
}
if (cond.right.tag == "EField" && cond.right.field == "tag" && cond.right.base.tag == "EIdent" && cond.left.tag == "EString") {
const v = cond.left.value;
if (cond.op.tag == "OpEq") {
return ParsedTagNarrowing(true, cond.right.base.name, v, "");
}
return ParsedTagNarrowing(true, cond.right.base.name, "", v);
}
return ParsedTagNarrowing(false, "", "", "");
}
export function validate_union_variant_for_binding(src, pos, unions, scopes, depth, name, variant) {
const bt0 = infer_lookup_ty(scopes, depth, name);
const bt = normalize_ty_ann(bt0);
let unionName = bt;
const app = ty_parse_app(bt);
if (app.ok) {
unionName = stringSlice(app.callee, ty_skip_ws(app.callee, 0), stringLen(app.callee));
}
if (!has_union_def(unions, unionName)) {
return;
}
const u = find_union_def(unions, unionName);
if (!union_has_variant(u, variant)) {
error_at(src, pos, "unknown union variant: " + variant + " (for " + unionName + ")");
}
return undefined;
}
export function infer_union_payload_type_from_narrowing(src, unions, scopes, depth, narrowed, name) {
const v = narrow_lookup(narrowed, name);
if (v == "") {
return ty_unknown();
}
const bt0 = infer_lookup_ty(scopes, depth, name);
const bt = normalize_ty_ann(bt0);
let unionName = bt;
let args = vec_new();
const app = ty_parse_app(bt);
if (app.ok) {
unionName = stringSlice(app.callee, ty_skip_ws(app.callee, 0), stringLen(app.callee));
args = app.args;
}
if (!has_union_def(unions, unionName)) {
return ty_unknown();
}
const u = find_union_def(unions, unionName);
if (!union_has_variant(u, v)) {
return ty_unknown();
}
const payloads = union_variant_payload_ty_anns(u, v);
if (vec_len(payloads) == 1) {
const payload0 = normalize_ty_ann(vec_get(payloads, 0));
if (vec_len(u.typeParams) > 0) {
const subst = vec_new();
let ti = 0;
while (ti < vec_len(u.typeParams) && ti < vec_len(args)) {
subst_bind(subst, vec_get(u.typeParams, ti), normalize_ty_ann(vec_get(args, ti)));
ti = ti + 1;
}
return ty_apply_subst(u.typeParams, subst, payload0);
}
return payload0;
}
return ty_unknown();
}
