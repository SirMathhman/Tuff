// compiled by selfhost tuffc
import { println, stringLen, stringCharCodeAt } from "./rt/stdlib.mjs";
import { vec_len, vec_get } from "./rt/vec.mjs";
import { fluff_project } from "./tuffc_lib.mjs";
import { set_fluff_options, set_fluff_complexity_options } from "./analyzer.mjs";
import { load_fluff_config } from "./build_config.mjs";
import { set_diagnostics_format } from "./util/diagnostics.mjs";
export function print_usage() {
println("usage: fluff [options] <in.tuff>");
println("options:");
println("  --format <human|json>          Diagnostics output format");
println("config:");
println("  build.json (auto-discovered upward from <in.tuff>)");
return undefined;
}
export function main(argv) {
let format = "human";
let inPath = "";
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
const cfg = load_fluff_config(inPath);
set_fluff_options(cfg.unusedLocals, cfg.unusedParams);
set_fluff_complexity_options(cfg.complexity, cfg.complexityThreshold);
fluff_project(inPath);
return 0;
}
