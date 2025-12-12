// compiled by selfhost tuffc
import { stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "./rt/stdlib.mjs";
import { panic_at } from "./../util/diagnostics.mjs";
import { is_digit, is_space, is_ident_start, is_ident_part, skip_ws, starts_with_at } from "./../util/lexing.mjs";
export function ParsedNumber(value, nextPos) {
return { value: value, nextPos: nextPos };
}
export function ParsedIdent(text, startPos, nextPos) {
return { text: text, startPos: startPos, nextPos: nextPos };
}
export function ParsedBool(ok, nextPos) {
return { ok: ok, nextPos: nextPos };
}
export function parse_keyword(src, i, lit) {
const j = skip_ws(src, i);
if ((!starts_with_at(src, j, lit))) {
let end = (j + 16);
if ((end > stringLen(src))) {
end = stringLen(src);
}
panic_at(src, j, (((("expected keyword: " + lit) + " but got '") + stringSlice(src, j, end)) + "'"));
}
return (j + stringLen(lit));
}
export function parse_number(src, i) {
let j = skip_ws(src, i);
let acc = 0;
let saw = false;
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_digit(c))) {
break;
}
saw = true;
acc = ((acc * 10) + (c - 48));
j = (j + 1);
}
if ((!saw)) {
panic_at(src, j, "expected number");
}
return ParsedNumber(acc, j);
}
export function parse_ident(src, i) {
let j = skip_ws(src, i);
if ((!(j < stringLen(src)))) {
panic_at(src, j, "expected identifier");
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
panic_at(src, j, "expected identifier");
}
const start = j;
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
return ParsedIdent(stringSlice(src, start, j), start, j);
}
export function parse_module_path(src, i) {
let j = skip_ws(src, i);
const start = j;
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((is_space(c) || (c == 59))) {
break;
}
j = (j + 1);
}
if ((start == j)) {
panic_at(src, j, "expected module path");
}
return ParsedIdent(stringSlice(src, start, j), start, j);
}
export function module_path_to_relpath(p) {
let out = "";
let i = 0;
while ((i < stringLen(p))) {
if (((((i + 1) < stringLen(p)) && (stringCharCodeAt(p, i) == 58)) && (stringCharCodeAt(p, (i + 1)) == 58))) {
out = (out + "/");
i = (i + 2);
continue;
}
out = (out + stringFromCharCode(stringCharCodeAt(p, i)));
i = (i + 1);
}
return out;
}
export function parse_optional_semicolon(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 59))) {
return (j + 1);
}
return i;
}
export function parse_required_semicolon(src, i) {
const j = skip_ws(src, i);
if ((!((j < stringLen(src)) && (stringCharCodeAt(src, j) == 59)))) {
panic_at(src, j, "expected ';'");
}
return (j + 1);
}
