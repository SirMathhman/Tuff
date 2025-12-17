// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { is_ident_part, is_ident_start, skip_ws } from "../util/lexing.mjs";
export function is_assignment_operator(src, j) {
if (!(j < stringLen(src) && stringCharCodeAt(src, j) == 61)) {
return false;
}
if (j + 1 < stringLen(src)) {
const n = stringCharCodeAt(src, j + 1);
if (n == 61 || n == 62) {
return false;
}
}
return true;
}
export function is_index_assign_stmt_start_impl(src, i) {
let j = skip_ws(src, i);
if (!(j < stringLen(src))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if (!is_ident_start(c0)) {
return false;
}
j = j + 1;
while (j < stringLen(src)) {
const c = stringCharCodeAt(src, j);
if (!is_ident_part(c)) {
break;
}
j = j + 1;
}
j = skip_ws(src, j);
if (!(j < stringLen(src) && stringCharCodeAt(src, j) == 91)) {
return false;
}
let k = j + 1;
let depth = 1;
while (k < stringLen(src) && depth > 0) {
const ch = stringCharCodeAt(src, k);
if (ch == 34) {
k = k + 1;
while (k < stringLen(src)) {
const c = stringCharCodeAt(src, k);
if (c == 92) {
k = k + 2;
continue;
}
if (c == 34) {
k = k + 1;
break;
}
k = k + 1;
}
continue;
}
if (ch == 39) {
k = k + 1;
while (k < stringLen(src)) {
const c = stringCharCodeAt(src, k);
if (c == 92) {
k = k + 2;
continue;
}
if (c == 39) {
k = k + 1;
break;
}
k = k + 1;
}
continue;
}
if (ch == 91) {
depth = depth + 1;
k = k + 1;
continue;
}
if (ch == 93) {
depth = depth - 1;
k = k + 1;
continue;
}
k = k + 1;
}
if (depth != 0) {
return false;
}
k = skip_ws(src, k);
return is_assignment_operator(src, k);
}
export function is_assign_stmt_start_impl(src, i) {
let j = skip_ws(src, i);
if (!(j < stringLen(src))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if (!is_ident_start(c0)) {
return false;
}
j = j + 1;
while (j < stringLen(src)) {
const c = stringCharCodeAt(src, j);
if (!is_ident_part(c)) {
break;
}
j = j + 1;
}
j = skip_ws(src, j);
return is_assignment_operator(src, j);
}
export function is_field_assign_stmt_start_impl(src, i) {
let j = skip_ws(src, i);
if (!(j < stringLen(src))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if (!is_ident_start(c0)) {
return false;
}
j = j + 1;
while (j < stringLen(src)) {
const c = stringCharCodeAt(src, j);
if (!is_ident_part(c)) {
break;
}
j = j + 1;
}
j = skip_ws(src, j);
if (!(j < stringLen(src) && stringCharCodeAt(src, j) == 46)) {
return false;
}
while (j < stringLen(src) && stringCharCodeAt(src, j) == 46) {
j = j + 1;
j = skip_ws(src, j);
if (!(j < stringLen(src))) {
return false;
}
const c1 = stringCharCodeAt(src, j);
if (!is_ident_start(c1)) {
return false;
}
j = j + 1;
while (j < stringLen(src)) {
const c = stringCharCodeAt(src, j);
if (!is_ident_part(c)) {
break;
}
j = j + 1;
}
j = skip_ws(src, j);
}
return is_assignment_operator(src, j);
}
export function is_deref_assign_stmt_start_impl(src, i) {
const j = skip_ws(src, i);
if (!(j < stringLen(src))) {
return false;
}
if (!(stringCharCodeAt(src, j) == 42)) {
return false;
}
let k = j + 1;
let depth = 0;
while (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 34) {
k = k + 1;
while (k < stringLen(src)) {
const c = stringCharCodeAt(src, k);
if (c == 92) {
k = k + 2;
continue;
}
if (c == 34) {
k = k + 1;
break;
}
k = k + 1;
}
continue;
}
if (ch == 39) {
k = k + 1;
while (k < stringLen(src)) {
const c = stringCharCodeAt(src, k);
if (c == 92) {
k = k + 2;
continue;
}
if (c == 39) {
k = k + 1;
break;
}
k = k + 1;
}
continue;
}
if (ch == 40 || ch == 91 || ch == 123) {
depth = depth + 1;
k = k + 1;
continue;
}
if (ch == 41 || ch == 93 || ch == 125) {
depth = depth - 1;
k = k + 1;
continue;
}
if (depth == 0 && ch == 61) {
if (k + 1 < stringLen(src)) {
const next = stringCharCodeAt(src, k + 1);
if (next == 61 || next == 62) {
return false;
}
}
return true;
}
if (ch == 59) {
return false;
}
k = k + 1;
}
return false;
}
