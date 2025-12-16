// compiled by selfhost tuffc
import { panic, stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len } from "../rt/vec.mjs";
import { panic_at } from "../util/diagnostics.mjs";
import { skip_ws, is_digit } from "../util/lexing.mjs";
import { parse_ident, parse_keyword, parse_number } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { ParsedExprAst, ParsedExprListAst, ParsedTypeArgsForCallAst } from "./expr_stmt_types.mjs";
import { parse_primary_ast } from "./expr_stmt_ast_primary.mjs";
import { parse_expr_ast_impl } from "./expr_stmt_ast_expr.mjs";
import { span, span_start, expr_span, expr_call, expr_call_typed, expr_tuple_index, expr_field, expr_index } from "../ast.mjs";
export function parse_postfix_ast(src, i) {
let left = parse_primary_ast(src, i);
let j = left.nextPos;
let pendingTypeArgs = vec_new();
while (true) {
j = skip_ws(src, j);
if (left.expr.tag != "ECall" && j < stringLen(src) && stringCharCodeAt(src, j) == 60) {
const parsed = try_parse_type_args_for_call_ast(src, j);
if (parsed.ok) {
pendingTypeArgs = parsed.typeArgs;
j = parsed.nextPos;
continue;
}
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 40) {
const args = parse_arg_list_ast(src, j);
const start = span_start(expr_span(left.expr));
const callSpan = span(start, args.nextPos);
if (vec_len(pendingTypeArgs) > 0) {
left = ParsedExprAst(expr_call_typed(callSpan, left.expr, pendingTypeArgs, args.items), args.nextPos);
pendingTypeArgs = vec_new();
} else {
left = ParsedExprAst(expr_call(callSpan, left.expr, args.items), args.nextPos);
}
j = left.nextPos;
continue;
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 46) {
const t = skip_ws(src, j + 1);
if (t < stringLen(src) && is_digit(stringCharCodeAt(src, t))) {
const n = parse_number(src, t);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_tuple_index(span(start, n.nextPos), left.expr, n.value), n.nextPos);
j = left.nextPos;
continue;
}
const next = parse_ident(src, j + 1);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_field(span(start, next.nextPos), left.expr, next.text), next.nextPos);
j = left.nextPos;
continue;
}
if (j < stringLen(src) && stringCharCodeAt(src, j) == 91) {
let k = parse_keyword(src, j, "[");
const idx = parse_expr_ast_impl(src, k);
k = idx.nextPos;
k = skip_ws(src, k);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 93)) {
panic("expected ']'");
}
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_index(span(start, k + 1), left.expr, idx.expr), k + 1);
j = left.nextPos;
continue;
}
break;
}
return left;
}
export function try_parse_type_args_for_call_ast(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 60)) {
return ParsedTypeArgsForCallAst(false, vec_new(), i);
}
let depth = 1;
let scan = k + 1;
let endGt = -1;
while (scan < stringLen(src)) {
const ch = stringCharCodeAt(src, scan);
if (ch == 60) {
depth = depth + 1;
}
if (ch == 62) {
depth = depth - 1;
if (depth == 0) {
endGt = scan;
break;
}
}
scan = scan + 1;
}
if (endGt == -1) {
return ParsedTypeArgsForCallAst(false, vec_new(), i);
}
const after = skip_ws(src, endGt + 1);
if (!(after < stringLen(src) && stringCharCodeAt(src, after) == 40)) {
return ParsedTypeArgsForCallAst(false, vec_new(), i);
}
k = k + 1;
k = skip_ws(src, k);
const typeArgs = vec_new();
if (k == endGt) {
return ParsedTypeArgsForCallAst(false, vec_new(), i);
}
while (true) {
const t = parse_type_expr(src, k);
vec_push(typeArgs, t.v0);
k = skip_ws(src, t.v1);
if (k == endGt) {
return ParsedTypeArgsForCallAst(true, typeArgs, endGt + 1);
}
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '>' in type args");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
k = skip_ws(src, k);
continue;
}
panic_at(src, k, "expected ',' or '>' in type args");
}
return ParsedTypeArgsForCallAst(false, vec_new(), i);
}
export function parse_arg_list_ast(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
const items = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedExprListAst(items, k + 1);
}
while (true) {
const e = parse_expr_ast_impl(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in arg list");
}
const c = stringCharCodeAt(src, k);
if (c == 44) {
k = k + 1;
k = skip_ws(src, k);
continue;
}
if (c == 41) {
return ParsedExprListAst(items, k + 1);
}
panic_at(src, k, "expected ',' or ')' in arg list");
}
return ParsedExprListAst(items, k);
}
