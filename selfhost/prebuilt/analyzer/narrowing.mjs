// compiled by selfhost tuffc
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
export function narrow_lookup(narrowed, name) {
let i = 0;
while (i < vec_len(narrowed)) {
const n = vec_get(narrowed, i);
if (n.name == name) {
return n.variant;
}
i = i + 1;
}
return "";
}
export function narrow_clone(narrowed) {
const out = vec_new();
let i = 0;
while (i < vec_len(narrowed)) {
vec_push(out, vec_get(narrowed, i));
i = i + 1;
}
return out;
}
