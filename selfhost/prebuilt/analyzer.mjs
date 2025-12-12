// compiled by selfhost tuffc
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "./rt/vec.mjs";
import { panic_at } from "./diagnostics.mjs";
import { span_start } from "./ast.mjs";
export function mk_binding(name, isMut, tyTag) {
return ({ tag: "Binding", name: name, isMut: isMut, tyTag: tyTag });
}
export function ty_unknown() {
return "Unknown";
}
export function ty_bool() {
return "Bool";
}
export function ty_int() {
return "Int";
}
export function ty_string() {
return "String";
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
export function infer_expr_type(src, scopes, depth, e) {
if ((e.tag == "EBool")) {
return ty_bool();
}
if ((e.tag == "EInt")) {
return ty_int();
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
const b = lookup_binding(src, span_start(e.span), scopes, depth, e.name);
return b.tyTag;
}
if ((e.tag == "EUnary")) {
if ((e.op.tag == "OpNot")) {
const t = infer_expr_type(src, scopes, depth, e.expr);
if ((t == ty_bool())) {
return ty_bool();
}
return ty_unknown();
}
if ((e.op.tag == "OpNeg")) {
const t = infer_expr_type(src, scopes, depth, e.expr);
if ((t == ty_int())) {
return ty_int();
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
return ty_int();
}
if ((e.op.tag == "OpSub")) {
return ty_int();
}
if ((e.op.tag == "OpMul")) {
return ty_int();
}
if ((e.op.tag == "OpDiv")) {
return ty_int();
}
}
return ty_unknown();
}
export function check_cond_is_bool(src, scopes, depth, cond) {
const t = infer_expr_type(src, scopes, depth, cond);
if ((t == ty_int())) {
panic_at(src, span_start(cond.span), "condition must be Bool (got Int)");
}
if ((t == ty_string())) {
panic_at(src, span_start(cond.span), "condition must be Bool (got String)");
}
return undefined;
}
export function analyze_expr(src, scopes, depth, e) {
if ((e.tag == "EIdent")) {
require_name(src, span_start(e.span), scopes, depth, e.name);
return;
}
if ((e.tag == "EStructLit")) {
let vi = 0;
while ((vi < vec_len(e.values))) {
analyze_expr(src, scopes, depth, vec_get(e.values, vi));
vi = (vi + 1);
}
return;
}
if ((e.tag == "EUnary")) {
analyze_expr(src, scopes, depth, e.expr);
return;
}
if ((e.tag == "EBinary")) {
analyze_expr(src, scopes, depth, e.left);
analyze_expr(src, scopes, depth, e.right);
return;
}
if ((e.tag == "ECall")) {
analyze_expr(src, scopes, depth, e.callee);
let ai = 0;
while ((ai < vec_len(e.args))) {
analyze_expr(src, scopes, depth, vec_get(e.args, ai));
ai = (ai + 1);
}
return;
}
if ((e.tag == "EIf")) {
check_cond_is_bool(src, scopes, depth, e.cond);
analyze_expr(src, scopes, depth, e.cond);
analyze_expr(src, scopes, depth, e.thenExpr);
analyze_expr(src, scopes, depth, e.elseExpr);
return;
}
if ((e.tag == "EBlock")) {
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, scopes, newDepth, e.body);
analyze_expr(src, scopes, newDepth, e.tail);
return;
}
if ((e.tag == "EVecLit")) {
let ii = 0;
while ((ii < vec_len(e.items))) {
analyze_expr(src, scopes, depth, vec_get(e.items, ii));
ii = (ii + 1);
}
return;
}
if ((e.tag == "ETupleLit")) {
let ii = 0;
while ((ii < vec_len(e.items))) {
analyze_expr(src, scopes, depth, vec_get(e.items, ii));
ii = (ii + 1);
}
return;
}
if ((e.tag == "EIndex")) {
analyze_expr(src, scopes, depth, e.base);
analyze_expr(src, scopes, depth, e.index);
return;
}
if ((e.tag == "ETupleIndex")) {
analyze_expr(src, scopes, depth, e.base);
return;
}
if ((e.tag == "EField")) {
analyze_expr(src, scopes, depth, e.base);
return;
}
if ((e.tag == "EMatch")) {
analyze_expr(src, scopes, depth, e.scrut);
let mi = 0;
while ((mi < vec_len(e.arms))) {
const arm = vec_get(e.arms, mi);
analyze_expr(src, scopes, depth, arm.expr);
mi = (mi + 1);
}
return;
}
return undefined;
}
export function analyze_stmt(src, scopes, depth, s) {
if ((s.tag == "SLet")) {
analyze_expr(src, scopes, depth, s.init);
const initTy = infer_expr_type(src, scopes, depth, s.init);
declare_name(src, span_start(s.span), scopes, depth, s.name, s.isMut, initTy);
return;
}
if ((s.tag == "SAssign")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.name);
if ((!b.isMut)) {
panic_at(src, span_start(s.span), ("cannot assign to immutable binding: " + s.name));
}
analyze_expr(src, scopes, depth, s.value);
return;
}
if ((s.tag == "SExpr")) {
analyze_expr(src, scopes, depth, s.expr);
return;
}
if ((s.tag == "SYield")) {
analyze_expr(src, scopes, depth, s.expr);
return;
}
if ((s.tag == "SWhile")) {
check_cond_is_bool(src, scopes, depth, s.cond);
analyze_expr(src, scopes, depth, s.cond);
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, scopes, newDepth, s.body);
return;
}
if ((s.tag == "SIf")) {
check_cond_is_bool(src, scopes, depth, s.cond);
analyze_expr(src, scopes, depth, s.cond);
const thenDepth = scopes_enter(scopes, depth);
analyze_stmts(src, scopes, thenDepth, s.thenBody);
if (s.hasElse) {
const elseDepth = scopes_enter(scopes, depth);
analyze_stmts(src, scopes, elseDepth, s.elseBody);
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
analyze_expr(src, scopes, depth, s.base);
analyze_expr(src, scopes, depth, s.index);
analyze_expr(src, scopes, depth, s.value);
return;
}
if ((s.tag == "SFieldAssign")) {
if ((s.base.tag == "EIdent")) {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.base.name);
if ((!b.isMut)) {
panic_at(src, span_start(s.span), ("cannot assign through immutable binding: " + s.base.name));
}
}
analyze_expr(src, scopes, depth, s.base);
analyze_expr(src, scopes, depth, s.value);
return;
}
return undefined;
}
export function analyze_stmts(src, scopes, depth, stmts) {
let i = 0;
while ((i < vec_len(stmts))) {
analyze_stmt(src, scopes, depth, vec_get(stmts, i));
i = (i + 1);
}
return undefined;
}
export function analyze_fn_decl(src, outerScopes, outerDepth, d) {
const depth = scopes_enter(outerScopes, outerDepth);
let pi = 0;
while ((pi < vec_len(d.params))) {
declare_local_name(src, span_start(d.span), outerScopes, depth, vec_get(d.params, pi), false, ty_unknown());
pi = (pi + 1);
}
analyze_stmts(src, outerScopes, depth, d.body);
analyze_expr(src, outerScopes, depth, d.tail);
return undefined;
}
export function analyze_module(src, d) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
analyze_decls(src, scopes, depth, d.decls);
return undefined;
}
export function predeclare_decl(src, scopes, depth, d) {
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
return;
}
if ((d.tag == "DClassFn")) {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
return;
}
if ((d.tag == "DModule")) {
declare_name(src, span_start(d.span), scopes, depth, d.name, false, ty_unknown());
return;
}
return undefined;
}
export function analyze_decl_body(src, scopes, depth, d) {
if ((d.tag == "DLet")) {
analyze_expr(src, scopes, depth, d.init);
const initTy = infer_expr_type(src, scopes, depth, d.init);
declare_name(src, span_start(d.span), scopes, depth, d.name, d.isMut, initTy);
return;
}
if ((d.tag == "DFn")) {
analyze_fn_decl(src, scopes, depth, d);
return;
}
if ((d.tag == "DClassFn")) {
analyze_fn_decl(src, scopes, depth, d);
return;
}
if ((d.tag == "DModule")) {
analyze_module(src, d);
return;
}
return undefined;
}
export function analyze_decls(src, scopes, depth, decls) {
let i = 0;
while ((i < vec_len(decls))) {
predeclare_decl(src, scopes, depth, vec_get(decls, i));
i = (i + 1);
}
i = 0;
while ((i < vec_len(decls))) {
analyze_decl_body(src, scopes, depth, vec_get(decls, i));
i = (i + 1);
}
return undefined;
}
export function analyze_program(src, decls) {
const scopes = vec_new();
vec_push(scopes, vec_new());
const depth = 1;
analyze_decls(src, scopes, depth, decls);
return undefined;
}
