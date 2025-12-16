// compiled by selfhost tuffc
import { pathDirname, stringLen, stringSlice } from "../rt/stdlib.mjs";
import { starts_with_at } from "../util/lexing.mjs";
export function find_substring(hay, needle) {
let i = 0;
while (i + stringLen(needle) <= stringLen(hay)) {
if (starts_with_at(hay, i, needle)) {
return i;
}
i = i + 1;
}
return -1;
}
export function workspace_root_from_path(p) {
let i = find_substring(p, "\\src\\");
if (i != -1) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "/src/");
if (i != -1) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "\\std\\");
if (i != -1) {
return stringSlice(p, 0, i);
}
i = find_substring(p, "/std/");
if (i != -1) {
return stringSlice(p, 0, i);
}
return pathDirname(p);
}
export function compiler_root_from_path(p) {
const needle1 = "\\src\\main\\tuff\\compiler\\";
let i = find_substring(p, needle1);
if (i != -1) {
return stringSlice(p, 0, i + stringLen(needle1));
}
const needle2 = "/src/main/tuff/compiler/";
i = find_substring(p, needle2);
if (i != -1) {
return stringSlice(p, 0, i + stringLen(needle2));
}
return "";
}
