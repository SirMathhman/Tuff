// compiled by selfhost tuffc
import { panic, stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_push } from "../rt/vec.mjs";
import { panic_at } from "../util/diagnostics.mjs";
import { skip_ws } from "../util/lexing.mjs";
import { parse_ident, parse_keyword } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { ParsedExprAst, ParsedTypeParamsForLambdaAst } from "./expr_stmt_types.mjs";
import { parse_expr_ast_impl } from "./expr_stmt_ast_expr.mjs";
import { parse_block_expr_ast } from "./expr_stmt_ast_blocks.mjs";
import { span, expr_lambda } from "../ast.mjs";
export function find_matching_rparen(src, openPos) {
let i = openPos;
let depth = 0;
while (i < stringLen(src)) {
const ch = stringCharCodeAt(src, i);
if (ch == 34) {
i = i + 1;
while (i < stringLen(src)) {
const c = stringCharCodeAt(src, i);
if (c == 92) {
i = i + 2;
continue;
}
if (c == 34) {
i = i + 1;
break;
}
i = i + 1;
}
continue;
}
if (ch == 39) {
i = i + 1;
while (i < stringLen(src)) {
const c = stringCharCodeAt(src, i);
if (c == 92) {
i = i + 2;
continue;
}
if (c == 39) {
i = i + 1;
break;
}
i = i + 1;
}
continue;
}
if (ch == 40) {
depth = depth + 1;
i = i + 1;
continue;
}
if (ch == 41) {
depth = depth - 1;
if (depth == 0) {
return i;
}
i = i + 1;
continue;
}
i = i + 1;
}
return -1;
}
export function parse_lambda_expr_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "(");
k = skip_ws(src, k);
const params = vec_new();
const paramTyAnns = vec_new();
(k < stringLen(src) && stringCharCodeAt(src, k) == 41 ? (() => {
k = k + 1;
return undefined;
})() : (() => {
while (true) {
const name = parse_ident(src, k);
vec_push(params, name.text);
k = skip_ws(src, name.nextPos);
let tyAnn = "";
if (k < stringLen(src) && stringCharCodeAt(src, k) == 58) {
k = parse_keyword(src, k, ":");
const ty = parse_type_expr(src, k);
tyAnn = ty.v0;
k = ty.v1;
}
vec_push(paramTyAnns, tyAnn);
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in lambda params");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
k = k + 1;
break;
}
continue;
}
if (ch == 41) {
k = k + 1;
break;
}
panic_at(src, k, "expected ',' or ')' in lambda params");
}
return undefined;
})());
k = skip_ws(src, k);
let retTyAnn = "";
if (k < stringLen(src) && stringCharCodeAt(src, k) == 58) {
k = parse_keyword(src, k, ":");
const ret = parse_type_expr(src, k);
retTyAnn = ret.v0;
k = ret.v1;
}
k = parse_keyword(src, k, "=>");
const t = skip_ws(src, k);
const body = (t < stringLen(src) && stringCharCodeAt(src, t) == 123 ? parse_block_expr_ast(src, k) : parse_expr_ast_impl(src, k));
return ParsedExprAst(expr_lambda(span(start, body.nextPos), vec_new(), params, paramTyAnns, retTyAnn, body.expr), body.nextPos);
}
export function parse_type_param_names_list_ast(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 60)) {
return ParsedTypeParamsForLambdaAst(vec_new(), i);
}
k = k + 1;
k = skip_ws(src, k);
const names = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 62) {
return ParsedTypeParamsForLambdaAst(names, k + 1);
}
while (true) {
const name = parse_ident(src, k);
vec_push(names, name.text);
k = skip_ws(src, name.nextPos);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '>' after type param list");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
k = skip_ws(src, k);
continue;
}
if (ch == 62) {
k = k + 1;
break;
}
panic_at(src, k, "expected ',' or '>' in type param list");
}
return ParsedTypeParamsForLambdaAst(names, k);
}
