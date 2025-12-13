// compiled by selfhost tuffc
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "./rt/vec.mjs";
import { panic_at } from "./util/diagnostics.mjs";
import { span_start } from "./ast.mjs";
export function mk_struct_def(name, fields, fieldTyAnns) {
return ({ tag: "StructDef", name: name, fields: fields, fieldTyAnns: fieldTyAnns });
}
export function mk_fn_sig(name, params, paramTyAnns, retTyAnn) {
return ({ tag: "FnSig", name: name, params: params, paramTyAnns: paramTyAnns, retTyAnn: retTyAnn });
}
export function mk_binding(name, isMut, tyTag) {
return ({ tag: "Binding", name: name, isMut: isMut, tyTag: tyTag });
}
export function ty_unknown() {
return "Unknown";
}
export function ty_int_lit() {
return "IntLit";
}
export function ty_bool() {
return "Bool";
}
export function ty_i32() {
return "I32";
}
export function ty_u32() {
return "U32";
}
export function ty_char() {
return "Char";
}
export function ty_string() {
return "String";
}
export function ty_void() {
return "Void";
}
export function normalize_ty_ann(t) {
if ((t == "Int")) {
return ty_i32();
}
if ((t == "I32")) {
return ty_i32();
}
if ((t == "U32")) {
return ty_u32();
}
if ((t == "Char")) {
return ty_char();
}
if ((t == "Bool")) {
return ty_bool();
}
if ((t == "String")) {
return ty_string();
}
if ((t == "Void")) {
return ty_void();
}
return t;
}
export function type_is_unknown(t) {
return ((t == ty_unknown()) || (t == ""));
}
export function type_is_int_like(t) {
const tt = normalize_ty_ann(t);
if ((tt == ty_int_lit())) {
return true;
}
if ((tt == ty_i32())) {
return true;
}
if ((tt == ty_u32())) {
return true;
}
if ((tt == ty_char())) {
return true;
}
return false;
}
export function should_enforce_expected_type(structs, expected) {
const e = normalize_ty_ann(expected);
if ((e == ty_bool())) {
return true;
}
if ((e == ty_i32())) {
return true;
}
if ((e == ty_u32())) {
return true;
}
if ((e == ty_char())) {
return true;
}
if ((e == ty_string())) {
return true;
}
if ((e == ty_void())) {
return true;
}
if (has_struct_def(structs, e)) {
return true;
}
return false;
}
export function type_compatible(structs, expected, actual) {
if ((expected == "")) {
return true;
}
if ((!should_enforce_expected_type(structs, expected))) {
return true;
}
if (type_is_unknown(actual)) {
return true;
}
if (((normalize_ty_ann(actual) == ty_int_lit()) && type_is_int_like(expected))) {
return true;
}
return (normalize_ty_ann(expected) == normalize_ty_ann(actual));
}
export function require_type_compatible(src, pos, ctx, structs, expected, actual) {
if ((!type_compatible(structs, expected, actual))) {
panic_at(src, pos, ((((ctx + ": expected ") + normalize_ty_ann(expected)) + ", got ") + normalize_ty_ann(actual)));
}
return undefined;
}
export function path_dotted(parts) {
let out = "";
let i = 0;
while ((i < vec_len(parts))) {
if ((i > 0)) {
out = (out + ".");
}
out = (out + vec_get(parts, i));
i = (i + 1);
}
return out;
}
export function struct_name_of_expr(src, nameExpr) {
if ((nameExpr.tag == "EIdent")) {
return nameExpr.name;
}
if ((nameExpr.tag == "EPath")) {
return path_dotted(nameExpr.parts);
}
return panic_at(src, span_start(nameExpr.span), "struct literal name must be ident or path");
}
export function find_struct_def(structs, name) {
let i = 0;
while ((i < vec_len(structs))) {
const s = vec_get(structs, i);
if ((s.name == name)) {
return s;
}
i = (i + 1);
}
return mk_struct_def(name, vec_new(), vec_new());
}
export function has_struct_def(structs, name) {
let i = 0;
while ((i < vec_len(structs))) {
if ((vec_get(structs, i).name == name)) {
return true;
}
i = (i + 1);
}
return false;
}
export function struct_field_index(s, field) {
let i = 0;
while ((i < vec_len(s.fields))) {
if ((vec_get(s.fields, i) == field)) {
return i;
}
i = (i + 1);
}
return (-1);
}
export function get_struct_field_type(src, pos, structs, structName, field) {
if ((!has_struct_def(structs, structName))) {
panic_at(src, pos, ("unknown struct: " + structName));
}
const s = find_struct_def(structs, structName);
const idx = struct_field_index(s, field);
if ((idx == (-1))) {
panic_at(src, pos, ((("unknown field " + field) + " on struct ") + structName));
}
if ((idx < vec_len(s.fieldTyAnns))) {
const t = vec_get(s.fieldTyAnns, idx);
if ((t != "")) {
return normalize_ty_ann(t);
}
}
return ty_unknown();
}
export function find_fn_sig(fns, name) {
let i = 0;
while ((i < vec_len(fns))) {
const s = vec_get(fns, i);
if ((s.name == name)) {
return s;
}
i = (i + 1);
}
return mk_fn_sig(name, vec_new(), vec_new(), "");
}
export function has_fn_sig(fns, name) {
let i = 0;
while ((i < vec_len(fns))) {
if ((vec_get(fns, i).name == name)) {
return true;
}
i = (i + 1);
}
return false;
}
export function scopes_contains(scopes, depth, name) {
let si = 0;
while ((si < depth)) {
const scope = vec_get(scopes, si);
let ni = 0;
while ((ni < vec_len(scope))) {
const b = vec_get(scope, ni);
if ((b.name == name)) {
return true;
}
ni = (ni + 1);
}
si = (si + 1);
}
return false;
}
export function scopes_enter(scopes, depth) {
const s = vec_new();
if ((depth < vec_len(scopes))) {
vec_set(scopes, depth, s);
} else {
vec_push(scopes, s);
}
return (depth + 1);
}
export function declare_name(src, pos, scopes, depth, name, isMut, tyTag) {
if (scopes_contains(scopes, depth, name)) {
panic_at(src, pos, ("shadowing not allowed: " + name));
}
const cur = vec_get(scopes, (depth - 1));
vec_push(cur, mk_binding(name, isMut, tyTag));
return undefined;
}
export function scope_contains(scope, name) {
let i = 0;
while ((i < vec_len(scope))) {
const b = vec_get(scope, i);
if ((b.name == name)) {
return true;
}
i = (i + 1);
}
return false;
}
export function declare_local_name(src, pos, scopes, depth, name, isMut, tyTag) {
const cur = vec_get(scopes, (depth - 1));
if (scope_contains(cur, name)) {
panic_at(src, pos, ("duplicate name: " + name));
}
vec_push(cur, mk_binding(name, isMut, tyTag));
return undefined;
}
export function lookup_binding(src, pos, scopes, depth, name) {
let si = 0;
while ((si < depth)) {
const scope = vec_get(scopes, si);
let bi = 0;
while ((bi < vec_len(scope))) {
const b = vec_get(scope, bi);
if ((b.name == name)) {
return b;
}
bi = (bi + 1);
}
si = (si + 1);
}
panic_at(src, pos, ("unknown name: " + name));
return mk_binding(name, false, ty_unknown());
}
export function infer_lookup_ty(scopes, depth, name) {
let si = 0;
while ((si < depth)) {
const scope = vec_get(scopes, si);
let bi = 0;
while ((bi < vec_len(scope))) {
const b = vec_get(scope, bi);
if ((b.name == name)) {
return b.tyTag;
}
bi = (bi + 1);
}
si = (si + 1);
}
return ty_unknown();
}
export function require_name(src, pos, scopes, depth, name) {
if ((name == "true")) {
return;
}
if ((name == "false")) {
return;
}
if ((name == "continue")) {
return;
}
if ((name == "break")) {
return;
}
lookup_binding(src, pos, scopes, depth, name);
return undefined;
}
export function infer_expr_type(src, structs, fns, scopes, depth, e) {
if ((e.tag == "EBool")) {
return ty_bool();
}
if ((e.tag == "EInt")) {
return ty_int_lit();
}
if ((e.tag == "EString")) {
return ty_string();
}
if ((e.tag == "EIdent")) {
if ((e.name == "true")) {
return ty_bool();
}
if ((e.name == "false")) {
return ty_bool();
}
return infer_lookup_ty(scopes, depth, e.name);
}
if ((e.tag == "EStructLit")) {
return struct_name_of_expr(src, e.nameExpr);
}
if ((e.tag == "EUnary")) {
if ((e.op.tag == "OpNot")) {
const t = infer_expr_type(src, structs, fns, scopes, depth, e.expr);
if ((t == ty_bool())) {
return ty_bool();
}
return ty_unknown();
}
if ((e.op.tag == "OpNeg")) {
const t = infer_expr_type(src, structs, fns, scopes, depth, e.expr);
if ((t == ty_i32())) {
return ty_i32();
}
if ((t == ty_int_lit())) {
return ty_i32();
}
return ty_unknown();
}
}
if ((e.tag == "EBinary")) {
if ((e.op.tag == "OpAnd")) {
return ty_bool();
}
if ((e.op.tag == "OpOr")) {
return ty_bool();
}
if ((e.op.tag == "OpEq")) {
return ty_bool();
}
if ((e.op.tag == "OpNe")) {
return ty_bool();
}
if ((e.op.tag == "OpLt")) {
return ty_bool();
}
if ((e.op.tag == "OpLe")) {
return ty_bool();
}
if ((e.op.tag == "OpGt")) {
return ty_bool();
}
if ((e.op.tag == "OpGe")) {
return ty_bool();
}
if ((e.op.tag == "OpAdd")) {
const lt = infer_expr_type(src, structs, fns, scopes, depth, e.left);
const rt = infer_expr_type(src, structs, fns, scopes, depth, e.right);
if (((lt == ty_string()) || (rt == ty_string()))) {
return ty_string();
}
if ((type_is_int_like(lt) && type_is_int_like(rt))) {
if (((normalize_ty_ann(lt) == ty_char()) || (normalize_ty_ann(rt) == ty_char()))) {
return ty_i32();
}
if (((normalize_ty_ann(lt) == ty_u32()) && (normalize_ty_ann(rt) == ty_u32()))) {
return ty_u32();
}
return ty_i32();
}
return ty_unknown();
}
if ((((e.op.tag == "OpSub") || (e.op.tag == "OpMul")) || (e.op.tag == "OpDiv"))) {
const lt = infer_expr_type(src, structs, fns, scopes, depth, e.left);
const rt = infer_expr_type(src, structs, fns, scopes, depth, e.right);
if ((type_is_int_like(lt) && type_is_int_like(rt))) {
if (((normalize_ty_ann(lt) == ty_char()) || (normalize_ty_ann(rt) == ty_char()))) {
return ty_i32();
}
if (((normalize_ty_ann(lt) == ty_u32()) && (normalize_ty_ann(rt) == ty_u32()))) {
return ty_u32();
}
return ty_i32();
}
return ty_unknown();
}
}
if ((e.tag == "EField")) {
const bt = infer_expr_type(src, structs, fns, scopes, depth, e.base);
if (((!type_is_unknown(bt)) && has_struct_def(structs, bt))) {
return get_struct_field_type(src, span_start(e.span), structs, bt, e.field);
}
return ty_unknown();
}
if ((e.tag == "ECall")) {
if (((e.callee.tag == "EIdent") && has_fn_sig(fns, e.callee.name))) {
const sig = find_fn_sig(fns, e.callee.name);
if ((sig.retTyAnn != "")) {
return normalize_ty_ann(sig.retTyAnn);
}
}
return ty_unknown();
}
if ((e.tag == "EIf")) {
const t1 = infer_expr_type(src, structs, fns, scopes, depth, e.thenExpr);
const t2 = infer_expr_type(src, structs, fns, scopes, depth, e.elseExpr);
if (((!type_is_unknown(t1)) && (normalize_ty_ann(t1) == normalize_ty_ann(t2)))) {
return normalize_ty_ann(t1);
}
return ty_unknown();
}
if ((e.tag == "EBlock")) {
return infer_expr_type(src, structs, fns, scopes, depth, e.tail);
}
return ty_unknown();
}
export function check_cond_is_bool(src, structs, fns, scopes, depth, cond) {
const t = infer_expr_type(src, structs, fns, scopes, depth, cond);
if (((((t == ty_i32()) || (t == ty_u32())) || (t == ty_char())) || (t == ty_int_lit()))) {
panic_at(src, span_start(cond.span), "condition must be Bool (got I32)");
}
if ((t == ty_string())) {
panic_at(src, span_start(cond.span), "condition must be Bool (got String)");
}
return undefined;
}
export function check_binary_operand_types(src, structs, fns, scopes, depth, e) {
if ((e.tag != "EBinary")) {
return;
}
const lt = infer_expr_type(src, structs, fns, scopes, depth, e.left);
const rt = infer_expr_type(src, structs, fns, scopes, depth, e.right);
if ((type_is_unknown(lt) || type_is_unknown(rt))) {
return;
}
if ((e.op.tag == "OpAdd")) {
if (((lt == ty_string()) || (rt == ty_string()))) {
return;
}
if ((!(type_is_int_like(lt) && type_is_int_like(rt)))) {
panic_at(src, span_start(e.span), "invalid operands to '+': expected numbers or strings");
}
return;
}
if ((((e.op.tag == "OpSub") || (e.op.tag == "OpMul")) || (e.op.tag == "OpDiv"))) {
if ((!(type_is_int_like(lt) && type_is_int_like(rt)))) {
panic_at(src, span_start(e.span), "invalid operands to arithmetic operator");
}
return;
}
return undefined;
}
export function check_struct_lit_types(src, structs, fns, scopes, depth, e) {
const structName = struct_name_of_expr(src, e.nameExpr);
if ((!has_struct_def(structs, structName))) {
panic_at(src, span_start(e.span), ("unknown struct: " + structName));
}
const sd = find_struct_def(structs, structName);
if ((!(vec_len(sd.fields) == vec_len(e.values)))) {
panic_at(src, span_start(e.span), ("wrong number of values in struct literal for " + structName));
}
let i = 0;
while (((i < vec_len(e.values)) && (i < vec_len(sd.fieldTyAnns)))) {
const expected = vec_get(sd.fieldTyAnns, i);
if ((expected != "")) {
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.values, i));
require_type_compatible(src, span_start(e.span), ((("struct " + structName) + " field ") + vec_get(sd.fields, i)), structs, expected, actual);
}
i = (i + 1);
}
return undefined;
}
export function check_call_types(src, structs, fns, scopes, depth, e) {
if ((e.callee.tag != "EIdent")) {
return;
}
const name = e.callee.name;
if ((!has_fn_sig(fns, name))) {
return;
}
const sig = find_fn_sig(fns, name);
if ((!(vec_len(e.args) == vec_len(sig.params)))) {
panic_at(src, span_start(e.span), ("wrong number of args in call to " + name));
}
let i = 0;
while (((i < vec_len(e.args)) && (i < vec_len(sig.paramTyAnns)))) {
const expected = vec_get(sig.paramTyAnns, i);
if ((expected != "")) {
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, i));
require_type_compatible(src, span_start(e.span), ((("arg " + ("" + (i + 1))) + " to ") + name), structs, expected, actual);
}
i = (i + 1);
}
return undefined;
}
export function analyze_expr(src, structs, fns, scopes, depth, e) {
if ((e.tag == "EIdent")) {
require_name(src, span_start(e.span), scopes, depth, e.name);
return;
}
if ((e.tag == "EStructLit")) {
let vi = 0;
while ((vi < vec_len(e.values))) {
analyze_expr(src, structs, fns, scopes, depth, vec_get(e.values, vi));
vi = (vi + 1);
}
check_struct_lit_types(src, structs, fns, scopes, depth, e);
return;
}
if ((e.tag == "EUnary")) {
analyze_expr(src, structs, fns, scopes, depth, e.expr);
return;
}
if ((e.tag == "EBinary")) {
analyze_expr(src, structs, fns, scopes, depth, e.left);
analyze_expr(src, structs, fns, scopes, depth, e.right);
check_binary_operand_types(src, structs, fns, scopes, depth, e);
return;
}
if ((e.tag == "ECall")) {
analyze_expr(src, structs, fns, scopes, depth, e.callee);
let ai = 0;
while ((ai < vec_len(e.args))) {
analyze_expr(src, structs, fns, scopes, depth, vec_get(e.args, ai));
ai = (ai + 1);
}
check_call_types(src, structs, fns, scopes, depth, e);
return;
}
if ((e.tag == "EIf")) {
check_cond_is_bool(src, structs, fns, scopes, depth, e.cond);
analyze_expr(src, structs, fns, scopes, depth, e.cond);
analyze_expr(src, structs, fns, scopes, depth, e.thenExpr);
analyze_expr(src, structs, fns, scopes, depth, e.elseExpr);
return;
}
if ((e.tag == "EBlock")) {
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, fns, scopes, newDepth, e.body);
analyze_expr(src, structs, fns, scopes, newDepth, e.tail);
return;
}
if ((e.tag == "EVecLit")) {
let ii = 0;
while ((ii < vec_len(e.items))) {
analyze_expr(src, structs, fns, scopes, depth, vec_get(e.items, ii));
ii = (ii + 1);
}
return;
}
if ((e.tag == "ETupleLit")) {
let ii = 0;
while ((ii < vec_len(e.items))) {
analyze_expr(src, structs, fns, scopes, depth, vec_get(e.items, ii));
ii = (ii + 1);
}
return;
}
if ((e.tag == "EIndex")) {
analyze_expr(src, structs, fns, scopes, depth, e.base);
analyze_expr(src, structs, fns, scopes, depth, e.index);
return;
}
if ((e.tag == "ETupleIndex")) {
analyze_expr(src, structs, fns, scopes, depth, e.base);
return;
}
if ((e.tag == "EField")) {
analyze_expr(src, structs, fns, scopes, depth, e.base);
const bt = infer_expr_type(src, structs, fns, scopes, depth, e.base);
if ((!type_is_unknown(bt))) {
if (has_struct_def(structs, bt)) {
const _ft = get_struct_field_type(src, span_start(e.span), structs, bt, e.field);
}
}
return;
}
if ((e.tag == "EMatch")) {
analyze_expr(src, structs, fns, scopes, depth, e.scrut);
let mi = 0;
while ((mi < vec_len(e.arms))) {
const arm = vec_get(e.arms, mi);
analyze_expr(src, structs, fns, scopes, depth, arm.expr);
mi = (mi + 1);
}
return;
}
return undefined;
}
export function analyze_stmt(src, structs, fns, scopes, depth, s) {
if ((s.tag == "SLet")) {
analyze_expr(src, structs, fns, scopes, depth, s.init);
const initTy = infer_expr_type(src, structs, fns, scopes, depth, s.init);
if ((s.tyAnn != "")) {
require_type_compatible(src, span_start(s.span), ("let " + s.name), structs, s.tyAnn, initTy);
declare_name(src, span_start(s.span), scopes, depth, s.name, s.isMut, normalize_ty_ann(s.tyAnn));
return;
}
declare_name(src, span_start(s.span), scopes, depth, s.name, s.isMut, initTy);
return;
}
if ((s.tag == "SAssign")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.name);
if ((!b.isMut)) {
panic_at(src, span_start(s.span), ("cannot assign to immutable binding: " + s.name));
}
analyze_expr(src, structs, fns, scopes, depth, s.value);
return;
}
if ((s.tag == "SExpr")) {
analyze_expr(src, structs, fns, scopes, depth, s.expr);
return;
}
if ((s.tag == "SYield")) {
analyze_expr(src, structs, fns, scopes, depth, s.expr);
return;
}
if ((s.tag == "SWhile")) {
check_cond_is_bool(src, structs, fns, scopes, depth, s.cond);
analyze_expr(src, structs, fns, scopes, depth, s.cond);
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, fns, scopes, newDepth, s.body);
return;
}
if ((s.tag == "SIf")) {
check_cond_is_bool(src, structs, fns, scopes, depth, s.cond);
analyze_expr(src, structs, fns, scopes, depth, s.cond);
const thenDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, fns, scopes, thenDepth, s.thenBody);
if (s.hasElse) {
const elseDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, fns, scopes, elseDepth, s.elseBody);
}
return;
}
if ((s.tag == "SIndexAssign")) {
if ((s.base.tag == "EIdent")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.base.name);
if ((!b.isMut)) {
panic_at(src, span_start(s.span), ("cannot assign through immutable binding: " + s.base.name));
}
}
analyze_expr(src, structs, fns, scopes, depth, s.base);
analyze_expr(src, structs, fns, scopes, depth, s.index);
analyze_expr(src, structs, fns, scopes, depth, s.value);
return;
}
if ((s.tag == "SFieldAssign")) {
if ((s.base.tag == "EIdent")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.base.name);
if ((!b.isMut)) {
panic_at(src, span_start(s.span), ("cannot assign through immutable binding: " + s.base.name));
}
}
analyze_expr(src, structs, fns, scopes, depth, s.base);
analyze_expr(src, structs, fns, scopes, depth, s.value);
return;
}
return undefined;
}
export function analyze_stmts(src, structs, fns, scopes, depth, stmts) {
let i = 0;
while ((i < vec_len(stmts))) {
analyze_stmt(src, structs, fns, scopes, depth, vec_get(stmts, i));
i = (i + 1);
}
return undefined;
}
export function analyze_fn_decl(src, structs, fns, outerScopes, outerDepth, d) {
const depth = scopes_enter(outerScopes, outerDepth);
let pi = 0;
while ((pi < vec_len(d.params))) {
let pTy = ty_unknown();
if ((pi < vec_len(d.paramTyAnns))) {
const ann = vec_get(d.paramTyAnns, pi);
if ((ann != "")) {
pTy = normalize_ty_ann(ann);
}
}
declare_local_name(src, span_start(d.span), outerScopes, depth, vec_get(d.params, pi), false, pTy);
pi = (pi + 1);
}
analyze_stmts(src, structs, fns, outerScopes, depth, d.body);
analyze_expr(src, structs, fns, outerScopes, depth, d.tail);
if ((d.retTyAnn != "")) {
const expected = normalize_ty_ann(d.retTyAnn);
const tailTy = infer_expr_type(src, structs, fns, outerScopes, depth, d.tail);
require_type_compatible(src, span_start(d.span), (("function " + d.name) + " return"), structs, expected, tailTy);
let si = 0;
while ((si < vec_len(d.body))) {
const st = vec_get(d.body, si);
if ((st.tag == "SYield")) {
const yTy = ((st.expr.tag == "EUndefined") ? ty_void() : infer_expr_type(src, structs, fns, outerScopes, depth, st.expr));
require_type_compatible(src, span_start(st.span), (("function " + d.name) + " yield"), structs, expected, yTy);
}
si = (si + 1);
}
}
return undefined;
}
export function analyze_module(src, d) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
const structs = vec_new();
const fns = vec_new();
analyze_decls(src, structs, fns, scopes, depth, d.decls);
return undefined;
}
export function predeclare_decl(src, structs, fns, scopes, depth, d) {
if ((d.tag == "DExternFrom")) {
let ni = 0;
while ((ni < vec_len(d.names))) {
declare_name(src, span_start(d.span), scopes, depth, vec_get(d.names, ni), false, ty_unknown());
ni = (ni + 1);
}
return;
}
if ((d.tag == "DImport")) {
let ni = 0;
while ((ni < vec_len(d.names))) {
declare_name(src, span_start(d.span), scopes, depth, vec_get(d.names, ni), false, ty_unknown());
ni = (ni + 1);
}
return;
}
if ((d.tag == "DTypeUnion")) {
let vi = 0;
while ((vi < vec_len(d.variants))) {
const v = vec_get(d.variants, vi);
declare_name(src, span_start(v.span), scopes, depth, v.name, false, ty_unknown());
vi = (vi + 1);
}
return;
}
if ((d.tag == "DFn")) {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
let paramTyAnns = d.paramTyAnns;
if ((vec_len(paramTyAnns) == 0)) {
paramTyAnns = vec_new();
let i = 0;
while ((i < vec_len(d.params))) {
vec_push(paramTyAnns, "");
i = (i + 1);
}
}
vec_push(fns, mk_fn_sig(d.name, d.params, paramTyAnns, d.retTyAnn));
return;
}
if ((d.tag == "DClassFn")) {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
let paramTyAnns = d.paramTyAnns;
if ((vec_len(paramTyAnns) == 0)) {
paramTyAnns = vec_new();
let i = 0;
while ((i < vec_len(d.params))) {
vec_push(paramTyAnns, "");
i = (i + 1);
}
}
vec_push(fns, mk_fn_sig(d.name, d.params, paramTyAnns, d.retTyAnn));
return;
}
if ((d.tag == "DStruct")) {
vec_push(structs, mk_struct_def(d.name, d.fields, d.fieldTyAnns));
return;
}
if ((d.tag == "DModule")) {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
return;
}
return undefined;
}
export function analyze_decl_body(src, structs, fns, scopes, depth, d) {
if ((d.tag == "DLet")) {
analyze_expr(src, structs, fns, scopes, depth, d.init);
const initTy = infer_expr_type(src, structs, fns, scopes, depth, d.init);
if ((d.tyAnn != "")) {
require_type_compatible(src, span_start(d.span), ("let " + d.name), structs, d.tyAnn, initTy);
declare_name(src, span_start(d.span), scopes, depth, d.name, d.isMut, normalize_ty_ann(d.tyAnn));
return;
}
declare_name(src, span_start(d.span), scopes, depth, d.name, d.isMut, initTy);
return;
}
if ((d.tag == "DFn")) {
analyze_fn_decl(src, structs, fns, scopes, depth, d);
return;
}
if ((d.tag == "DClassFn")) {
analyze_fn_decl(src, structs, fns, scopes, depth, d);
return;
}
if ((d.tag == "DModule")) {
analyze_module(src, d);
return;
}
return undefined;
}
export function analyze_decls(src, structs, fns, scopes, depth, decls) {
let i = 0;
while ((i < vec_len(decls))) {
predeclare_decl(src, structs, fns, scopes, depth, vec_get(decls, i));
i = (i + 1);
}
i = 0;
while ((i < vec_len(decls))) {
analyze_decl_body(src, structs, fns, scopes, depth, vec_get(decls, i));
i = (i + 1);
}
return undefined;
}
export function analyze_program(src, decls) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
const structs = vec_new();
const fns = vec_new();
analyze_decls(src, structs, fns, scopes, depth, decls);
return undefined;
}
