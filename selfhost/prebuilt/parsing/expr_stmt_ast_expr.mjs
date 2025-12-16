// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { skip_ws, starts_with_at, is_ident_part } from "../util/lexing.mjs";
import { parse_ident } from "./primitives.mjs";
import { ParsedExprAst } from "./expr_stmt_types.mjs";
import { parse_postfix_ast } from "./expr_stmt_ast_postfix.mjs";
import { span, span_start, expr_span, expr_field, expr_string, expr_unary, expr_binary, OpOr, OpAnd, OpEq, OpNe, OpLt, OpLe, OpGt, OpGe, OpAdd, OpSub, OpMul, OpDiv, OpNot, OpNeg } from "../ast.mjs";
export function parse_expr_ast_impl(src, i) {
return parse_or_ast(src, i);
}
export function parse_or_ast(src, i) {
let left = parse_and_ast(src, i);
let j = left.nextPos;
while (true) {
j = skip_ws(src, j);
if (!(j + 1 < stringLen(src))) {
break;
}
if (stringCharCodeAt(src, j) == 124 && stringCharCodeAt(src, j + 1) == 124) {
const rhs = parse_and_ast(src, j + 2);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_binary(span(start, rhs.nextPos), OpOr, left.expr, rhs.expr), rhs.nextPos);
j = left.nextPos;
continue;
}
break;
}
return left;
}
export function parse_and_ast(src, i) {
let left = parse_cmp_ast(src, i);
let j = left.nextPos;
while (true) {
j = skip_ws(src, j);
if (!(j + 1 < stringLen(src))) {
break;
}
if (stringCharCodeAt(src, j) == 38 && stringCharCodeAt(src, j + 1) == 38) {
const rhs = parse_cmp_ast(src, j + 2);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_binary(span(start, rhs.nextPos), OpAnd, left.expr, rhs.expr), rhs.nextPos);
j = left.nextPos;
continue;
}
break;
}
return left;
}
export function parse_cmp_ast(src, i) {
let left = parse_add_ast(src, i);
let j = left.nextPos;
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
const start = span_start(expr_span(left.expr));
const end = k;
const tagExpr = expr_field(span(start, end), left.expr, "tag");
const rhs = expr_string(span(first.startPos, end), variantName);
const op = (isNot ? OpNe : OpEq);
left = ParsedExprAst(expr_binary(span(start, end), op, tagExpr, rhs), end);
j = left.nextPos;
continue;
}
}
const c0 = stringCharCodeAt(src, j);
const c1 = (j + 1 < stringLen(src) ? stringCharCodeAt(src, j + 1) : 0);
let opTag = "";
let op = OpEq;
let adv = 0;
if (c0 == 61 && c1 == 61) {
opTag = "==";
op = OpEq;
adv = 2;
}
if (opTag == "" && c0 == 33 && c1 == 61) {
opTag = "!=";
op = OpNe;
adv = 2;
}
if (opTag == "" && c0 == 60 && c1 == 61) {
opTag = "<=";
op = OpLe;
adv = 2;
}
if (opTag == "" && c0 == 62 && c1 == 61) {
opTag = ">=";
op = OpGe;
adv = 2;
}
if (opTag == "" && c0 == 60) {
opTag = "<";
op = OpLt;
adv = 1;
}
if (opTag == "" && c0 == 62) {
opTag = ">";
op = OpGt;
adv = 1;
}
if (opTag == "") {
break;
}
const rhs = parse_add_ast(src, j + adv);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_binary(span(start, rhs.nextPos), op, left.expr, rhs.expr), rhs.nextPos);
j = left.nextPos;
}
return left;
}
export function parse_add_ast(src, i) {
let left = parse_mul_ast(src, i);
let j = left.nextPos;
while (true) {
j = skip_ws(src, j);
if (!(j < stringLen(src))) {
break;
}
const ch = stringCharCodeAt(src, j);
if (!(ch == 43 || ch == 45)) {
break;
}
const rhs = parse_mul_ast(src, j + 1);
const op = (ch == 43 ? OpAdd : OpSub);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_binary(span(start, rhs.nextPos), op, left.expr, rhs.expr), rhs.nextPos);
j = left.nextPos;
}
return left;
}
export function parse_mul_ast(src, i) {
let left = parse_unary_ast(src, i);
let j = left.nextPos;
while (true) {
j = skip_ws(src, j);
if (!(j < stringLen(src))) {
break;
}
const ch = stringCharCodeAt(src, j);
if (!(ch == 42 || ch == 47)) {
break;
}
const rhs = parse_unary_ast(src, j + 1);
const op = (ch == 42 ? OpMul : OpDiv);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_binary(span(start, rhs.nextPos), op, left.expr, rhs.expr), rhs.nextPos);
j = left.nextPos;
}
return left;
}
export function parse_unary_ast(src, i) {
const j = skip_ws(src, i);
if (j < stringLen(src) && stringCharCodeAt(src, j) == 33) {
const inner = parse_unary_ast(src, j + 1);
return ParsedExprAst(expr_unary(span(j, inner.nextPos), OpNot, inner.expr), inner.nextPos);
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 45) {
const inner = parse_unary_ast(src, j + 1);
return ParsedExprAst(expr_unary(span(j, inner.nextPos), OpNeg, inner.expr), inner.nextPos);
}
return parse_postfix_ast(src, i);
}
