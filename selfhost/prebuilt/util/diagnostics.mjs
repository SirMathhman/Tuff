// compiled by selfhost tuffc
import { println, panic, stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
let __tuffc_current_file = "<input>";
let __tuffc_struct_defs = vec_new();
export function LineCol(line, col) {
return { line: line, col: col };
}
export function StructDef(name, fields) {
return { name: name, fields: fields };
}
export function set_current_file(path) {
__tuffc_current_file = path;
return undefined;
}
export function spaces(n) {
let s = "";
let i = 0;
while ((i < n)) {
s = (s + " ");
i = (i + 1);
}
return s;
}
export function carets(n) {
let s = "";
let i = 0;
let k = n;
if ((k < 1)) {
k = 1;
}
while ((i < k)) {
s = (s + "^");
i = (i + 1);
}
return s;
}
export function line_col_at(src, i) {
let line = 1;
let col = 1;
let p = 0;
let limit = i;
if ((limit > stringLen(src))) {
limit = stringLen(src);
}
while ((p < limit)) {
const ch = stringCharCodeAt(src, p);
if ((ch == 10)) {
line = (line + 1);
col = 1;
} else {
col = (col + 1);
}
p = (p + 1);
}
return LineCol(line, col);
}
export function panic_span_help(src, start, end, msg, help) {
let s = start;
let e = end;
if ((s < 0)) {
s = 0;
}
if ((e < 0)) {
e = 0;
}
if ((s > stringLen(src))) {
s = stringLen(src);
}
if ((e > stringLen(src))) {
e = stringLen(src);
}
if ((e < s)) {
e = s;
}
const lc = line_col_at(src, s);
let ls = s;
while ((ls > 0)) {
if ((stringCharCodeAt(src, (ls - 1)) == 10)) {
break;
}
ls = (ls - 1);
}
let le = s;
while ((le < stringLen(src))) {
if ((stringCharCodeAt(src, le) == 10)) {
break;
}
le = (le + 1);
}
let pls = (-1);
let ple = (-1);
if ((ls > 0)) {
ple = (ls - 1);
pls = ple;
while ((pls > 0)) {
if ((stringCharCodeAt(src, (pls - 1)) == 10)) {
break;
}
pls = (pls - 1);
}
}
let nls = (-1);
let nle = (-1);
if (((le < stringLen(src)) && (stringCharCodeAt(src, le) == 10))) {
nls = (le + 1);
nle = nls;
while ((nle < stringLen(src))) {
if ((stringCharCodeAt(src, nle) == 10)) {
break;
}
nle = (nle + 1);
}
}
let width = stringLen(("" + lc.line));
if ((pls != (-1))) {
const w = stringLen(("" + (lc.line - 1)));
if ((w > width)) {
width = w;
}
}
if ((nls != (-1))) {
const w = stringLen(("" + (lc.line + 1)));
if ((w > width)) {
width = w;
}
}
let ue = e;
if ((ue > le)) {
ue = le;
}
let ulen = (ue - s);
if ((ulen < 1)) {
ulen = 1;
}
const lineStr = ("" + lc.line);
const header = ((((((((__tuffc_current_file + ":") + lineStr) + ":") + ("" + lc.col)) + " (offset ") + ("" + s)) + ") error: ") + msg);
let out = header;
if ((pls != (-1))) {
const prevText = stringSlice(src, pls, ple);
const prevStr = ("" + (lc.line - 1));
out = (((((out + "\n") + spaces((width - stringLen(prevStr)))) + prevStr) + " | ") + prevText);
}
const lineText = stringSlice(src, ls, le);
out = (((((out + "\n") + spaces((width - stringLen(lineStr)))) + lineStr) + " | ") + lineText);
out = (((((out + "\n") + spaces(width)) + " | ") + spaces((lc.col - 1))) + carets(ulen));
if ((nls != (-1))) {
const nextText = stringSlice(src, nls, nle);
const nextStr = ("" + (lc.line + 1));
out = (((((out + "\n") + spaces((width - stringLen(nextStr)))) + nextStr) + " | ") + nextText);
}
if ((help != "")) {
out = (((out + "\n") + "help: ") + help);
}
panic(out);
return undefined;
}
export function panic_at_help(src, i, msg, help) {
panic_span_help(src, i, i, msg, help);
return undefined;
}
export function panic_at(src, i, msg) {
panic_at_help(src, i, msg, "");
return undefined;
}
export function reset_struct_defs() {
__tuffc_struct_defs = vec_new();
return undefined;
}
export function add_struct_def(name, fields) {
let si = 0;
while ((si < vec_len(__tuffc_struct_defs))) {
const d = vec_get(__tuffc_struct_defs, si);
if ((d.name == name)) {
panic(("duplicate struct: " + name));
}
si = (si + 1);
}
vec_push(__tuffc_struct_defs, StructDef(name, fields));
return undefined;
}
export function find_struct_fields(name) {
let si = 0;
while ((si < vec_len(__tuffc_struct_defs))) {
const d = vec_get(__tuffc_struct_defs, si);
if ((d.name == name)) {
return d.fields;
}
si = (si + 1);
}
return panic(("unknown struct: " + name));
}
export function is_identifier_too_short(text) {
return false;
}
export function warn_short_identifier(src, startPos, name) {
return undefined;
}
