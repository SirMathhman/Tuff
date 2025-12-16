// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringFromCharCode } from "../rt/stdlib.mjs";
import { skip_ws, starts_with_at, is_ident_part } from "../util/lexing.mjs";
import { parse_ident } from "./primitives.mjs";
import { ParsedExpr } from "./expr_stmt_types.mjs";
import { parse_postfix } from "./expr_stmt_legacy_postfix.mjs";
export function parse_expr(src, i) {
return parse_or(src, i);
}
export function parse_or(src, i) {
let left = parse_and(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (!(j + 1 < stringLen(src))) {
break;
}
if (stringCharCodeAt(src, j) == 124 && stringCharCodeAt(src, j + 1) == 124) {
const rhs = parse_and(src, j + 2);
left = ParsedExpr("(" + left.v0 + " || " + rhs.v0 + ")", rhs.v1);
j = left.v1;
continue;
}
break;
}
return left;
}
export function parse_and(src, i) {
let left = parse_cmp(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (!(j + 1 < stringLen(src))) {
break;
}
if (stringCharCodeAt(src, j) == 38 && stringCharCodeAt(src, j + 1) == 38) {
const rhs = parse_cmp(src, j + 2);
left = ParsedExpr("(" + left.v0 + " && " + rhs.v0 + ")", rhs.v1);
j = left.v1;
continue;
}
break;
}
return left;
}
export function parse_cmp(src, i) {
let left = parse_add(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (!(j < stringLen(src))) {
break;
}
if (starts_with_at(src, j, "is")) {
const afterIs = j + 2;
let boundaryOk = true;
if (afterIs < stringLen(src) && is_ident_part(stringCharCodeAt(src, afterIs))) {
boundaryOk = false;
}
if (boundaryOk) {
let k0 = skip_ws(src, afterIs);
let isNot = false;
if (starts_with_at(src, k0, "not")) {
const afterNot = k0 + 3;
let notBoundaryOk = true;
if (afterNot < stringLen(src) && is_ident_part(stringCharCodeAt(src, afterNot))) {
notBoundaryOk = false;
}
if (notBoundaryOk) {
isNot = true;
k0 = skip_ws(src, afterNot);
}
}
const first = parse_ident(src, k0);
let k = first.nextPos;
let variantName = first.text;
while (true) {
const t = skip_ws(src, k);
if (!(t + 1 < stringLen(src))) {
break;
}
if (!(stringCharCodeAt(src, t) == 58 && stringCharCodeAt(src, t + 1) == 58)) {
break;
}
const next = parse_ident(src, t + 2);
variantName = next.text;
k = next.nextPos;
}
const q = stringFromCharCode(34);
const rhs = q + variantName + q;
const op = (isNot ? "!=" : "==");
left = ParsedExpr("(" + left.v0 + ".tag " + op + " " + rhs + ")", k);
j = left.v1;
continue;
}
}
const c0 = stringCharCodeAt(src, j);
const c1 = (j + 1 < stringLen(src) ? stringCharCodeAt(src, j + 1) : 0);
let op = "";
let adv = 0;
if (c0 == 61 && c1 == 61) {
op = "==";
adv = 2;
}
if (op == "" && c0 == 33 && c1 == 61) {
op = "!=";
adv = 2;
}
if (op == "" && c0 == 60 && c1 == 61) {
op = "<=";
adv = 2;
}
if (op == "" && c0 == 62 && c1 == 61) {
op = ">=";
adv = 2;
}
if (op == "" && c0 == 60) {
op = "<";
adv = 1;
}
if (op == "" && c0 == 62) {
op = ">";
adv = 1;
}
if (op == "") {
break;
}
const rhs = parse_add(src, j + adv);
left = ParsedExpr("(" + left.v0 + " " + op + " " + rhs.v0 + ")", rhs.v1);
j = left.v1;
}
return left;
}
export function parse_add(src, i) {
let left = parse_mul(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (!(j < stringLen(src))) {
break;
}
const op = stringCharCodeAt(src, j);
if (!(op == 43 || op == 45)) {
break;
}
const rhs = parse_mul(src, j + 1);
const opStr = (op == 43 ? "+" : "-");
left = ParsedExpr("(" + left.v0 + " " + opStr + " " + rhs.v0 + ")", rhs.v1);
j = left.v1;
}
return left;
}
export function parse_mul(src, i) {
let left = parse_unary(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (!(j < stringLen(src))) {
break;
}
const op = stringCharCodeAt(src, j);
if (!(op == 42 || op == 47)) {
break;
}
const rhs = parse_unary(src, j + 1);
const opStr = (op == 42 ? "*" : "/");
left = ParsedExpr("(" + left.v0 + " " + opStr + " " + rhs.v0 + ")", rhs.v1);
j = left.v1;
}
return left;
}
export function parse_unary(src, i) {
const j = skip_ws(src, i);
if (j < stringLen(src) && stringCharCodeAt(src, j) == 33) {
const inner = parse_unary(src, j + 1);
return ParsedExpr("(!" + inner.v0 + ")", inner.v1);
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 45) {
const inner = parse_unary(src, j + 1);
return ParsedExpr("(-" + inner.v0 + ")", inner.v1);
}
return parse_postfix(src, i);
}
