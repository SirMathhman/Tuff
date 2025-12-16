// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { ParsedBool } from "./primitives.mjs";
export function parse_mut_opt_impl(src, i) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "mut")) {
if (j + 3 < stringLen(src)) {
const n = stringCharCodeAt(src, j + 3);
if (is_ident_part(n)) {
return ParsedBool(false, i);
}
}
return ParsedBool(true, j + 3);
}
return ParsedBool(false, i);
}
