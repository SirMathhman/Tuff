// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "./rt/vec.mjs";
import { error_at, warn_at } from "./util/diagnostics.mjs";
import { span_start } from "./ast.mjs";
let __fluff_unused_locals = 0;
let __fluff_unused_params = 0;
let __fluff_complexity = 0;
let __fluff_complexity_threshold = 15;
export function set_fluff_options(unusedLocalsSeverity, unusedParamsSeverity) {
__fluff_unused_locals = unusedLocalsSeverity;
__fluff_unused_params = unusedParamsSeverity;
return undefined;
}
export function set_fluff_complexity_options(complexitySeverity, threshold) {
__fluff_complexity = complexitySeverity;
__fluff_complexity_threshold = (threshold > 0 ? threshold : 15);
return undefined;
}
export function fluff_emit_at(src, pos, severity, msg) {
if (severity == 1) {
warn_at(src, pos, msg);
return;
}
if (severity == 2) {
error_at(src, pos, msg);
return;
}
return undefined;
}
export function this_struct_name(className) {
return "__This__" + className;
}
export function mk_union_variant_info(name, hasPayload, payloadTyAnns) {
return ({ tag: "UnionVariantInfo", name: name, hasPayload: hasPayload, payloadTyAnns: payloadTyAnns });
}
export function mk_struct_def(name, fields, fieldTyAnns) {
return ({ tag: "StructDef", name: name, deprecatedReason: "", fields: fields, fieldTyAnns: fieldTyAnns });
}
export function mk_fn_sig(name, deprecatedReason, typeParams, params, paramTyAnns, retTyAnn) {
return ({ tag: "FnSig", name: name, deprecatedReason: deprecatedReason, typeParams: typeParams, params: params, paramTyAnns: paramTyAnns, retTyAnn: retTyAnn });
}
export function mk_union_def(name, typeParams, variants) {
return ({ tag: "UnionDef", name: name, deprecatedReason: "", typeParams: typeParams, variants: variants });
}
export function mk_binding(name, isMut, tyTag, deprecatedReason, declPos, read, written, isParam) {
return ({ tag: "Binding", name: name, isMut: isMut, tyTag: tyTag, deprecatedReason: deprecatedReason, declPos: declPos, read: read, written: written, isParam: isParam });
}
export function mk_subst(name, ty) {
return ({ tag: "TySubst", name: name, ty: ty });
}
export function mk_narrowed_tag(name, variant) {
return ({ tag: "NarrowedTag", name: name, variant: variant });
}
export function is_ascii_ws(ch) {
return ch == 32 || ch == 9 || ch == 10 || ch == 13;
}
export function is_ascii_space_tab(ch) {
return ch == 32 || ch == 9;
}
export function ascii_lower(ch) {
if (ch >= 65 && ch <= 90) {
return ch + 32;
}
return ch;
}
export function trim_ascii_ws(s) {
let start = 0;
let end = stringLen(s);
while (start < end && is_ascii_ws(stringCharCodeAt(s, start))) {
start = start + 1;
}
while (end > start && is_ascii_ws(stringCharCodeAt(s, end - 1))) {
end = end - 1;
}
return stringSlice(s, start, end);
}
export function starts_with_deprecated_ci(s) {
if (stringLen(s) < 10) {
return false;
}
let i = 0;
while (i < 10) {
const ch = ascii_lower(stringCharCodeAt(s, i));
const want = stringCharCodeAt("deprecated", i);
if (ch != want) {
return false;
}
i = i + 1;
}
return true;
}
export function parse_deprecated_reason_from_comment(commentText) {
const t0 = trim_ascii_ws(commentText);
if (!starts_with_deprecated_ci(t0)) {
return "";
}
let i = 10;
while (i < stringLen(t0) && is_ascii_ws(stringCharCodeAt(t0, i))) {
i = i + 1;
}
if (i >= stringLen(t0)) {
return "";
}
const sep = stringCharCodeAt(t0, i);
if (!(sep == 45 || sep == 58)) {
return "";
}
i = i + 1;
while (i < stringLen(t0) && is_ascii_ws(stringCharCodeAt(t0, i))) {
i = i + 1;
}
return trim_ascii_ws(stringSlice(t0, i, stringLen(t0)));
}
export function skip_ws_back(src, pos) {
let i = pos;
while (i > 0 && is_ascii_ws(stringCharCodeAt(src, i - 1))) {
i = i - 1;
}
return i;
}
export function line_start(src, pos) {
let i = pos;
while (i > 0 && stringCharCodeAt(src, i - 1) != 10) {
i = i - 1;
}
return i;
}
export function line_end(src, pos) {
let i = pos;
while (i < stringLen(src) && stringCharCodeAt(src, i) != 10) {
i = i + 1;
}
return i;
}
export function block_comment_start(src, endStarPos) {
let i = endStarPos;
while (i >= 2) {
if (stringCharCodeAt(src, i - 2) == 47 && stringCharCodeAt(src, i - 1) == 42) {
return i - 2;
}
i = i - 1;
}
return -1;
}
export function deprecation_reason_before(src, pos) {
let k = pos;
while (true) {
k = skip_ws_back(src, k);
if (k <= 0) {
return "";
}
if (k >= 2 && stringCharCodeAt(src, k - 2) == 42 && stringCharCodeAt(src, k - 1) == 47) {
const start = block_comment_start(src, k - 2);
if (start == -1) {
return "";
}
const inner = stringSlice(src, start + 2, k - 2);
const reason = parse_deprecated_reason_from_comment(inner);
if (reason != "") {
return reason;
}
k = start;
continue;
}
const ls = line_start(src, k);
let p = ls;
while (p < k && is_ascii_space_tab(stringCharCodeAt(src, p))) {
p = p + 1;
}
if (p + 1 < stringLen(src) && stringCharCodeAt(src, p) == 47 && stringCharCodeAt(src, p + 1) == 47) {
const le = line_end(src, p + 2);
const inner = stringSlice(src, p + 2, le);
const reason = parse_deprecated_reason_from_comment(inner);
if (reason != "") {
return reason;
}
k = ls;
continue;
}
return "";
}
return undefined;
}
export function narrow_lookup(narrowed, name) {
let i = 0;
while (i < vec_len(narrowed)) {
const n = vec_get(narrowed, i);
if (n.name == name) {
return n.variant;
}
i = i + 1;
}
return "";
}
export function narrow_clone(narrowed) {
const out = vec_new();
let i = 0;
while (i < vec_len(narrowed)) {
vec_push(out, vec_get(narrowed, i));
i = i + 1;
}
return out;
}
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
export function infer_int_const(e) {
if (e.tag == "EInt") {
return e.value;
}
return -1;
}
export function type_is_ws(ch) {
return ch == 32 || ch == 9 || ch == 10 || ch == 13;
}
export function ty_is_digit(ch) {
return ch >= 48 && ch <= 57;
}
export function ty_skip_ws(t, i) {
let k = i;
while (k < stringLen(t) && type_is_ws(stringCharCodeAt(t, k))) {
k = k + 1;
}
return k;
}
export function ty_starts_with(t, i, s) {
let j = 0;
while (j < stringLen(s)) {
if (!(i + j < stringLen(t))) {
return false;
}
if (stringCharCodeAt(t, i + j) != stringCharCodeAt(s, j)) {
return false;
}
j = j + 1;
}
return true;
}
export function ty_unknown() {
return "Unknown";
}
export function ty_int_lit() {
return "IntLit";
}
export function ty_float_lit() {
return "FloatLit";
}
export function ty_bool() {
return "Bool";
}
export function ty_i32() {
return "I32";
}
export function ty_i8() {
return "I8";
}
export function ty_i16() {
return "I16";
}
export function ty_i64() {
return "I64";
}
export function ty_f32() {
return "F32";
}
export function ty_f64() {
return "F64";
}
export function ty_u32() {
return "U32";
}
export function ty_u8() {
return "U8";
}
export function ty_u16() {
return "U16";
}
export function ty_u64() {
return "U64";
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
export function ty_never() {
return "Never";
}
export function ty_fn_type(typeParams, paramTyAnns, retTyAnn) {
let out = "Fn";
if (vec_len(typeParams) > 0) {
out = out + "<";
let ti = 0;
while (ti < vec_len(typeParams)) {
if (ti > 0) {
out = out + ",";
}
out = out + normalize_ty_ann(vec_get(typeParams, ti));
ti = ti + 1;
}
out = out + ">";
}
out = out + "(";
let i = 0;
while (i < vec_len(paramTyAnns)) {
if (i > 0) {
out = out + ",";
}
const t = vec_get(paramTyAnns, i);
out = out + normalize_ty_ann((t == "" ? ty_unknown() : t));
i = i + 1;
}
const rt = (retTyAnn == "" ? ty_unknown() : normalize_ty_ann(retTyAnn));
out = out + ")->" + rt;
return out;
}
export function ty_is_fn_type(t) {
if (stringLen(t) < 2) {
return false;
}
if (!(stringSlice(t, 0, 2) == "Fn")) {
return false;
}
return true;
}
export function ty_fn_type_params(t) {
const out = vec_new();
if (stringLen(t) < 3) {
return out;
}
if (!(stringSlice(t, 0, 2) == "Fn")) {
return out;
}
if (!(stringLen(t) >= 3 && stringCharCodeAt(t, 2) == 60)) {
return out;
}
let i = 3;
let start = i;
while (i < stringLen(t)) {
const ch = stringCharCodeAt(t, i);
if (ch == 44) {
vec_push(out, normalize_ty_ann(stringSlice(t, start, i)));
i = i + 1;
start = i;
continue;
}
if (ch == 62) {
if (i > start) {
vec_push(out, normalize_ty_ann(stringSlice(t, start, i)));
}
return out;
}
i = i + 1;
}
return out;
}
export function ty_fn_ret(t) {
const pat = ")->";
let i = 0;
while (i + stringLen(pat) <= stringLen(t)) {
if (stringSlice(t, i, i + stringLen(pat)) == pat) {
return stringSlice(t, i + stringLen(pat), stringLen(t));
}
i = i + 1;
}
return ty_unknown();
}
export function ty_fn_param_tys(t) {
const out = vec_new();
if (!ty_is_fn_type(t)) {
return out;
}
let i = 2;
if (i < stringLen(t) && stringCharCodeAt(t, i) == 60) {
let depth = 1;
i = i + 1;
while (i < stringLen(t) && depth > 0) {
const ch = stringCharCodeAt(t, i);
if (ch == 60) {
depth = depth + 1;
}
if (ch == 62) {
depth = depth - 1;
}
i = i + 1;
}
}
while (i < stringLen(t) && stringCharCodeAt(t, i) != 40) {
i = i + 1;
}
if (!(i < stringLen(t) && stringCharCodeAt(t, i) == 40)) {
return out;
}
let k = i + 1;
let start = k;
let angleDepth = 0;
let bracketDepth = 0;
while (k < stringLen(t)) {
const ch = stringCharCodeAt(t, k);
if (ch == 60) {
angleDepth = angleDepth + 1;
k = k + 1;
continue;
}
if (ch == 62) {
if (angleDepth > 0) {
angleDepth = angleDepth - 1;
}
k = k + 1;
continue;
}
if (ch == 91) {
bracketDepth = bracketDepth + 1;
k = k + 1;
continue;
}
if (ch == 93) {
if (bracketDepth > 0) {
bracketDepth = bracketDepth - 1;
}
k = k + 1;
continue;
}
if (ch == 44 && angleDepth == 0 && bracketDepth == 0) {
const part = stringSlice(t, start, k);
const trimmedStart = ty_skip_ws(part, 0);
let trimmedEnd = stringLen(part);
while (trimmedEnd > 0 && type_is_ws(stringCharCodeAt(part, trimmedEnd - 1))) {
trimmedEnd = trimmedEnd - 1;
}
if (trimmedEnd > trimmedStart) {
vec_push(out, normalize_ty_ann(stringSlice(part, trimmedStart, trimmedEnd)));
}
k = k + 1;
start = k;
continue;
}
if (ch == 41 && angleDepth == 0 && bracketDepth == 0) {
const part = stringSlice(t, start, k);
const trimmedStart = ty_skip_ws(part, 0);
let trimmedEnd = stringLen(part);
while (trimmedEnd > 0 && type_is_ws(stringCharCodeAt(part, trimmedEnd - 1))) {
trimmedEnd = trimmedEnd - 1;
}
if (trimmedEnd > trimmedStart) {
vec_push(out, normalize_ty_ann(stringSlice(part, trimmedStart, trimmedEnd)));
}
return out;
}
k = k + 1;
}
return out;
}
export function normalize_ty_ann(t) {
if (t == "Int") {
return ty_i32();
}
if (t == "I8") {
return ty_i8();
}
if (t == "I16") {
return ty_i16();
}
if (t == "I32") {
return ty_i32();
}
if (t == "I64") {
return ty_i64();
}
if (t == "F32") {
return ty_f32();
}
if (t == "F64") {
return ty_f64();
}
if (t == "U8") {
return ty_u8();
}
if (t == "U16") {
return ty_u16();
}
if (t == "U32") {
return ty_u32();
}
if (t == "U64") {
return ty_u64();
}
if (t == "Char") {
return ty_char();
}
if (t == "Bool") {
return ty_bool();
}
if (t == "String") {
return ty_string();
}
if (t == "Void") {
return ty_void();
}
if (t == "Never") {
return ty_never();
}
return t;
}
export function ParsedTyApp(ok, callee, args, nextPos) {
return { ok: ok, callee: callee, args: args, nextPos: nextPos };
}
export function ParsedTyArray(ok, elem, init, len) {
return { ok: ok, elem: elem, init: init, len: len };
}
export function vec_contains_str(v, s) {
let i = 0;
while (i < vec_len(v)) {
if (vec_get(v, i) == s) {
return true;
}
i = i + 1;
}
return false;
}
export function ty_is_type_var(typeParams, t) {
return vec_contains_str(typeParams, t);
}
export function ty_parse_app(t) {
let i = 0;
i = ty_skip_ws(t, i);
let lt = -1;
let depth = 0;
while (i < stringLen(t)) {
const ch = stringCharCodeAt(t, i);
if (ch == 60) {
if (depth == 0) {
lt = i;
break;
}
depth = depth + 1;
i = i + 1;
continue;
}
if (ch == 62) {
if (depth > 0) {
depth = depth - 1;
}
i = i + 1;
continue;
}
i = i + 1;
}
if (lt == -1) {
return ParsedTyApp(false, "", vec_new(), 0);
}
const callee = stringSlice(t, 0, lt);
let k = lt + 1;
const args = vec_new();
let start = k;
let aDepth = 0;
while (k < stringLen(t)) {
const ch = stringCharCodeAt(t, k);
if (ch == 60) {
aDepth = aDepth + 1;
k = k + 1;
continue;
}
if (ch == 62) {
if (aDepth == 0) {
const part = stringSlice(t, start, k);
const trimmedStart = ty_skip_ws(part, 0);
let trimmedEnd = stringLen(part);
while (trimmedEnd > 0 && type_is_ws(stringCharCodeAt(part, trimmedEnd - 1))) {
trimmedEnd = trimmedEnd - 1;
}
vec_push(args, stringSlice(part, trimmedStart, trimmedEnd));
return ParsedTyApp(true, callee, args, k + 1);
}
aDepth = aDepth - 1;
k = k + 1;
continue;
}
if (ch == 44 && aDepth == 0) {
const part = stringSlice(t, start, k);
const trimmedStart = ty_skip_ws(part, 0);
let trimmedEnd = stringLen(part);
while (trimmedEnd > 0 && type_is_ws(stringCharCodeAt(part, trimmedEnd - 1))) {
trimmedEnd = trimmedEnd - 1;
}
vec_push(args, stringSlice(part, trimmedStart, trimmedEnd));
k = k + 1;
start = k;
continue;
}
k = k + 1;
}
return ParsedTyApp(false, "", vec_new(), 0);
}
export function ty_parse_array(t) {
let i = ty_skip_ws(t, 0);
if (!(i < stringLen(t) && stringCharCodeAt(t, i) == 91)) {
return ParsedTyArray(false, "", 0, 0);
}
let end = stringLen(t);
while (end > 0 && type_is_ws(stringCharCodeAt(t, end - 1))) {
end = end - 1;
}
if (!(end > 0 && stringCharCodeAt(t, end - 1) == 93)) {
return ParsedTyArray(false, "", 0, 0);
}
let k = i + 1;
let partStart = k;
const parts = vec_new();
let depth = 0;
while (k < end - 1) {
const ch = stringCharCodeAt(t, k);
if (ch == 60) {
depth = depth + 1;
k = k + 1;
continue;
}
if (ch == 62) {
if (depth > 0) {
depth = depth - 1;
}
k = k + 1;
continue;
}
if (ch == 59 && depth == 0) {
vec_push(parts, stringSlice(t, partStart, k));
k = k + 1;
partStart = k;
continue;
}
k = k + 1;
}
vec_push(parts, stringSlice(t, partStart, end - 1));
if (vec_len(parts) != 3) {
return ParsedTyArray(false, "", 0, 0);
}
const elemRaw = vec_get(parts, 0);
const elem = stringSlice(elemRaw, ty_skip_ws(elemRaw, 0), stringLen(elemRaw));
const initStr = vec_get(parts, 1);
const lenStr = vec_get(parts, 2);
let p = ty_skip_ws(initStr, 0);
let init = 0;
while (p < stringLen(initStr) && ty_is_digit(stringCharCodeAt(initStr, p))) {
init = init * 10 + (stringCharCodeAt(initStr, p) - 48);
p = p + 1;
}
p = ty_skip_ws(lenStr, 0);
let len = 0;
while (p < stringLen(lenStr) && ty_is_digit(stringCharCodeAt(lenStr, p))) {
len = len * 10 + (stringCharCodeAt(lenStr, p) - 48);
p = p + 1;
}
return ParsedTyArray(true, elem, init, len);
}
export function ty_is_slice(t) {
const i = ty_skip_ws(t, 0);
return ty_starts_with(t, i, "*[");
}
export function ty_slice_inner(t) {
const i = ty_skip_ws(t, 0);
let k = i + 2;
let end = stringLen(t);
while (end > 0 && type_is_ws(stringCharCodeAt(t, end - 1))) {
end = end - 1;
}
return stringSlice(t, k, end - 1);
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
export function type_is_unknown(t) {
return t == ty_unknown() || t == "";
}
export function type_is_int_like(t) {
const tt = normalize_ty_ann(t);
if (tt == ty_int_lit()) {
return true;
}
if (tt == ty_i8()) {
return true;
}
if (tt == ty_i16()) {
return true;
}
if (tt == ty_i32()) {
return true;
}
if (tt == ty_i64()) {
return true;
}
if (tt == ty_u8()) {
return true;
}
if (tt == ty_u16()) {
return true;
}
if (tt == ty_u32()) {
return true;
}
if (tt == ty_u64()) {
return true;
}
if (tt == ty_char()) {
return true;
}
return false;
}
export function type_is_concrete_int(t) {
const tt = normalize_ty_ann(t);
if (tt == ty_i8()) {
return true;
}
if (tt == ty_i16()) {
return true;
}
if (tt == ty_i32()) {
return true;
}
if (tt == ty_i64()) {
return true;
}
if (tt == ty_u8()) {
return true;
}
if (tt == ty_u16()) {
return true;
}
if (tt == ty_u32()) {
return true;
}
if (tt == ty_u64()) {
return true;
}
return false;
}
export function type_is_float_like(t) {
const tt = normalize_ty_ann(t);
if (tt == ty_float_lit()) {
return true;
}
if (tt == ty_f32()) {
return true;
}
if (tt == ty_f64()) {
return true;
}
return false;
}
export function type_is_concrete_float(t) {
const tt = normalize_ty_ann(t);
if (tt == ty_f32()) {
return true;
}
if (tt == ty_f64()) {
return true;
}
return false;
}
export function should_enforce_expected_type(structs, expected) {
const e = normalize_ty_ann(expected);
if (e == ty_bool()) {
return true;
}
if (e == ty_i8()) {
return true;
}
if (e == ty_i16()) {
return true;
}
if (e == ty_i32()) {
return true;
}
if (e == ty_i64()) {
return true;
}
if (e == ty_f32()) {
return true;
}
if (e == ty_f64()) {
return true;
}
if (e == ty_u8()) {
return true;
}
if (e == ty_u16()) {
return true;
}
if (e == ty_u32()) {
return true;
}
if (e == ty_u64()) {
return true;
}
if (e == ty_char()) {
return true;
}
if (e == ty_string()) {
return true;
}
if (e == ty_void()) {
return true;
}
if (e == ty_never()) {
return true;
}
if (has_struct_def(structs, e)) {
return true;
}
return false;
}
export function type_compatible(structs, expected, actual) {
if (expected == "") {
return true;
}
if (!should_enforce_expected_type(structs, expected)) {
return true;
}
if (type_is_unknown(actual)) {
return true;
}
if (normalize_ty_ann(actual) == ty_never()) {
return true;
}
if (normalize_ty_ann(actual) == ty_int_lit() && type_is_int_like(expected)) {
return true;
}
if (normalize_ty_ann(actual) == ty_float_lit() && type_is_float_like(expected)) {
return true;
}
return normalize_ty_ann(expected) == normalize_ty_ann(actual);
}
export function require_type_compatible(src, pos, ctx, structs, expected, actual) {
if (!type_compatible(structs, expected, actual)) {
error_at(src, pos, ctx + ": expected " + normalize_ty_ann(expected) + ", got " + normalize_ty_ann(actual));
}
return undefined;
}
export function path_dotted(parts) {
let out = "";
let i = 0;
while (i < vec_len(parts)) {
if (i > 0) {
out = out + ".";
}
out = out + vec_get(parts, i);
i = i + 1;
}
return out;
}
export function struct_name_of_expr(src, nameExpr) {
if (nameExpr.tag == "EIdent") {
return nameExpr.name;
}
if (nameExpr.tag == "EPath") {
return path_dotted(nameExpr.parts);
}
error_at(src, span_start(nameExpr.span), "struct literal name must be ident or path");
return "";
}
export function find_struct_def(structs, name) {
let i = 0;
while (i < vec_len(structs)) {
const s = vec_get(structs, i);
if (s.name == name) {
return s;
}
i = i + 1;
}
return mk_struct_def(name, vec_new(), vec_new());
}
export function has_struct_def(structs, name) {
let i = 0;
while (i < vec_len(structs)) {
if (vec_get(structs, i).name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function struct_field_index(s, field) {
let i = 0;
while (i < vec_len(s.fields)) {
if (vec_get(s.fields, i) == field) {
return i;
}
i = i + 1;
}
return -1;
}
export function get_struct_field_type(src, pos, structs, structName, field) {
if (!has_struct_def(structs, structName)) {
error_at(src, pos, "unknown struct: " + structName);
return ty_unknown();
}
const s = find_struct_def(structs, structName);
const idx = struct_field_index(s, field);
if (idx == -1) {
error_at(src, pos, "unknown field " + field + " on struct " + structName);
return ty_unknown();
}
if (idx < vec_len(s.fieldTyAnns)) {
const t = vec_get(s.fieldTyAnns, idx);
if (t != "") {
return normalize_ty_ann(t);
}
}
return ty_unknown();
}
export function find_fn_sig(fns, name) {
let i = 0;
while (i < vec_len(fns)) {
const s = vec_get(fns, i);
if (s.name == name) {
return s;
}
i = i + 1;
}
return mk_fn_sig(name, "", vec_new(), vec_new(), vec_new(), "");
}
export function has_fn_sig(fns, name) {
let i = 0;
while (i < vec_len(fns)) {
if (vec_get(fns, i).name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function find_union_def(unions, name) {
let i = 0;
while (i < vec_len(unions)) {
const u = vec_get(unions, i);
if (u.name == name) {
return u;
}
i = i + 1;
}
return mk_union_def(name, vec_new(), vec_new());
}
export function has_union_def(unions, name) {
let i = 0;
while (i < vec_len(unions)) {
if (vec_get(unions, i).name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function union_has_variant(u, variantName) {
const vs = u.variants;
let i = 0;
while (i < vec_len(vs)) {
if (vec_get(vs, i).name == variantName) {
return true;
}
i = i + 1;
}
return false;
}
export function find_union_by_variant(unions, variantName) {
let i = 0;
while (i < vec_len(unions)) {
const u = vec_get(unions, i);
if (union_has_variant(u, variantName)) {
return u;
}
i = i + 1;
}
return mk_union_def("", vec_new(), vec_new());
}
export function union_variant_index(u, variantName) {
const vs = u.variants;
let i = 0;
while (i < vec_len(vs)) {
if (vec_get(vs, i).name == variantName) {
return i;
}
i = i + 1;
}
return -1;
}
export function union_variant_has_payload(u, variantName) {
const idx = union_variant_index(u, variantName);
if (idx == -1) {
return false;
}
return vec_get(u.variants, idx).hasPayload;
}
export function union_variant_payload_ty_anns(u, variantName) {
const idx = union_variant_index(u, variantName);
if (idx == -1) {
return vec_new();
}
return vec_get(u.variants, idx).payloadTyAnns;
}
export function scopes_contains(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let ni = 0;
while (ni < vec_len(scope)) {
const b = vec_get(scope, ni);
if (b.name == name) {
return true;
}
ni = ni + 1;
}
si = si + 1;
}
return false;
}
export function scopes_enter(scopes, depth) {
const s = vec_new();
(depth < vec_len(scopes) ? (() => {
vec_set(scopes, depth, s);
return undefined;
})() : (() => {
vec_push(scopes, s);
return undefined;
})());
return depth + 1;
}
export function declare_name(src, pos, scopes, depth, name, isMut, tyTag) {
if (scopes_contains(scopes, depth, name)) {
error_at(src, pos, "shadowing not allowed: " + name);
}
const cur = vec_get(scopes, depth - 1);
vec_push(cur, mk_binding(name, isMut, tyTag, "", pos, false, true, false));
return undefined;
}
export function declare_name_deprecated(src, pos, scopes, depth, name, isMut, tyTag, deprecatedReason) {
if (scopes_contains(scopes, depth, name)) {
error_at(src, pos, "shadowing not allowed: " + name);
}
const cur = vec_get(scopes, depth - 1);
vec_push(cur, mk_binding(name, isMut, tyTag, deprecatedReason, pos, false, true, false));
return undefined;
}
export function scope_contains(scope, name) {
let i = 0;
while (i < vec_len(scope)) {
const b = vec_get(scope, i);
if (b.name == name) {
return true;
}
i = i + 1;
}
return false;
}
export function declare_local_name(src, pos, scopes, depth, name, isMut, tyTag) {
const cur = vec_get(scopes, depth - 1);
if (scope_contains(cur, name)) {
error_at(src, pos, "duplicate name: " + name);
return;
}
vec_push(cur, mk_binding(name, isMut, tyTag, "", pos, false, true, true));
return undefined;
}
export function declare_local_name_deprecated(src, pos, scopes, depth, name, isMut, tyTag, deprecatedReason) {
const cur = vec_get(scopes, depth - 1);
if (scope_contains(cur, name)) {
error_at(src, pos, "duplicate name: " + name);
return;
}
vec_push(cur, mk_binding(name, isMut, tyTag, deprecatedReason, pos, false, true, true));
return undefined;
}
export function lookup_binding(src, pos, scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
return b;
}
bi = bi + 1;
}
si = si + 1;
}
error_at(src, pos, "unknown name: " + name);
return mk_binding(name, false, ty_unknown(), "", pos, false, false, false);
}
export function update_binding_ty(src, pos, scopes, depth, name, newTyTag) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
vec_set(scope, bi, mk_binding(b.name, b.isMut, newTyTag, b.deprecatedReason, b.declPos, b.read, b.written, b.isParam));
return;
}
bi = bi + 1;
}
si = si + 1;
}
error_at(src, pos, "unknown name: " + name);
return undefined;
}
export function binding_name_is_intentionally_unused(name) {
if (name == "_") {
return true;
}
if (stringLen(name) > 0 && stringCharCodeAt(name, 0) == 95) {
return true;
}
return false;
}
export function mark_binding_read(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
if (!b.read) {
vec_set(scope, bi, mk_binding(b.name, b.isMut, b.tyTag, b.deprecatedReason, b.declPos, true, b.written, b.isParam));
}
return;
}
bi = bi + 1;
}
si = si + 1;
}
return undefined;
}
export function mark_binding_written(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
if (!b.written) {
vec_set(scope, bi, mk_binding(b.name, b.isMut, b.tyTag, b.deprecatedReason, b.declPos, b.read, true, b.isParam));
}
return;
}
bi = bi + 1;
}
si = si + 1;
}
return undefined;
}
export function warn_unused_locals_in_scope(src, scopes, depth) {
const severity = __fluff_unused_locals;
if (severity == 0) {
return;
}
const scope = vec_get(scopes, depth - 1);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (!b.read && !b.isParam && !binding_name_is_intentionally_unused(b.name)) {
fluff_emit_at(src, b.declPos, severity, "unused local: " + b.name);
}
bi = bi + 1;
}
return undefined;
}
export function warn_unused_params_in_scope(src, scopes, depth) {
const severity = __fluff_unused_params;
if (severity == 0) {
return;
}
const scope = vec_get(scopes, depth - 1);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (!b.read && b.isParam && !binding_name_is_intentionally_unused(b.name)) {
fluff_emit_at(src, b.declPos, severity, "unused parameter: " + b.name);
}
bi = bi + 1;
}
return undefined;
}
export function cc_expr(e) {
if (e.tag == "EUndefined") {
return 0;
}
if (e.tag == "EInt") {
return 0;
}
if (e.tag == "EFloat") {
return 0;
}
if (e.tag == "EBool") {
return 0;
}
if (e.tag == "EString") {
return 0;
}
if (e.tag == "EIdent") {
return 0;
}
if (e.tag == "EPath") {
return 0;
}
if (e.tag == "ELambda") {
return 0;
}
if (e.tag == "EStructLit") {
let cc = 0;
let i = 0;
while (i < vec_len(e.values)) {
cc = cc + cc_expr(vec_get(e.values, i));
i = i + 1;
}
return cc;
}
if (e.tag == "EUnary") {
return cc_expr(e.expr);
}
if (e.tag == "EBinary") {
let cc = cc_expr(e.left) + cc_expr(e.right);
if (e.op.tag == "OpAnd" || e.op.tag == "OpOr") {
cc = cc + 1;
}
return cc;
}
if (e.tag == "ECall") {
let cc = cc_expr(e.callee);
let i = 0;
while (i < vec_len(e.args)) {
cc = cc + cc_expr(vec_get(e.args, i));
i = i + 1;
}
return cc;
}
if (e.tag == "EIf") {
const cc = 1 + cc_expr(e.cond) + cc_expr(e.thenExpr) + cc_expr(e.elseExpr);
return cc;
}
if (e.tag == "EBlock") {
let cc = cc_stmts(e.body);
cc = cc + cc_expr(e.tail);
return cc;
}
if (e.tag == "EVecLit") {
let cc = 0;
let i = 0;
while (i < vec_len(e.items)) {
cc = cc + cc_expr(vec_get(e.items, i));
i = i + 1;
}
return cc;
}
if (e.tag == "ETupleLit") {
let cc = 0;
let i = 0;
while (i < vec_len(e.items)) {
cc = cc + cc_expr(vec_get(e.items, i));
i = i + 1;
}
return cc;
}
if (e.tag == "EIndex") {
return cc_expr(e.base) + cc_expr(e.index);
}
if (e.tag == "ETupleIndex") {
return cc_expr(e.base);
}
if (e.tag == "EField") {
return cc_expr(e.base);
}
if (e.tag == "EMatch") {
let cc = cc_expr(e.scrut);
const armCount = vec_len(e.arms);
if (armCount > 1) {
cc = cc + armCount - 1;
}
let i = 0;
while (i < armCount) {
const arm = vec_get(e.arms, i);
cc = cc + cc_expr(arm.expr);
i = i + 1;
}
return cc;
}
return 0;
}
export function cc_stmt(s) {
if (s.tag == "SLet") {
return cc_expr(s.init);
}
if (s.tag == "SAssign") {
return cc_expr(s.value);
}
if (s.tag == "SExpr") {
return cc_expr(s.expr);
}
if (s.tag == "SYield") {
return cc_expr(s.expr);
}
if (s.tag == "SWhile") {
const cc = 1 + cc_expr(s.cond) + cc_stmts(s.body);
return cc;
}
if (s.tag == "SIf") {
let cc = 1 + cc_expr(s.cond) + cc_stmts(s.thenBody);
if (s.hasElse) {
cc = cc + cc_stmts(s.elseBody);
}
return cc;
}
if (s.tag == "SIndexAssign") {
return cc_expr(s.base) + cc_expr(s.index) + cc_expr(s.value);
}
if (s.tag == "SFieldAssign") {
return cc_expr(s.base) + cc_expr(s.value);
}
return 0;
}
export function cc_stmts(stmts) {
let cc = 0;
let i = 0;
while (i < vec_len(stmts)) {
cc = cc + cc_stmt(vec_get(stmts, i));
i = i + 1;
}
return cc;
}
export function check_fn_complexity(src, pos, fnName, body, tail) {
const severity = __fluff_complexity;
if (severity == 0) {
return;
}
const cc = 1 + cc_stmts(body) + cc_expr(tail);
const threshold = __fluff_complexity_threshold;
if (cc > threshold) {
const msg = "cyclomatic complexity of " + fnName + " is " + ("" + cc) + " (threshold: " + ("" + threshold) + ")";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
export function check_lambda_complexity(src, pos, name, body) {
const severity = __fluff_complexity;
if (severity == 0) {
return;
}
const cc = 1 + cc_expr(body);
const threshold = __fluff_complexity_threshold;
if (cc > threshold) {
const msg = "cyclomatic complexity of " + name + " is " + ("" + cc) + " (threshold: " + ("" + threshold) + ")";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
export function infer_lookup_ty(scopes, depth, name) {
let si = 0;
while (si < depth) {
const scope = vec_get(scopes, si);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (b.name == name) {
return b.tyTag;
}
bi = bi + 1;
}
si = si + 1;
}
return ty_unknown();
}
export function require_name(src, pos, scopes, depth, name) {
if (name == "true") {
return;
}
if (name == "false") {
return;
}
if (name == "continue") {
return;
}
if (name == "break") {
return;
}
lookup_binding(src, pos, scopes, depth, name);
return undefined;
}
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
if (e.tag == "ECall") {
if (e.callee.tag == "EIdent") {
const thisName = this_struct_name(e.callee.name);
if (has_struct_def(structs, thisName)) {
return thisName;
}
}
if (e.callee.tag == "EIdent" && has_fn_sig(fns, e.callee.name)) {
const sig = find_fn_sig(fns, e.callee.name);
if (sig.retTyAnn != "") {
if (vec_len(sig.typeParams) > 0) {
const subst = vec_new();
if (vec_len(e.typeArgs) > 0) {
if (!(vec_len(e.typeArgs) == vec_len(sig.typeParams))) {
error_at(src, span_start(e.span), "wrong number of type args in call to " + e.callee.name);
}
let ti = 0;
while (ti < vec_len(sig.typeParams)) {
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
}
if (e.callee.tag == "ELambda") {
if (e.callee.retTyAnn != "") {
if (vec_len(e.callee.typeParams) > 0) {
const subst = vec_new();
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
const actual = infer_expr_type(src, structs, fns, scopes, depth, vec_get(e.args, ai));
if (expected != "" && ty_is_type_var(e.callee.typeParams, normalize_ty_ann(expected))) {
subst_bind(subst, normalize_ty_ann(expected), normalize_ty_ann(actual));
}
ai = ai + 1;
}
}
return ty_apply_subst(e.callee.typeParams, subst, e.callee.retTyAnn);
}
return normalize_ty_ann(e.callee.retTyAnn);
}
}
const ct = infer_expr_type(src, structs, fns, scopes, depth, e.callee);
if (ty_is_fn_type(ct)) {
const ret0 = normalize_ty_ann(ty_fn_ret(ct));
const tps = ty_fn_type_params(ct);
if (vec_len(tps) > 0) {
const subst = vec_new();
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
export function infer_expr_type_with_narrowing(src, structs, unions, fns, scopes, depth, narrowed, e) {
if (e.tag == "EField" && e.field == "value" && e.base.tag == "EIdent") {
const t = infer_union_payload_type_from_narrowing(src, unions, scopes, depth, narrowed, e.base.name);
if (!type_is_unknown(t)) {
return t;
}
}
return infer_expr_type(src, structs, fns, scopes, depth, e);
}
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
if (e.op.tag == "OpAdd") {
if (lt == ty_string() || rt == ty_string()) {
return;
}
if (!(type_is_int_like(lt) && type_is_int_like(rt) || type_is_float_like(lt) && type_is_float_like(rt))) {
error_at(src, span_start(e.span), "invalid operands to '+': expected numbers or strings");
}
return;
}
if (e.op.tag == "OpSub" || e.op.tag == "OpMul" || e.op.tag == "OpDiv") {
if (!(type_is_int_like(lt) && type_is_int_like(rt) || type_is_float_like(lt) && type_is_float_like(rt))) {
error_at(src, span_start(e.span), "invalid operands to arithmetic operator");
}
return;
}
if (e.op.tag == "OpLt" || e.op.tag == "OpLe" || e.op.tag == "OpGt" || e.op.tag == "OpGe") {
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
if (e.callee.tag == "ELambda") {
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
export function require_all_param_types(src, pos, prefix, params, paramTyAnns) {
let anyMissing = false;
let msg = "";
let pi = 0;
while (pi < vec_len(params)) {
let ann = "";
if (pi < vec_len(paramTyAnns)) {
ann = vec_get(paramTyAnns, pi);
}
if (ann == "") {
if (!anyMissing) {
anyMissing = true;
msg = prefix + " missing type annotation(s) for parameter(s): ";
} else {
msg = msg + ", ";
}
msg = msg + vec_get(params, pi);
}
pi = pi + 1;
}
if (anyMissing) {
error_at(src, pos, msg);
}
return undefined;
}
export function analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e) {
if (e.tag == "EIdent") {
require_name(src, span_start(e.span), scopes, depth, e.name);
if (!(e.name == "true") && !(e.name == "false") && !(e.name == "continue") && !(e.name == "break")) {
mark_binding_read(scopes, depth, e.name);
const b = lookup_binding(src, span_start(e.span), scopes, depth, e.name);
if (b.deprecatedReason != "") {
warn_at(src, span_start(e.span), "use of deprecated symbol " + e.name + " - " + b.deprecatedReason);
}
}
return;
}
if (e.tag == "ELambda") {
require_all_param_types(src, span_start(e.span), "lambda", e.params, e.paramTyAnns);
const newDepth = scopes_enter(scopes, depth);
let pi = 0;
while (pi < vec_len(e.params)) {
let pTy = ty_unknown();
if (pi < vec_len(e.paramTyAnns)) {
const ann = vec_get(e.paramTyAnns, pi);
if (ann != "") {
pTy = normalize_ty_ann(ann);
}
}
declare_local_name(src, span_start(e.span), scopes, newDepth, vec_get(e.params, pi), false, pTy);
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
if (e.tag == "EStructLit") {
let vi = 0;
while (vi < vec_len(e.values)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.values, vi));
vi = vi + 1;
}
check_struct_lit_types(src, structs, fns, scopes, depth, e);
return;
}
if (e.tag == "EUnary") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.expr);
return;
}
if (e.tag == "EBinary") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.left);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.right);
check_binary_operand_types(src, structs, fns, scopes, depth, e);
return;
}
if (e.tag == "ECall") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.callee);
let ai = 0;
while (ai < vec_len(e.args)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.args, ai));
ai = ai + 1;
}
check_call_types(src, structs, fns, scopes, depth, e);
return;
}
if (e.tag == "EIf") {
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
if (e.tag == "EBlock") {
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, newDepth, narrowed, e.body);
analyze_expr(src, structs, unions, fns, scopes, newDepth, narrowed, e.tail);
warn_unused_locals_in_scope(src, scopes, newDepth);
return;
}
if (e.tag == "EVecLit") {
let ii = 0;
while (ii < vec_len(e.items)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.items, ii));
ii = ii + 1;
}
return;
}
if (e.tag == "ETupleLit") {
let ii = 0;
while (ii < vec_len(e.items)) {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, vec_get(e.items, ii));
ii = ii + 1;
}
return;
}
if (e.tag == "EIndex") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.base);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.index);
if (e.base.tag == "EIdent") {
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
if (e.tag == "ETupleIndex") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.base);
return;
}
if (e.tag == "EField") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.base);
if (e.field == "value" && e.base.tag == "EIdent") {
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
if (e.tag == "EMatch") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, e.scrut);
let scrutName = "";
if (e.scrut.tag == "EIdent") {
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
if (arm.pat.tag == "MPWildcard") {
hasWildcard = true;
}
if (arm.pat.tag == "MPVariant") {
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
return undefined;
}
export function analyze_stmt(src, structs, unions, fns, scopes, depth, narrowed, s) {
if (s.tag == "SLet") {
const depReason = deprecation_reason_before(src, span_start(s.span));
if (s.init.tag == "ELambda") {
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
if (s.init.tag == "EIdent" && has_fn_sig(fns, s.init.name)) {
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
if (s.tag == "SAssign") {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.name);
if (!b.isMut) {
error_at(src, span_start(s.span), "cannot assign to immutable binding: " + s.name);
}
mark_binding_written(scopes, depth, s.name);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.value);
return;
}
if (s.tag == "SExpr") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.expr);
return;
}
if (s.tag == "SYield") {
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.expr);
return;
}
if (s.tag == "SWhile") {
check_cond_is_bool(src, structs, fns, scopes, depth, s.cond);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.cond);
const newDepth = scopes_enter(scopes, depth);
analyze_stmts(src, structs, unions, fns, scopes, newDepth, narrowed, s.body);
warn_unused_locals_in_scope(src, scopes, newDepth);
return;
}
if (s.tag == "SIf") {
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
if (s.tag == "SIndexAssign") {
if (s.base.tag == "EIdent") {
const b = lookup_binding(src, span_start(s.span), scopes, depth, s.base.name);
if (!b.isMut) {
error_at(src, span_start(s.span), "cannot assign through immutable binding: " + s.base.name);
}
}
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.base);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.index);
analyze_expr(src, structs, unions, fns, scopes, depth, narrowed, s.value);
if (s.base.tag == "EIdent") {
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
if (s.tag == "SFieldAssign") {
if (s.base.tag == "EIdent") {
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
if (st.tag == "SLet" && st.init.tag == "ELambda") {
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
