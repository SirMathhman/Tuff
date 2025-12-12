// compiled by selfhost tuffc
import { stringLen, stringSlice, stringCharCodeAt } from "./rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "./rt/vec.mjs";
import { panic_at } from "./diagnostics.mjs";
export function LexItem(tag, startPos, endPos, text) {
return { tag: tag, startPos: startPos, endPos: endPos, text: text };
}
export function is_digit(code) {
return ((code >= 48) && (code <= 57));
}
export function is_space(code) {
return ((((code == 32) || (code == 10)) || (code == 9)) || (code == 13));
}
export function is_alpha(code) {
return (((code >= 65) && (code <= 90)) || ((code >= 97) && (code <= 122)));
}
export function is_ident_start(code) {
return (is_alpha(code) || (code == 95));
}
export function is_ident_part(code) {
return (is_ident_start(code) || is_digit(code));
}
export function skip_ws(src, i) {
let j = i;
while ((j < stringLen(src))) {
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_space(c))) {
break;
}
j = (j + 1);
}
if ((!((j + 1) < stringLen(src)))) {
return j;
}
const c0 = stringCharCodeAt(src, j);
const c1 = stringCharCodeAt(src, (j + 1));
if (((c0 == 47) && (c1 == 47))) {
j = (j + 2);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((c == 10)) {
break;
}
j = (j + 1);
}
continue;
}
if (((c0 == 47) && (c1 == 42))) {
const commentStart = j;
j = (j + 2);
let found = false;
while (((j + 1) < stringLen(src))) {
const a = stringCharCodeAt(src, j);
const b = stringCharCodeAt(src, (j + 1));
if (((a == 42) && (b == 47))) {
j = (j + 2);
found = true;
break;
}
j = (j + 1);
}
if ((!found)) {
panic_at(src, commentStart, "unterminated block comment");
}
continue;
}
break;
}
return j;
}
export function starts_with_at(src, i, lit) {
let j = 0;
while ((j < stringLen(lit))) {
if (((i + j) >= stringLen(src))) {
return false;
}
if ((stringCharCodeAt(src, (i + j)) != stringCharCodeAt(lit, j))) {
return false;
}
j = (j + 1);
}
return true;
}
export function skip_ws_collect(src, i, items) {
let j = i;
while ((j < stringLen(src))) {
if (is_space(stringCharCodeAt(src, j))) {
const start = j;
while (((j < stringLen(src)) && is_space(stringCharCodeAt(src, j)))) {
j = (j + 1);
}
vec_push(items, LexItem("TriviaWhitespace", start, j, stringSlice(src, start, j)));
continue;
}
if ((!((j + 1) < stringLen(src)))) {
return j;
}
const c0 = stringCharCodeAt(src, j);
const c1 = stringCharCodeAt(src, (j + 1));
if (((c0 == 47) && (c1 == 47))) {
const start = j;
j = (j + 2);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((c == 10)) {
break;
}
j = (j + 1);
}
vec_push(items, LexItem("TriviaLineComment", start, j, stringSlice(src, start, j)));
continue;
}
if (((c0 == 47) && (c1 == 42))) {
const commentStart = j;
const start = j;
j = (j + 2);
let found = false;
while (((j + 1) < stringLen(src))) {
const a = stringCharCodeAt(src, j);
const b = stringCharCodeAt(src, (j + 1));
if (((a == 42) && (b == 47))) {
j = (j + 2);
found = true;
break;
}
j = (j + 1);
}
if ((!found)) {
panic_at(src, commentStart, "unterminated block comment");
}
vec_push(items, LexItem("TriviaBlockComment", start, j, stringSlice(src, start, j)));
continue;
}
break;
}
return j;
}
export function lex_items_with_trivia(src) {
const items = vec_new();
let i = 0;
while ((i < stringLen(src))) {
const j = skip_ws_collect(src, i, items);
if ((j != i)) {
i = j;
continue;
}
const start = i;
let k = i;
while ((k < stringLen(src))) {
const c = stringCharCodeAt(src, k);
if (is_space(c)) {
break;
}
if (((c == 47) && ((k + 1) < stringLen(src)))) {
const d = stringCharCodeAt(src, (k + 1));
if (((d == 47) || (d == 42))) {
break;
}
}
k = (k + 1);
}
if ((k == start)) {
k = (start + 1);
}
vec_push(items, LexItem("Code", start, k, stringSlice(src, start, k)));
i = k;
}
return items;
}
export function emit_lex_items(items) {
let out = "";
let i = 0;
while ((i < vec_len(items))) {
out = (out + vec_get(items, i).text);
i = (i + 1);
}
return out;
}
export function roundtrip_with_trivia(src) {
return emit_lex_items(lex_items_with_trivia(src));
}
