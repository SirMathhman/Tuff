// compiled by selfhost tuffc
import { println, stringLen, stringCharCodeAt, readTextFile, writeTextFile } from "./rt/stdlib.mjs";
import { vec_len, vec_get, vec_push, vec_new } from "./rt/vec.mjs";
import { compile_project_to_outputs } from "./tuffc_lib.mjs";
import { set_fluff_options } from "./analyzer.mjs";
import { load_fluff_config } from "./build_config.mjs";
import { set_diagnostics_format } from "./util/diagnostics.mjs";
export function print_usage() {
println("usage: tuffc [options] <in.tuff> <out.mjs>");
println("options:");
println("  --format <human|json>          Diagnostics output format");
println("config:");
println("  build.json (auto-discovered upward from <in.tuff>) controls Fluff rules");
return undefined;
}
export function run(argv) {
let format = "human";
let inPath = "";
let outPath = "";
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
if (outPath == "") {
outPath = a;
i = i + 1;
continue;
}
println("too many arguments");
print_usage();
return 1;
}
if (inPath == "" || outPath == "") {
print_usage();
return 1;
}
set_diagnostics_format(format);
const cfg = load_fluff_config(inPath);
set_fluff_options(cfg.unusedLocals, cfg.unusedParams);
const r = compile_project_to_outputs(inPath, outPath, readTextFile);
const outFiles = r[0];
const jsOutputs = r[1];
let oi = 0;
while (oi < vec_len(outFiles)) {
writeTextFile(vec_get(outFiles, oi), vec_get(jsOutputs, oi));
oi = oi + 1;
}
return 0;
}
