// compiled by selfhost tuffc
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
import { error_at } from "../util/diagnostics.mjs";
import { span_start } from "../ast.mjs";
import { fluff_warn_unused_locals_in_scope, fluff_warn_unused_params_in_scope, fluff_check_fn_complexity, fluff_check_lambda_complexity, fluff_check_fn_max_params, fluff_check_single_char_identifier } from "./fluff.mjs";
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
export function check_fn_max_params(src, pos, fnName, paramCount) {
return fluff_check_fn_max_params(src, pos, fnName, paramCount);
}
export function check_single_char_identifier(src, pos, name, kind) {
return fluff_check_single_char_identifier(src, pos, name, kind);
}
export function analyze_fn_like_decl(src, structs, unions, fns, outerScopes, outerDepth, span, name, params, paramTyAnns, retTyAnn, body, tail, fnKindName) {
check_single_char_identifier(src, span_start(span), name, fnKindName);
const depth = scopes_enter(outerScopes, outerDepth);
let pi = 0;
while (pi < vec_len(params)) {
const paramName = vec_get(params, pi);
check_single_char_identifier(src, span_start(span), paramName, "parameter");
let pTy = ty_unknown();
if (pi < vec_len(paramTyAnns)) {
const ann = vec_get(paramTyAnns, pi);
if (ann != "") {
pTy = normalize_ty_ann(ann);
}
}
declare_local_name(src, span_start(span), outerScopes, depth, paramName, false, pTy);
pi = pi + 1;
}
const narrowed = vec_new();
analyze_stmts(src, structs, unions, fns, outerScopes, depth, narrowed, body);
analyze_expr(src, structs, unions, fns, outerScopes, depth, narrowed, tail);
if (retTyAnn != "") {
const expected = normalize_ty_ann(retTyAnn);
const tailTy = infer_expr_type(src, structs, fns, outerScopes, depth, tail);
require_type_compatible(src, span_start(span), fnKindName + " " + name + " return", structs, expected, tailTy);
let si = 0;
while (si < vec_len(body)) {
const st = vec_get(body, si);
if ((st.tag === "SYield")) {
const yTy = ((st.expr.tag === "EUndefined") ? ty_void() : infer_expr_type(src, structs, fns, outerScopes, depth, st.expr));
require_type_compatible(src, span_start(st.span), fnKindName + " " + name + " yield", structs, expected, yTy);
}
si = si + 1;
}
}
warn_unused_params_in_scope(src, outerScopes, depth);
warn_unused_locals_in_scope(src, outerScopes, depth);
check_fn_complexity(src, span_start(span), name, body, tail);
check_fn_max_params(src, span_start(span), name, vec_len(params));
return undefined;
}
export function analyze_fn_decl(src, structs, unions, fns, outerScopes, outerDepth, d) {
const kind = (d.isClass ? "class fn" : "function");
analyze_fn_like_decl(src, structs, unions, fns, outerScopes, outerDepth, d.span, d.name, d.params, d.paramTyAnns, d.retTyAnn, d.body, d.tail, kind);
return undefined;
}
