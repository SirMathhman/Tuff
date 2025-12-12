// compiled by selfhost tuffc
import { println, panic, stringLen, stringSlice, stringCharCodeAt } from "./rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "./rt/vec.mjs";
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
export function panic_at(src, i, msg) {
const lc = line_col_at(src, i);
let pos = i;
if ((pos > stringLen(src))) {
pos = stringLen(src);
}
let ls = pos;
while ((ls > 0)) {
if ((stringCharCodeAt(src, (ls - 1)) == 10)) {
break;
}
ls = (ls - 1);
}
let le = pos;
while ((le < stringLen(src))) {
if ((stringCharCodeAt(src, le) == 10)) {
break;
}
le = (le + 1);
}
const lineText = stringSlice(src, ls, le);
const header = ((((((__tuffc_current_file + ":") + (("" + lc.line))) + ":") + (("" + lc.col))) + " error: ") + msg);
const frame1 = ("  | " + lineText);
const frame2 = (("  | " + spaces((lc.col - 1))) + "^");
panic(((((header + "\n") + frame1) + "\n") + frame2));
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
