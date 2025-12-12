// compiled by selfhost tuffc
import { stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { panic_at } from "./diagnostics.mjs";
export function LexItem(tag, startPos, endPos, text) {
return { tag: tag, startPos: startPos, endPos: endPos, text: text };
}
export function Token(kind, startPos, endPos, text, leadingTrivia) {
return { kind: kind, startPos: startPos, endPos: endPos, text: text, leadingTrivia: leadingTrivia };
}
export function TokenStream(tokens, trailingTrivia) {
return { tokens: tokens, trailingTrivia: trailingTrivia };
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
export function emit_trivia_items(items) {
let out = "";
let i = 0;
while ((i < vec_len(items))) {
out = (out + vec_get(items, i).text);
i = (i + 1);
}
return out;
}
export function emit_token_stream(ts) {
let out = "";
let i = 0;
while ((i < vec_len(ts.tokens))) {
const tok = vec_get(ts.tokens, i);
out = (out + emit_trivia_items(tok.leadingTrivia));
out = (out + tok.text);
i = (i + 1);
}
out = (out + emit_trivia_items(ts.trailingTrivia));
return out;
}
export function tokenize_with_trivia(src) {
const toks = vec_new();
const trailing = vec_new();
let i = 0;
while ((i < stringLen(src))) {
const leading = vec_new();
const j = skip_ws_collect(src, i, leading);
i = j;
if ((!(i < stringLen(src)))) {
let ti = 0;
while ((ti < vec_len(leading))) {
vec_push(trailing, vec_get(leading, ti));
ti = (ti + 1);
}
break;
}
const c0 = stringCharCodeAt(src, i);
if (is_digit(c0)) {
let k = (i + 1);
while (((k < stringLen(src)) && is_digit(stringCharCodeAt(src, k)))) {
k = (k + 1);
}
vec_push(toks, Token("Number", i, k, stringSlice(src, i, k), leading));
i = k;
continue;
}
if (is_ident_start(c0)) {
let k = (i + 1);
while (((k < stringLen(src)) && is_ident_part(stringCharCodeAt(src, k)))) {
k = (k + 1);
}
vec_push(toks, Token("Ident", i, k, stringSlice(src, i, k), leading));
i = k;
continue;
}
if ((c0 == 34)) {
let k = (i + 1);
let found = false;
while ((k < stringLen(src))) {
const c = stringCharCodeAt(src, k);
if ((c == 92)) {
k = (k + 2);
continue;
}
if ((c == 34)) {
k = (k + 1);
found = true;
break;
}
k = (k + 1);
}
if ((!found)) {
panic_at(src, i, "unterminated string literal");
}
vec_push(toks, Token("String", i, k, stringSlice(src, i, k), leading));
i = k;
continue;
}
if ((c0 == 39)) {
let k = (i + 1);
let found = false;
while ((k < stringLen(src))) {
const c = stringCharCodeAt(src, k);
if ((c == 92)) {
k = (k + 2);
continue;
}
if ((c == 39)) {
k = (k + 1);
found = true;
break;
}
k = (k + 1);
}
if ((!found)) {
panic_at(src, i, "unterminated char literal");
}
vec_push(toks, Token("Char", i, k, stringSlice(src, i, k), leading));
i = k;
continue;
}
if (((i + 1) < stringLen(src))) {
if ((((((((((c0 == 61) && (stringCharCodeAt(src, (i + 1)) == 62)) || ((c0 == 58) && (stringCharCodeAt(src, (i + 1)) == 58))) || ((c0 == 61) && (stringCharCodeAt(src, (i + 1)) == 61))) || ((c0 == 33) && (stringCharCodeAt(src, (i + 1)) == 61))) || ((c0 == 60) && (stringCharCodeAt(src, (i + 1)) == 61))) || ((c0 == 62) && (stringCharCodeAt(src, (i + 1)) == 61))) || ((c0 == 38) && (stringCharCodeAt(src, (i + 1)) == 38))) || ((c0 == 124) && (stringCharCodeAt(src, (i + 1)) == 124)))) {
vec_push(toks, Token("Op", i, (i + 2), stringSlice(src, i, (i + 2)), leading));
i = (i + 2);
continue;
}
}
if ((((((((((((c0 == 43) || (c0 == 45)) || (c0 == 42)) || (c0 == 47)) || (c0 == 37)) || (c0 == 61)) || (c0 == 60)) || (c0 == 62)) || (c0 == 33)) || (c0 == 38)) || (c0 == 124))) {
vec_push(toks, Token("Op", i, (i + 1), stringSlice(src, i, (i + 1)), leading));
} else {
vec_push(toks, Token("Punct", i, (i + 1), stringSlice(src, i, (i + 1)), leading));
}
i = (i + 1);
}
return TokenStream(toks, trailing);
}
