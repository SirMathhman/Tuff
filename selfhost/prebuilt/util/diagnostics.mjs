// compiled by selfhost tuffc
import { println, panic, stringLen, stringSlice, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
let __tuffc_current_file = "<input>";
let __tuffc_diag_format = "human";
let __tuffc_errors = vec_new();
let __tuffc_warnings = vec_new();
let __tuffc_error_infos = vec_new();
let __tuffc_warning_infos = vec_new();
let __tuffc_struct_defs = vec_new();
export function LineCol(line, col) {
return { line: line, col: col };
}
export function StructDef(name, fields) {
return { name: name, fields: fields };
}
export function DiagInfo(line, col, start, end, msg, help) {
return { line: line, col: col, start: start, end: end, msg: msg, help: help };
}
export function set_current_file(path) {
__tuffc_current_file = path;
return undefined;
}
export function set_diagnostics_format(format) {
return (format == "human" || format == "json" ? (() => {
__tuffc_diag_format = format;
return undefined;
})() : (() => {
panic("unknown diagnostics format: " + format);
return undefined;
})());
}
export function reset_errors() {
__tuffc_errors = vec_new();
__tuffc_error_infos = vec_new();
return undefined;
}
export function reset_warnings() {
__tuffc_warnings = vec_new();
__tuffc_warning_infos = vec_new();
return undefined;
}
export function errors_len() {
return vec_len(__tuffc_errors);
}
export function errors_join() {
let out = "";
let i = 0;
while (i < vec_len(__tuffc_errors)) {
if (i > 0) {
out = out + "\n\n";
}
out = out + vec_get(__tuffc_errors, i);
i = i + 1;
}
return out;
}
export function warnings_join() {
let out = "";
let i = 0;
while (i < vec_len(__tuffc_warnings)) {
if (i > 0) {
out = out + "\n\n";
}
out = out + vec_get(__tuffc_warnings, i);
i = i + 1;
}
return out;
}
export function json_escape(s) {
let out = "";
let i = 0;
while (i < stringLen(s)) {
const ch = stringCharCodeAt(s, i);
if (ch == 34) {
out = out + "\\\"";
} else {
if (ch == 92) {
out = out + "\\\\";
} else {
if (ch == 10) {
out = out + "\\n";
} else {
if (ch == 13) {
out = out + "\\r";
} else {
if (ch == 9) {
out = out + "\\t";
} else {
out = out + stringSlice(s, i, i + 1);
}
}
}
}
}
i = i + 1;
}
return out;
}
export function diag_json(level, text) {
return "{\"level\":\"" + level + "\",\"text\":\"" + json_escape(text) + "\"}";
}
export function panic_if_errors() {
if (vec_len(__tuffc_errors) > 0) {
if (__tuffc_diag_format == "json") {
panic(diag_json("error", errors_join()));
}
panic(errors_join());
}
return undefined;
}
export function emit_warnings() {
let i = 0;
while (i < vec_len(__tuffc_warnings)) {
const w = vec_get(__tuffc_warnings, i);
if (__tuffc_diag_format == "json") {
println(diag_json("warning", w));
} else {
println(w);
}
i = i + 1;
}
return undefined;
}
export function ascii_lower(ch) {
if (ch >= 65 && ch <= 90) {
return ch + 32;
}
return ch;
}
export function replace_error_label_with_warning(s) {
const needle = " error: ";
let i = 0;
while (i + stringLen(needle) <= stringLen(s)) {
let ok = true;
let j = 0;
while (j < stringLen(needle)) {
if (stringCharCodeAt(s, i + j) != stringCharCodeAt(needle, j)) {
ok = false;
break;
}
j = j + 1;
}
if (ok) {
const before = stringSlice(s, 0, i);
const after = stringSlice(s, i + stringLen(needle), stringLen(s));
return before + " warning: " + after;
}
i = i + 1;
}
return s;
}
export function spaces(n) {
let s = "";
let i = 0;
while (i < n) {
s = s + " ";
i = i + 1;
}
return s;
}
export function carets(n) {
let s = "";
let i = 0;
let k = n;
if (k < 1) {
k = 1;
}
while (i < k) {
s = s + "^";
i = i + 1;
}
return s;
}
export function line_col_at(src, i) {
let line = 1;
let col = 1;
let p = 0;
let limit = i;
if (limit > stringLen(src)) {
limit = stringLen(src);
}
while (p < limit) {
const ch = stringCharCodeAt(src, p);
if (ch == 10) {
line = line + 1;
col = 1;
} else {
col = col + 1;
}
p = p + 1;
}
return LineCol(line, col);
}
export function format_span_help(src, start, end, msg, help) {
let s = start;
let e = end;
if (s < 0) {
s = 0;
}
if (e < 0) {
e = 0;
}
if (s > stringLen(src)) {
s = stringLen(src);
}
if (e > stringLen(src)) {
e = stringLen(src);
}
if (e < s) {
e = s;
}
const lc = line_col_at(src, s);
let ls = s;
while (ls > 0) {
if (stringCharCodeAt(src, ls - 1) == 10) {
break;
}
ls = ls - 1;
}
let le = s;
while (le < stringLen(src)) {
if (stringCharCodeAt(src, le) == 10) {
break;
}
le = le + 1;
}
let pls = -1;
let ple = -1;
if (ls > 0) {
ple = ls - 1;
pls = ple;
while (pls > 0) {
if (stringCharCodeAt(src, pls - 1) == 10) {
break;
}
pls = pls - 1;
}
}
let nls = -1;
let nle = -1;
if (le < stringLen(src) && stringCharCodeAt(src, le) == 10) {
nls = le + 1;
nle = nls;
while (nle < stringLen(src)) {
if (stringCharCodeAt(src, nle) == 10) {
break;
}
nle = nle + 1;
}
}
let width = stringLen("" + lc.line);
if (pls != -1) {
const w = stringLen("" + (lc.line - 1));
if (w > width) {
width = w;
}
}
if (nls != -1) {
const w = stringLen("" + (lc.line + 1));
if (w > width) {
width = w;
}
}
let ue = e;
if (ue > le) {
ue = le;
}
let ulen = ue - s;
if (ulen < 1) {
ulen = 1;
}
const lineStr = "" + lc.line;
const header = __tuffc_current_file + ":" + lineStr + ":" + ("" + lc.col) + " (offset " + ("" + s) + ") error: " + msg;
let out = header;
if (pls != -1) {
const prevText = stringSlice(src, pls, ple);
const prevStr = "" + (lc.line - 1);
out = out + "\n" + spaces(width - stringLen(prevStr)) + prevStr + " | " + prevText;
}
const lineText = stringSlice(src, ls, le);
out = out + "\n" + spaces(width - stringLen(lineStr)) + lineStr + " | " + lineText;
out = out + "\n" + spaces(width) + " | " + spaces(lc.col - 1) + carets(ulen);
if (nls != -1) {
const nextText = stringSlice(src, nls, nle);
const nextStr = "" + (lc.line + 1);
out = out + "\n" + spaces(width - stringLen(nextStr)) + nextStr + " | " + nextText;
}
if (help != "") {
out = out + "\n" + "help: " + help;
}
return out;
}
export function panic_span_help(src, start, end, msg, help) {
return panic(format_span_help(src, start, end, msg, help));
}
export function error_span_help(src, start, end, msg, help) {
if (vec_len(__tuffc_errors) >= 50) {
return;
}
vec_push(__tuffc_errors, format_span_help(src, start, end, msg, help));
const lc = line_col_at(src, start);
vec_push(__tuffc_error_infos, DiagInfo(lc.line, lc.col, start, end, msg, help));
return undefined;
}
export function warn_span_help(src, start, end, msg, help) {
if (vec_len(__tuffc_warnings) >= 200) {
return;
}
const s = format_span_help(src, start, end, msg, help);
vec_push(__tuffc_warnings, replace_error_label_with_warning(s));
const lc = line_col_at(src, start);
vec_push(__tuffc_warning_infos, DiagInfo(lc.line, lc.col, start, end, msg, help));
return undefined;
}
export function panic_at_help(src, i, msg, help) {
return panic_span_help(src, i, i, msg, help);
}
export function error_at_help(src, i, msg, help) {
error_span_help(src, i, i, msg, help);
return undefined;
}
export function warn_at_help(src, i, msg, help) {
warn_span_help(src, i, i, msg, help);
return undefined;
}
export function panic_at(src, i, msg) {
return panic_at_help(src, i, msg, "");
}
export function error_at(src, i, msg) {
error_at_help(src, i, msg, "");
return undefined;
}
export function warn_at(src, i, msg) {
warn_at_help(src, i, msg, "");
return undefined;
}
export function reset_struct_defs() {
__tuffc_struct_defs = vec_new();
return undefined;
}
export function add_struct_def(name, fields) {
let si = 0;
while (si < vec_len(__tuffc_struct_defs)) {
const d = vec_get(__tuffc_struct_defs, si);
if (d.name == name) {
panic("duplicate struct: " + name);
}
si = si + 1;
}
vec_push(__tuffc_struct_defs, StructDef(name, fields));
return undefined;
}
export function find_struct_fields(name) {
let si = 0;
while (si < vec_len(__tuffc_struct_defs)) {
const d = vec_get(__tuffc_struct_defs, si);
if (d.name == name) {
return d.fields;
}
si = si + 1;
}
return panic("unknown struct: " + name);
}
export function is_identifier_too_short(text) {
return false;
}
export function warn_short_identifier(src, startPos, name) {
return undefined;
}
export function get_error_infos() {
return __tuffc_error_infos;
}
export function get_warning_infos() {
return __tuffc_warning_infos;
}
export function get_current_file() {
return __tuffc_current_file;
}
