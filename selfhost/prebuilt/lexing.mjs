// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "./rt/stdlib.mjs";
import { panic_at } from "./diagnostics.mjs";
export function is_digit(code) {
return ((code >= 48) && (code <= 57));
}
export function is_space(code) {
return ((((code == 32) || (code == 10)) || (code == 9)) || (code == 13));
}
export function is_alpha(code) {
return ((((code >= 65) && (code <= 90))) || (((code >= 97) && (code <= 122))));
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
if ((!(((j + 1) < stringLen(src))))) {
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
