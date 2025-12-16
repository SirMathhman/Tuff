// compiled by selfhost tuffc
import { println, stringLen, stringCharCodeAt, stringSlice, readTextFile } from "./rt/stdlib.mjs";
import { vec_len, vec_get } from "./rt/vec.mjs";
import { fluff_project_with_reader } from "./tuffc_lib.mjs";
import { set_fluff_options, set_fluff_debug_options, set_fluff_debug_scopes, set_fluff_complexity_options, set_fluff_file_size_options, set_fluff_max_params_options, set_fluff_single_char_identifiers_options, set_fluff_missing_docs_options, set_fluff_clone_detection_options, set_fluff_clone_parameterized_options } from "./analyzer.mjs";
import { load_fluff_config } from "./build_config.mjs";
import { set_diagnostics_format, has_project_errors, reset_project_errors, get_project_error_count, get_project_warning_count } from "./util/diagnostics.mjs";
export function project_error_count() {
return get_project_error_count();
}
export function project_warning_count() {
return get_project_warning_count();
}
export function print_usage() {
println("usage: fluff [options] <in.tuff>");
println("options:");
println("  --format <human|json>          Diagnostics output format");
println("  --debug                       Print all debug output (very noisy)");
println("  --debug=<all|clone>            Print scoped debug output");
println("config:");
println("  build.json (auto-discovered upward from <in.tuff>)");
return undefined;
}
export function starts_with(s, prefix) {
if (stringLen(s) < stringLen(prefix)) {
return false;
}
return stringSlice(s, 0, stringLen(prefix)) == prefix;
}
export function main(argv) {
let format = "human";
let inPath = "";
let debugScopes = "";
let i = 0;
while (i < vec_len(argv)) {
const a = vec_get(argv, i);
if (a == "--format") {
if (i + 1 >= vec_len(argv)) {
print_usage();
return 1;
}
format = vec_get(argv, i + 1);
i = i + 2;
continue;
}
if (a == "--debug") {
debugScopes = "all";
i = i + 1;
continue;
}
if (starts_with(a, "--debug=")) {
debugScopes = stringSlice(a, 8, stringLen(a));
i = i + 1;
continue;
}
if (stringLen(a) > 0 && stringCharCodeAt(a, 0) == 45) {
println("unknown option: " + a);
print_usage();
return 1;
}
if (inPath == "") {
inPath = a;
i = i + 1;
continue;
}
println("too many arguments");
print_usage();
return 1;
}
if (inPath == "") {
print_usage();
return 1;
}
set_diagnostics_format(format);
reset_project_errors();
const cfg = load_fluff_config(inPath);
set_fluff_options(cfg.unusedLocals, cfg.unusedParams);
(debugScopes == "" ? (() => {
set_fluff_debug_options(false);
return undefined;
})() : (() => {
set_fluff_debug_scopes(debugScopes);
return undefined;
})());
set_fluff_complexity_options(cfg.complexity, cfg.complexityThreshold);
set_fluff_file_size_options(cfg.maxFileLines, cfg.maxFileLinesThreshold);
set_fluff_max_params_options(cfg.maxParams, cfg.maxParamsThreshold);
set_fluff_single_char_identifiers_options(cfg.singleCharIdentifiers);
set_fluff_missing_docs_options(cfg.missingDocs);
set_fluff_clone_detection_options(cfg.cloneDetection, cfg.cloneMinTokens, cfg.cloneMinOccurrences);
set_fluff_clone_parameterized_options(cfg.cloneParameterized);
fluff_project_with_reader(inPath, readTextFile);
if (has_project_errors()) {
return 1;
}
return 0;
}
