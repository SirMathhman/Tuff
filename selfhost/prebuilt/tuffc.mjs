// compiled by selfhost tuffc
import { println } from "./rt/stdlib.mjs";
import { vec_len, vec_get } from "./rt/vec.mjs";
import { compile_project } from "./tuffc_lib.mjs";
export function main(argv) {
if (vec_len(argv) < 2) {
println("usage: tuffc <in.tuff> <out.mjs>");
return 1;
}
const inPath = vec_get(argv, 0);
const outPath = vec_get(argv, 1);
compile_project(inPath, outPath);
return 0;
}
