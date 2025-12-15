// compiled by selfhost tuffc
import { readTextFile, fileExists, pathDirname, pathJoin, stringLen, stringCharCodeAt, stringSlice } from "./rt/stdlib.mjs";
export function is_ascii_ws(ch) {
return ch == 32 || ch == 9 || ch == 10 || ch == 13;
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
export function json_skip_ws(src, i0) {
let i = i0;
while (i < stringLen(src) && is_ascii_ws(stringCharCodeAt(src, i))) {
i = i + 1;
}
return i;
}
export function json_parse_string(src, quotePos) {
if (!(quotePos < stringLen(src) && stringCharCodeAt(src, quotePos) == 34)) {
return ["", quotePos];
}
let i = quotePos + 1;
while (i < stringLen(src)) {
const ch = stringCharCodeAt(src, i);
if (ch == 34) {
const inner = stringSlice(src, quotePos + 1, i);
return [inner, i + 1];
}
if (ch == 92) {
i = i + 2;
continue;
}
i = i + 1;
}
return ["", quotePos];
}
export function json_find_matching_brace(src, openPos) {
if (!(openPos < stringLen(src) && stringCharCodeAt(src, openPos) == 123)) {
return -1;
}
let depth = 1;
let i = openPos + 1;
while (i < stringLen(src)) {
const ch = stringCharCodeAt(src, i);
if (ch == 34) {
const s = json_parse_string(src, i);
if (s[1] == i) {
return -1;
}
i = s[1];
continue;
}
if (ch == 123) {
depth = depth + 1;
i = i + 1;
continue;
}
if (ch == 125) {
depth = depth - 1;
if (depth == 0) {
return i;
}
i = i + 1;
continue;
}
i = i + 1;
}
return -1;
}
export function json_find_object_bounds_by_key(src, key) {
let i = 0;
while (i < stringLen(src)) {
i = json_skip_ws(src, i);
if (i >= stringLen(src)) {
break;
}
const ch = stringCharCodeAt(src, i);
if (ch == 34) {
const k = json_parse_string(src, i);
if (k[1] == i) {
return [-1, -1];
}
const keyText = k[0];
i = json_skip_ws(src, k[1]);
if (i < stringLen(src) && stringCharCodeAt(src, i) == 58) {
i = json_skip_ws(src, i + 1);
if (keyText == key) {
if (i < stringLen(src) && stringCharCodeAt(src, i) == 123) {
const close = json_find_matching_brace(src, i);
if (close == -1) {
return [-1, -1];
}
return [i, close];
}
}
}
continue;
}
i = i + 1;
}
return [-1, -1];
}
export function json_find_string_value_in_object(src, objOpen, objClose, key) {
let i = objOpen + 1;
while (i < objClose) {
i = json_skip_ws(src, i);
if (i >= objClose) {
break;
}
const ch = stringCharCodeAt(src, i);
if (ch == 44) {
i = i + 1;
continue;
}
if (ch == 34) {
const k = json_parse_string(src, i);
if (k[1] == i) {
return "";
}
const keyText = k[0];
i = json_skip_ws(src, k[1]);
if (!(i < objClose && stringCharCodeAt(src, i) == 58)) {
continue;
}
i = json_skip_ws(src, i + 1);
if (keyText == key) {
if (i < objClose && stringCharCodeAt(src, i) == 34) {
const v = json_parse_string(src, i);
if (v[1] == i) {
return "";
}
return v[0];
}
return "";
}
if (i < objClose && stringCharCodeAt(src, i) == 34) {
const v2 = json_parse_string(src, i);
if (v2[1] == i) {
return "";
}
i = v2[1];
}
continue;
}
i = i + 1;
}
return "";
}
export function severity_from_string(s0, defaultValue) {
const s = trim_ascii_ws(s0);
if (s == "") {
return defaultValue;
}
const eq_ci = ((a, b) => {
if (stringLen(a) != stringLen(b)) {
return false;
}
let i = 0;
while (i < stringLen(a)) {
if (ascii_lower(stringCharCodeAt(a, i)) != ascii_lower(stringCharCodeAt(b, i))) {
return false;
}
i = i + 1;
}
return true;
});
if (eq_ci(s, "off")) {
return 0;
}
if (eq_ci(s, "warning")) {
return 1;
}
if (eq_ci(s, "error")) {
return 2;
}
return defaultValue;
}
export function json_find_int_value_in_object(src, objOpen, objClose, key, defaultValue) {
let i = objOpen + 1;
while (i < objClose) {
i = json_skip_ws(src, i);
if (i >= objClose) {
break;
}
const ch = stringCharCodeAt(src, i);
if (ch == 44) {
i = i + 1;
continue;
}
if (ch == 34) {
const k = json_parse_string(src, i);
if (k[1] == i) {
return defaultValue;
}
const keyText = k[0];
i = json_skip_ws(src, k[1]);
if (!(i < objClose && stringCharCodeAt(src, i) == 58)) {
continue;
}
i = json_skip_ws(src, i + 1);
if (keyText == key) {
let result = 0;
let foundDigit = false;
while (i < objClose) {
const digit = stringCharCodeAt(src, i);
if (digit >= 48 && digit <= 57) {
result = result * 10 + (digit - 48);
foundDigit = true;
i = i + 1;
} else {
break;
}
}
if (foundDigit) {
return result;
}
return defaultValue;
}
if (i < objClose && stringCharCodeAt(src, i) == 34) {
const v2 = json_parse_string(src, i);
if (v2[1] == i) {
return defaultValue;
}
i = v2[1];
}
continue;
}
i = i + 1;
}
return defaultValue;
}
export function FluffConfig(unusedLocals, unusedParams, complexity, complexityThreshold) {
return { unusedLocals: unusedLocals, unusedParams: unusedParams, complexity: complexity, complexityThreshold: complexityThreshold };
}
export function find_build_json_upwards(inPath) {
let dir = pathDirname(inPath);
while (true) {
const cand = pathJoin(dir, "build.json");
if (fileExists(cand)) {
return cand;
}
const parent = pathDirname(dir);
if (parent == dir) {
break;
}
dir = parent;
}
return "";
}
export function load_fluff_config(inPath) {
const path = find_build_json_upwards(inPath);
if (path == "") {
return FluffConfig(0, 0, 0, 15);
}
const src = readTextFile(path);
const fluffObj = json_find_object_bounds_by_key(src, "fluff");
if (fluffObj[0] == -1) {
return FluffConfig(0, 0, 0, 15);
}
const unusedLocals0 = json_find_string_value_in_object(src, fluffObj[0], fluffObj[1], "unusedLocals");
const unusedParams0 = json_find_string_value_in_object(src, fluffObj[0], fluffObj[1], "unusedParams");
const complexity0 = json_find_string_value_in_object(src, fluffObj[0], fluffObj[1], "complexity");
const unusedLocals = severity_from_string(unusedLocals0, 0);
const unusedParams = severity_from_string(unusedParams0, 0);
const complexity = severity_from_string(complexity0, 0);
const complexityThreshold = json_find_int_value_in_object(src, fluffObj[0], fluffObj[1], "complexityThreshold", 15);
return FluffConfig(unusedLocals, unusedParams, complexity, complexityThreshold);
}
