// compiled by selfhost tuffc
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { span_start } from "../ast.mjs";
import { fluff_warn_unused_locals_in_scope, fluff_warn_unused_params_in_scope, fluff_check_fn_complexity, fluff_check_lambda_complexity } from "./fluff.mjs";
import { ty_unknown, ty_void, ty_fn_type, ty_fn_type_params, ty_is_fn_type, normalize_ty_ann } from "./typestrings.mjs";
import { infer_expr_type } from "./infer_basic.mjs";
import { scopes_enter, declare_local_name } from "./scope.mjs";
import { require_type_compatible } from "./typecheck.mjs";
import { analyze_expr, analyze_stmts } from "./analyze_expr_stmt.mjs";
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
require_type_compatible(src, span_start(d.span), "class fn " + d.name + " return", structs, expected, tailTy);
let si = 0;
while (si < vec_len(d.body)) {
const st = vec_get(d.body, si);
if (st.tag == "SYield") {
const yTy = (st.expr.tag == "EUndefined" ? ty_void() : infer_expr_type(src, structs, fns, outerScopes, depth, st.expr));
require_type_compatible(src, span_start(st.span), "class fn " + d.name + " yield", structs, expected, yTy);
}
si = si + 1;
}
}
warn_unused_params_in_scope(src, outerScopes, depth);
warn_unused_locals_in_scope(src, outerScopes, depth);
check_fn_complexity(src, span_start(d.span), d.name, d.body, d.tail);
return undefined;
}
