// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
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
export function ty_has_drop(t) {
let i = stringLen(t) - 1;
while (i >= 0) {
const ch = stringCharCodeAt(t, i);
if (ch == 33) {
return true;
}
i = i - 1;
}
return false;
}
export function ty_get_drop_fn(t) {
let i = stringLen(t) - 1;
while (i >= 0) {
const ch = stringCharCodeAt(t, i);
if (ch == 33) {
return stringSlice(t, i + 1, stringLen(t));
}
i = i - 1;
}
return "";
}
export function ty_strip_drop(t) {
let i = stringLen(t) - 1;
while (i >= 0) {
const ch = stringCharCodeAt(t, i);
if (ch == 33) {
return stringSlice(t, 0, i);
}
i = i - 1;
}
return t;
}
export function ty_is_pointer(t) {
return ty_starts_with(t, 0, "*mut ");
}
export function ty_ptr_inner(t) {
if (ty_is_pointer(t)) {
return stringSlice(t, 5, stringLen(t));
}
return t;
}
export function ty_ptr(inner) {
return "*mut " + inner;
}
