// compiled by selfhost tuffc
import { println, readTextFile, stringLen, stringCharCodeAt, stringSlice, pathDirname, pathJoin, fileExists } from "./rt/stdlib.mjs";
import { vec_len, vec_get } from "./rt/vec.mjs";
import { compile_project, lint_project } from "./tuffc_lib.mjs";
import { set_lint_options } from "./analyzer.mjs";
import { set_diagnostics_format } from "./util/diagnostics.mjs";
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
export function starts_with_at(s, i, prefix) {
if (i < 0) {
return false;
}
if (i + stringLen(prefix) > stringLen(s)) {
return false;
}
let j = 0;
while (j < stringLen(prefix)) {
if (stringCharCodeAt(s, i + j) != stringCharCodeAt(prefix, j)) {
return false;
}
j = j + 1;
}
return true;
}
export function starts_with_ci(s, prefix) {
if (stringLen(prefix) > stringLen(s)) {
return false;
}
let i = 0;
while (i < stringLen(prefix)) {
if (ascii_lower(stringCharCodeAt(s, i)) != ascii_lower(stringCharCodeAt(prefix, i))) {
return false;
}
i = i + 1;
}
return true;
}
export function parse_bool_ci(s0, defaultValue) {
const s = trim_ascii_ws(s0);
if (starts_with_ci(s, "true")) {
return true;
}
if (starts_with_ci(s, "false")) {
return false;
}
if (s == "1") {
return true;
}
if (s == "0") {
return false;
}
return defaultValue;
}
export function find_char(s, ch) {
let i = 0;
while (i < stringLen(s)) {
if (stringCharCodeAt(s, i) == ch) {
return i;
}
i = i + 1;
}
return -1;
}
export function LintOptions(warnUnusedLocals, warnUnusedParams) {
return { warnUnusedLocals: warnUnusedLocals, warnUnusedParams: warnUnusedParams };
}
export function find_config_upwards(inPath) {
let dir = pathDirname(inPath);
while (true) {
const cand = pathJoin(dir, "tuffc.conf");
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
export function parse_lint_config(src, warnUnusedLocals0, warnUnusedParams0) {
let warnUnusedLocals = warnUnusedLocals0;
let warnUnusedParams = warnUnusedParams0;
let i = 0;
while (i <= stringLen(src)) {
let j = i;
while (j < stringLen(src) && stringCharCodeAt(src, j) != 10) {
j = j + 1;
}
let line = stringSlice(src, i, j);
if (stringLen(line) > 0 && stringCharCodeAt(line, stringLen(line) - 1) == 13) {
line = stringSlice(line, 0, stringLen(line) - 1);
}
const t = trim_ascii_ws(line);
if (!(t == "")) {
if (!(stringLen(t) > 0 && stringCharCodeAt(t, 0) == 35) && !starts_with_at(t, 0, "//")) {
const eq = find_char(t, 61);
if (eq != -1) {
const key = trim_ascii_ws(stringSlice(t, 0, eq));
const val = trim_ascii_ws(stringSlice(t, eq + 1, stringLen(t)));
if (key == "warn_unused_locals") {
warnUnusedLocals = parse_bool_ci(val, warnUnusedLocals);
}
if (key == "warn_unused_params") {
warnUnusedParams = parse_bool_ci(val, warnUnusedParams);
}
}
}
}
i = j + 1;
}
return LintOptions(warnUnusedLocals, warnUnusedParams);
}
export function print_usage() {
println("usage: tuffc [options] <in.tuff> <out.mjs>");
println("       tuffc lint [options] <in.tuff>");
println("       tuffc [options] --lint-only <in.tuff>   (alias for lint)");
println("options:");
println("  --config <path>                Read config file (key = value)");
println("  --format <human|json>          Diagnostics output format");
println("  --lint-only                    Lint only (parse+analyze), do not emit JS");
println("  --warn-all                     Enable all warnings");
println("  --no-warn                      Disable all warnings");
println("  --warn-unused-locals            Enable unused local warnings");
println("  --warn-unused-params            Enable unused parameter warnings");
println("  --no-warn-unused-locals         Disable unused local warnings");
println("  --no-warn-unused-params         Disable unused parameter warnings");
return undefined;
}
export function main(argv) {
let warnUnusedLocals = false;
let warnUnusedParams = false;
let warnMode = "";
let lintOnly = false;
let configPath = "";
let format = "human";
let command = "";
let inPath = "";
let outPath = "";
let i = 0;
while (i < vec_len(argv)) {
const a = vec_get(argv, i);
if (a == "--warn-all") {
warnMode = "all";
i = i + 1;
continue;
}
if (a == "--no-warn") {
warnMode = "none";
i = i + 1;
continue;
}
if (a == "--no-warn-unused-locals") {
warnUnusedLocals = false;
i = i + 1;
continue;
}
if (a == "--no-warn-unused-params") {
warnUnusedParams = false;
i = i + 1;
continue;
}
if (a == "--warn-unused-locals") {
warnUnusedLocals = true;
i = i + 1;
continue;
}
if (a == "--warn-unused-params") {
warnUnusedParams = true;
i = i + 1;
continue;
}
if (a == "--lint-only") {
lintOnly = true;
i = i + 1;
continue;
}
if (a == "--format") {
if (i + 1 >= vec_len(argv)) {
print_usage();
return 1;
}
format = vec_get(argv, i + 1);
i = i + 2;
continue;
}
if (a == "--config") {
if (i + 1 >= vec_len(argv)) {
print_usage();
return 1;
}
configPath = vec_get(argv, i + 1);
i = i + 2;
continue;
}
if (stringLen(a) > 0 && stringCharCodeAt(a, 0) == 45) {
println("unknown option: " + a);
print_usage();
return 1;
}
if (command == "" && inPath == "" && (a == "lint" || a == "compile")) {
command = a;
i = i + 1;
continue;
}
if (inPath == "") {
inPath = a;
i = i + 1;
continue;
}
if (outPath == "") {
outPath = a;
i = i + 1;
continue;
}
println("too many arguments");
print_usage();
return 1;
}
if (command == "lint") {
lintOnly = true;
}
(lintOnly ? (() => {
if (inPath == "" || outPath != "") {
print_usage();
return 1;
}
return undefined;
})() : (() => {
if (inPath == "" || outPath == "") {
print_usage();
return 1;
}
return undefined;
})());
if (configPath == "") {
configPath = find_config_upwards(inPath);
}
if (configPath != "") {
const cfgText = readTextFile(configPath);
const cfg = parse_lint_config(cfgText, warnUnusedLocals, warnUnusedParams);
warnUnusedLocals = cfg.warnUnusedLocals;
warnUnusedParams = cfg.warnUnusedParams;
}
if (warnMode == "none") {
warnUnusedLocals = false;
warnUnusedParams = false;
}
if (warnMode == "all") {
warnUnusedLocals = true;
warnUnusedParams = true;
}
set_diagnostics_format(format);
set_lint_options(warnUnusedLocals, warnUnusedParams);
(lintOnly ? (() => {
lint_project(inPath);
return undefined;
})() : (() => {
compile_project(inPath, outPath);
return undefined;
})());
return 0;
}
