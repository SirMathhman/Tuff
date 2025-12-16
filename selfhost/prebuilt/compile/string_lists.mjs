// compiled by selfhost tuffc
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
export function str_list_contains(xs, s) {
let i = 0;
while (i < vec_len(xs)) {
if (vec_get(xs, i) == s) {
return true;
}
i = i + 1;
}
return false;
}
export function str_list_remove(xs, s) {
const out = vec_new();
let i = 0;
while (i < vec_len(xs)) {
if (vec_get(xs, i) != s) {
vec_push(out, vec_get(xs, i));
}
i = i + 1;
}
return out;
}
