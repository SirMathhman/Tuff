// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "../rt/stdlib.mjs";
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
