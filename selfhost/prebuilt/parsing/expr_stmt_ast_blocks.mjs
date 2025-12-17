// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_push } from "../rt/vec.mjs";
import { panic_at } from "../util/diagnostics.mjs";
import { skip_ws, starts_with_at } from "../util/lexing.mjs";
import { is_assign_stmt_start_impl, is_field_assign_stmt_start_impl, is_index_assign_stmt_start_impl, is_deref_assign_stmt_start_impl } from "./expr_stmt_stmt_starts.mjs";
import { ParsedExprAst, ParsedMainAst, ParsedStmtsAst } from "./expr_stmt_types.mjs";
import { parse_expr_ast_impl } from "./expr_stmt_ast_expr.mjs";
import { parse_stmt_ast } from "./expr_stmt_ast_stmt.mjs";
import { span, span_start, expr_span, expr_undefined, expr_block, stmt_expr } from "../ast.mjs";
export function skip_string_literal(src, i, quote) {
let k = i + 1;
while (k < stringLen(src)) {
const c = stringCharCodeAt(src, k);
if (c == 92) {
k = k + 2;
continue;
}
if (c == quote) {
k = k + 1;
break;
}
k = k + 1;
}
return k;
}
export function scan_if_stmt_has_else(src, i) {
let j = skip_ws(src, i);
if (!starts_with_at(src, j, "if")) {
return false;
}
j = j + 2;
j = skip_ws(src, j);
if (!(j < stringLen(src) && stringCharCodeAt(src, j) == 40)) {
return false;
}
let k = j + 1;
let depth = 1;
while (k < stringLen(src) && depth > 0) {
const ch = stringCharCodeAt(src, k);
if (ch == 34) {
k = skip_string_literal(src, k, 34);
continue;
}
if (ch == 39) {
k = skip_string_literal(src, k, 39);
continue;
}
if (ch == 40) {
depth = depth + 1;
k = k + 1;
continue;
}
if (ch == 41) {
depth = depth - 1;
k = k + 1;
continue;
}
k = k + 1;
}
k = skip_ws(src, k);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 123)) {
return false;
}
k = k + 1;
let bDepth = 1;
while (k < stringLen(src) && bDepth > 0) {
const ch = stringCharCodeAt(src, k);
if (ch == 34) {
k = skip_string_literal(src, k, 34);
continue;
}
if (ch == 39) {
k = skip_string_literal(src, k, 39);
continue;
}
if (ch == 123) {
bDepth = bDepth + 1;
k = k + 1;
continue;
}
if (ch == 125) {
bDepth = bDepth - 1;
k = k + 1;
continue;
}
k = k + 1;
}
k = skip_ws(src, k);
return starts_with_at(src, k, "else");
}
export function parse_stmt_block_ast(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 123)) {
panic_at(src, k, "expected '{'");
}
k = k + 1;
const body = vec_new();
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src))) {
panic_at(src, t, "expected '}'");
}
if (stringCharCodeAt(src, t) == 125) {
return ParsedStmtsAst(body, t + 1);
}
const st = parse_stmt_ast(src, k);
vec_push(body, st.stmt);
k = st.nextPos;
}
return ParsedStmtsAst(body, k);
}
export function parse_block_body_ast(src, i) {
const j = skip_ws(src, i);
if (!(j < stringLen(src) && stringCharCodeAt(src, j) == 123)) {
panic_at(src, j, "expected '{'");
}
let k = j + 1;
const body = vec_new();
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src))) {
panic_at(src, t, "expected '}'");
}
if (stringCharCodeAt(src, t) == 125) {
break;
}
const isStmt = starts_with_at(src, t, "let") || starts_with_at(src, t, "fn") || starts_with_at(src, t, "while") || starts_with_at(src, t, "if") && !scan_if_stmt_has_else(src, t) || starts_with_at(src, t, "yield") || is_field_assign_stmt_start_impl(src, t) || is_assign_stmt_start_impl(src, t) || is_index_assign_stmt_start_impl(src, t) || is_deref_assign_stmt_start_impl(src, t);
if (isStmt) {
const st = parse_stmt_ast(src, k);
vec_push(body, st.stmt);
k = st.nextPos;
continue;
}
const e = parse_expr_ast_impl(src, k);
const after = skip_ws(src, e.nextPos);
if (after < stringLen(src) && stringCharCodeAt(src, after) == 59) {
vec_push(body, stmt_expr(span(span_start(expr_span(e.expr)), after + 1), e.expr));
k = after + 1;
continue;
}
if (after < stringLen(src) && stringCharCodeAt(src, after) != 125) {
vec_push(body, stmt_expr(span(span_start(expr_span(e.expr)), e.nextPos), e.expr));
k = e.nextPos;
continue;
}
break;
}
const t2 = skip_ws(src, k);
if (t2 < stringLen(src) && stringCharCodeAt(src, t2) == 125) {
return ParsedMainAst(body, expr_undefined(span(t2, t2)), t2 + 1);
}
const tail = parse_expr_ast_impl(src, k);
k = skip_ws(src, tail.nextPos);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 125)) {
panic_at(src, k, "expected '}'");
}
return ParsedMainAst(body, tail.expr, k + 1);
}
export function parse_block_expr_ast(src, i) {
const start = skip_ws(src, i);
const b = parse_block_body_ast(src, start);
return ParsedExprAst(expr_block(span(start, b.nextPos), b.body, b.tail), b.nextPos);
}
export function parse_main_body_ast_impl(src, i) {
const j = skip_ws(src, i);
if (j < stringLen(src) && stringCharCodeAt(src, j) == 123) {
const b = parse_block_body_ast(src, i);
return b;
}
const e = parse_expr_ast_impl(src, i);
return ParsedMainAst(vec_new(), e.expr, e.nextPos);
}
