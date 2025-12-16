// compiled by selfhost tuffc
import { panic, stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { panic_at } from "../util/diagnostics.mjs";
import { skip_ws, is_digit } from "../util/lexing.mjs";
import { ParsedBool, parse_ident, parse_keyword, parse_number } from "./primitives.mjs";
import { ParsedExpr, ParsedParams } from "./expr_stmt_types.mjs";
import { parse_expr } from "./expr_stmt_legacy_expr.mjs";
import { parse_primary } from "./expr_stmt_legacy_primary.mjs";
export function parse_postfix(src, i) {
let left = parse_primary(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (j < stringLen(src) && stringCharCodeAt(src, j) == 60) {
const skipped = try_skip_type_args_for_call(src, j);
if (skipped.ok) {
j = skipped.v1;
continue;
}
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 40) {
const args = parse_arg_list(src, j);
left = ParsedExpr(left.v0 + "(" + args.v0 + ")", args.v1);
j = left.v1;
continue;
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 46) {
const t = skip_ws(src, j + 1);
if (t < stringLen(src) && is_digit(stringCharCodeAt(src, t))) {
const n = parse_number(src, t);
left = ParsedExpr(left.v0 + "[" + ("" + n.value) + "]", n.nextPos);
j = left.v1;
continue;
}
const next = parse_ident(src, j + 1);
left = ParsedExpr(left.v0 + "." + next.text, next.nextPos);
j = left.v1;
continue;
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 91) {
let k = parse_keyword(src, j, "[");
const idx = parse_expr(src, k);
k = idx.v1;
k = skip_ws(src, k);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 93)) {
panic("expected ']' ");
}
left = ParsedExpr("vec_get(" + left.v0 + ", " + idx.v0 + ")", k + 1);
j = left.v1;
continue;
}
break;
}
return left;
}
export function try_skip_type_args_for_call(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 60)) {
return ParsedBool(false, i);
}
let p = k + 1;
let depth = 1;
while (p < stringLen(src)) {
const ch = stringCharCodeAt(src, p);
if (ch == 60) {
depth = depth + 1;
p = p + 1;
continue;
}
if (ch == 62) {
depth = depth - 1;
p = p + 1;
if (depth == 0) {
const after = skip_ws(src, p);
if (after < stringLen(src) && stringCharCodeAt(src, after) == 40) {
return ParsedBool(true, p);
}
return ParsedBool(false, i);
}
continue;
}
p = p + 1;
}
return ParsedBool(false, i);
}
export function parse_arg_list(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedParams("", k + 1);
}
let out = "";
let first = true;
while (true) {
const e = parse_expr(src, k);
k = e.v1;
if (first) {
out = out + e.v0;
} else {
out = out + ", " + e.v0;
}
first = false;
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in arg list");
}
const c = stringCharCodeAt(src, k);
if (c == 44) {
k = k + 1;
continue;
}
if (c == 41) {
return ParsedParams(out, k + 1);
}
panic_at(src, k, "expected ',' or ')' in arg list");
}
return ParsedParams(out, k);
}
