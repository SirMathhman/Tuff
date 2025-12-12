// compiled by selfhost tuffc
import { panic, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { panic_at, find_struct_fields, is_identifier_too_short, warn_short_identifier } from "../util/diagnostics.mjs";
import { is_digit, is_ident_start, is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { ParsedBool, ParsedIdent, ParsedNumber, parse_ident, parse_keyword, parse_number, parse_optional_semicolon } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { span, span_start, expr_span, expr_undefined, expr_int, expr_bool, expr_string, expr_ident, expr_path, expr_struct_lit, expr_unary, expr_binary, expr_call, expr_if, expr_block, expr_vec_lit, expr_tuple_lit, expr_index, expr_tuple_index, expr_field, expr_match, OpOr, OpAnd, OpEq, OpNe, OpLt, OpLe, OpGt, OpGe, OpAdd, OpSub, OpMul, OpDiv, OpNot, OpNeg, mk_match_arm, pat_wildcard, pat_int, pat_bool, pat_string, stmt_let, stmt_assign, stmt_expr, stmt_yield, stmt_while, stmt_if, stmt_index_assign, stmt_field_assign } from "../ast.mjs";
export function ParsedExpr(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedMain(body, expr, v1) {
return { body: body, expr: expr, v1: v1 };
}
export function ParsedStmt(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedParams(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedExprAst(expr, nextPos) {
return { expr: expr, nextPos: nextPos };
}
export function ParsedMainAst(body, tail, nextPos) {
return { body: body, tail: tail, nextPos: nextPos };
}
export function ParsedStmtAst(stmt, nextPos) {
return { stmt: stmt, nextPos: nextPos };
}
export function ParsedStmtsAst(stmts, nextPos) {
return { stmts: stmts, nextPos: nextPos };
}
export function ParsedExprListAst(items, nextPos) {
return { items: items, nextPos: nextPos };
}
export function parse_expr(src, i) {
return parse_or(src, i);
}
export function parse_expr_ast(src, i) {
return parse_or_ast(src, i);
}
export function parse_or_ast(src, i) {
let left = parse_and_ast(src, i);
let j = left.nextPos;
while (true) {
j = skip_ws(src, j);
if ((!((j + 1) < stringLen(src)))) {
break;
}
if (((stringCharCodeAt(src, j) == 124) && (stringCharCodeAt(src, (j + 1)) == 124))) {
const rhs = parse_and_ast(src, (j + 2));
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
if ((!((j + 1) < stringLen(src)))) {
break;
}
if (((stringCharCodeAt(src, j) == 38) && (stringCharCodeAt(src, (j + 1)) == 38))) {
const rhs = parse_cmp_ast(src, (j + 2));
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
if ((!(j < stringLen(src)))) {
break;
}
const c0 = stringCharCodeAt(src, j);
const c1 = (((j + 1) < stringLen(src)) ? stringCharCodeAt(src, (j + 1)) : 0);
let opTag = "";
let op = OpEq;
let adv = 0;
if (((c0 == 61) && (c1 == 61))) {
opTag = "==";
op = OpEq;
adv = 2;
}
if ((((opTag == "") && (c0 == 33)) && (c1 == 61))) {
opTag = "!=";
op = OpNe;
adv = 2;
}
if ((((opTag == "") && (c0 == 60)) && (c1 == 61))) {
opTag = "<=";
op = OpLe;
adv = 2;
}
if ((((opTag == "") && (c0 == 62)) && (c1 == 61))) {
opTag = ">=";
op = OpGe;
adv = 2;
}
if (((opTag == "") && (c0 == 60))) {
opTag = "<";
op = OpLt;
adv = 1;
}
if (((opTag == "") && (c0 == 62))) {
opTag = ">";
op = OpGt;
adv = 1;
}
if ((opTag == "")) {
break;
}
const rhs = parse_add_ast(src, (j + adv));
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
if ((!(j < stringLen(src)))) {
break;
}
const ch = stringCharCodeAt(src, j);
if ((!((ch == 43) || (ch == 45)))) {
break;
}
const rhs = parse_mul_ast(src, (j + 1));
const op = ((ch == 43) ? OpAdd : OpSub);
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
if ((!(j < stringLen(src)))) {
break;
}
const ch = stringCharCodeAt(src, j);
if ((!((ch == 42) || (ch == 47)))) {
break;
}
const rhs = parse_unary_ast(src, (j + 1));
const op = ((ch == 42) ? OpMul : OpDiv);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_binary(span(start, rhs.nextPos), op, left.expr, rhs.expr), rhs.nextPos);
j = left.nextPos;
}
return left;
}
export function parse_unary_ast(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 33))) {
const inner = parse_unary_ast(src, (j + 1));
return ParsedExprAst(expr_unary(span(j, inner.nextPos), OpNot, inner.expr), inner.nextPos);
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 45))) {
const inner = parse_unary_ast(src, (j + 1));
return ParsedExprAst(expr_unary(span(j, inner.nextPos), OpNeg, inner.expr), inner.nextPos);
}
return parse_postfix_ast(src, i);
}
export function parse_postfix_ast(src, i) {
let left = parse_primary_ast(src, i);
let j = left.nextPos;
while (true) {
j = skip_ws(src, j);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 60))) {
const skipped = try_skip_type_args_for_call(src, j);
if (skipped.ok) {
j = skipped.nextPos;
continue;
}
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 40))) {
const args = parse_arg_list_ast(src, j);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_call(span(start, args.nextPos), left.expr, args.items), args.nextPos);
j = left.nextPos;
continue;
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46))) {
const t = skip_ws(src, (j + 1));
if (((t < stringLen(src)) && is_digit(stringCharCodeAt(src, t)))) {
const n = parse_number(src, t);
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_tuple_index(span(start, n.nextPos), left.expr, n.value), n.nextPos);
j = left.nextPos;
continue;
}
const next = parse_ident(src, (j + 1));
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_field(span(start, next.nextPos), left.expr, next.text), next.nextPos);
j = left.nextPos;
continue;
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 91))) {
let k = parse_keyword(src, j, "[");
const idx = parse_expr_ast(src, k);
k = idx.nextPos;
k = skip_ws(src, k);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 93)))) {
panic("expected ']'");
}
const start = span_start(expr_span(left.expr));
left = ParsedExprAst(expr_index(span(start, (k + 1)), left.expr, idx.expr), (k + 1));
j = left.nextPos;
continue;
}
break;
}
return left;
}
export function parse_arg_list_ast(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
const items = vec_new();
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExprListAst(items, (k + 1));
}
while (true) {
const e = parse_expr_ast(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ')' in arg list");
}
const c = stringCharCodeAt(src, k);
if ((c == 44)) {
k = (k + 1);
k = skip_ws(src, k);
continue;
}
if ((c == 41)) {
return ParsedExprListAst(items, (k + 1));
}
panic_at(src, k, "expected ',' or ')' in arg list");
}
return ParsedExprListAst(items, k);
}
export function parse_string_lit_value(src, startQuote) {
let k = (startQuote + 1);
let out = "";
while ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if ((ch == 34)) {
return ParsedIdent(out, startQuote, (k + 1));
}
if ((ch == 92)) {
k = (k + 1);
if ((!(k < stringLen(src)))) {
panic_at(src, startQuote, "unterminated string");
}
const esc = stringCharCodeAt(src, k);
const code = (() => { switch (esc) {
case 110: return 10;
case 114: return 13;
case 116: return 9;
case 48: return 0;
case 92: return 92;
case 34: return 34;
default: return esc;
} })();
out = (out + stringFromCharCode(code));
k = (k + 1);
continue;
}
out = (out + stringFromCharCode(ch));
k = (k + 1);
}
return panic_at(src, startQuote, "unterminated string");
}
export function parse_vec_lit_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "[");
k = skip_ws(src, k);
const items = vec_new();
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 93))) {
return ParsedExprAst(expr_vec_lit(span(start, (k + 1)), items), (k + 1));
}
while (true) {
const e = parse_expr_ast(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ']' in vec literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 93)) {
return ParsedExprAst(expr_vec_lit(span(start, (k + 1)), items), (k + 1));
}
panic_at(src, k, "expected ',' or ']' in vec literal");
}
return ParsedExprAst(expr_vec_lit(span(start, k), items), k);
}
export function parse_stmt_block_ast(src, i) {
let k = skip_ws(src, i);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 123)))) {
panic_at(src, k, "expected '{'");
}
k = (k + 1);
const body = vec_new();
while (true) {
const t = skip_ws(src, k);
if ((!(t < stringLen(src)))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
return ParsedStmtsAst(body, (t + 1));
}
const st = parse_stmt_ast(src, k);
vec_push(body, st.stmt);
k = st.nextPos;
}
return ParsedStmtsAst(body, k);
}
export function parse_block_body_ast(src, i) {
const j = skip_ws(src, i);
if ((!((j < stringLen(src)) && (stringCharCodeAt(src, j) == 123)))) {
panic_at(src, j, "expected '{'");
}
let k = (j + 1);
const body = vec_new();
while (true) {
const t = skip_ws(src, k);
if ((!(t < stringLen(src)))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
break;
}
const isStmt = ((((((starts_with_at(src, t, "let") || starts_with_at(src, t, "while")) || starts_with_at(src, t, "if")) || starts_with_at(src, t, "yield")) || is_field_assign_stmt_start(src, t)) || is_assign_stmt_start(src, t)) || is_index_assign_stmt_start(src, t));
if (isStmt) {
const st = parse_stmt_ast(src, k);
vec_push(body, st.stmt);
k = st.nextPos;
continue;
}
const e = parse_expr_ast(src, k);
const after = skip_ws(src, e.nextPos);
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) == 59))) {
vec_push(body, stmt_expr(span(span_start(expr_span(e.expr)), (after + 1)), e.expr));
k = (after + 1);
continue;
}
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) != 125))) {
vec_push(body, stmt_expr(span(span_start(expr_span(e.expr)), e.nextPos), e.expr));
k = e.nextPos;
continue;
}
break;
}
const t2 = skip_ws(src, k);
if (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 125))) {
return ParsedMainAst(body, expr_undefined(span(t2, t2)), (t2 + 1));
}
const tail = parse_expr_ast(src, k);
k = skip_ws(src, tail.nextPos);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125)))) {
panic_at(src, k, "expected '}'");
}
return ParsedMainAst(body, tail.expr, (k + 1));
}
export function parse_block_expr_ast(src, i) {
const start = skip_ws(src, i);
const b = parse_block_body_ast(src, start);
return ParsedExprAst(expr_block(span(start, b.nextPos), b.body, b.tail), b.nextPos);
}
export function parse_if_expr_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr_ast(src, k);
k = cond.nextPos;
k = parse_keyword(src, k, ")");
const t1 = skip_ws(src, k);
const thenE = (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 123)) ? parse_block_expr_ast(src, k) : parse_expr_ast(src, k));
k = thenE.nextPos;
k = parse_keyword(src, k, "else");
const t2 = skip_ws(src, k);
const elseE = (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 123)) ? parse_block_expr_ast(src, k) : parse_expr_ast(src, k));
return ParsedExprAst(expr_if(span(start, elseE.nextPos), cond.expr, thenE.expr, elseE.expr), elseE.nextPos);
}
export function parse_match_expr_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "match");
k = parse_keyword(src, k, "(");
const scrut = parse_expr_ast(src, k);
k = scrut.nextPos;
k = parse_keyword(src, k, ")");
k = parse_keyword(src, k, "{");
const arms = vec_new();
let sawDefault = false;
while (true) {
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
const patStart = k;
const c0 = stringCharCodeAt(src, k);
let pat = pat_wildcard(span(patStart, patStart));
if ((c0 == 34)) {
const lit = parse_string_lit_value(src, k);
pat = pat_string(span(patStart, lit.nextPos), lit.text);
k = lit.nextPos;
} else {
if (is_digit(c0)) {
const n = parse_number(src, k);
pat = pat_int(span(patStart, n.nextPos), n.value);
k = n.nextPos;
} else {
const id = parse_ident(src, k);
k = id.nextPos;
if ((id.text == "_")) {
pat = pat_wildcard(span(patStart, k));
} else {
if ((id.text == "true")) {
pat = pat_bool(span(patStart, k), true);
} else {
if ((id.text == "false")) {
pat = pat_bool(span(patStart, k), false);
} else {
panic_at(src, patStart, ("unsupported match pattern: " + id.text));
}
}
}
}
}
k = parse_keyword(src, k, "=>");
const t = skip_ws(src, k);
const armE = (((t < stringLen(src)) && (stringCharCodeAt(src, t) == 123)) ? parse_block_expr_ast(src, k) : parse_expr_ast(src, k));
k = armE.nextPos;
if ((pat.tag == "MPWildcard")) {
sawDefault = true;
}
vec_push(arms, mk_match_arm(span(patStart, armE.nextPos), pat, armE.expr));
k = skip_ws(src, k);
if ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if (((ch == 44) || (ch == 59))) {
k = (k + 1);
}
}
}
if ((!sawDefault)) {
panic_at(src, k, "match requires _ arm");
}
return ParsedExprAst(expr_match(span(start, k), scrut.expr, arms), k);
}
export function parse_primary_ast(src, i) {
const j = skip_ws(src, i);
if ((!(j < stringLen(src)))) {
panic_at(src, j, "expected expression");
}
const c = stringCharCodeAt(src, j);
if (starts_with_at(src, j, "if")) {
return parse_if_expr_ast(src, j);
}
if (starts_with_at(src, j, "match")) {
return parse_match_expr_ast(src, j);
}
if ((c == 91)) {
return parse_vec_lit_ast(src, j);
}
if ((c == 123)) {
return parse_block_expr_ast(src, j);
}
if ((c == 39)) {
const start = j;
let k = (j + 1);
if ((!(k < stringLen(src)))) {
panic_at(src, start, "unterminated char literal");
}
let code = 0;
const ch0 = stringCharCodeAt(src, k);
if ((ch0 == 92)) {
k = (k + 1);
if ((!(k < stringLen(src)))) {
panic_at(src, start, "unterminated char escape");
}
const esc = stringCharCodeAt(src, k);
code = (() => { switch (esc) {
case 110: return 10;
case 114: return 13;
case 116: return 9;
case 48: return 0;
case 92: return 92;
case 39: return 39;
case 34: return 34;
default: return (() => {
panic_at(src, k, "unknown char escape");
return 0;
})();
} })();
k = (k + 1);
} else {
code = ch0;
k = (k + 1);
}
if ((!(k < stringLen(src)))) {
panic_at(src, start, "unterminated char literal");
}
if ((stringCharCodeAt(src, k) != 39)) {
panic_at(src, start, "char literal must contain exactly one character");
}
return ParsedExprAst(expr_int(span(start, (k + 1)), code), (k + 1));
}
if ((c == 34)) {
const lit = parse_string_lit_value(src, j);
return ParsedExprAst(expr_string(span(j, lit.nextPos), lit.text), lit.nextPos);
}
if ((c == 40)) {
const first = parse_expr_ast(src, (j + 1));
let k = skip_ws(src, first.nextPos);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExprAst(first.expr, (k + 1));
}
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 44))) {
const items = vec_new();
vec_push(items, first.expr);
while (true) {
k = (k + 1);
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExprAst(expr_tuple_lit(span(j, (k + 1)), items), (k + 1));
}
const e = parse_expr_ast(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ')' in tuple literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
continue;
}
if ((ch == 41)) {
return ParsedExprAst(expr_tuple_lit(span(j, (k + 1)), items), (k + 1));
}
panic_at(src, k, "expected ',' or ')' in tuple literal");
}
}
panic_at(src, k, "expected ')'");
}
if (is_digit(c)) {
const n = parse_number(src, j);
return ParsedExprAst(expr_int(span(j, n.nextPos), n.value), n.nextPos);
}
if (is_ident_start(c)) {
const id = parse_ident(src, j);
let k = id.nextPos;
const parts = vec_new();
vec_push(parts, id.text);
while (true) {
const t = skip_ws(src, k);
if ((!((t + 1) < stringLen(src)))) {
break;
}
if ((!((stringCharCodeAt(src, t) == 58) && (stringCharCodeAt(src, (t + 1)) == 58)))) {
break;
}
const next = parse_ident(src, (t + 2));
vec_push(parts, next.text);
k = next.nextPos;
}
const t2 = skip_ws(src, k);
if (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 123))) {
const vals = parse_struct_lit_values_ast(src, t2);
const nameExpr = expr_path(span(j, k), parts);
return ParsedExprAst(expr_struct_lit(span(j, vals.nextPos), nameExpr, vals.items), vals.nextPos);
}
if ((vec_len(parts) == 1)) {
return ParsedExprAst(expr_ident(span(j, k), vec_get(parts, 0)), k);
}
return ParsedExprAst(expr_path(span(j, k), parts), k);
}
let end = (j + 32);
if ((end > stringLen(src))) {
end = stringLen(src);
}
return panic_at(src, j, (("expected expression near '" + stringSlice(src, j, end)) + "'"));
}
export function parse_struct_lit_values_ast(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "{");
k = skip_ws(src, k);
const items = vec_new();
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125))) {
return ParsedExprListAst(items, (k + 1));
}
while (true) {
const e = parse_expr_ast(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ',' or '}' in struct literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 125)) {
return ParsedExprListAst(items, (k + 1));
}
panic_at(src, k, "expected ',' or '}' in struct literal");
}
return ParsedExprListAst(items, k);
}
export function parse_stmt_ast(src, i) {
let k = skip_ws(src, i);
const start = k;
if (starts_with_at(src, k, "yield")) {
k = parse_keyword(src, k, "yield");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 59))) {
return ParsedStmtAst(stmt_yield(span(start, (k + 1)), expr_undefined(span(k, k))), (k + 1));
}
const e = parse_expr_ast(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_yield(span(start, k), e.expr), k);
}
if (starts_with_at(src, k, "let")) {
k = parse_keyword(src, k, "let");
const mutOpt = parse_mut_opt(src, k);
k = mutOpt.nextPos;
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
k = _ty.v1;
}
k = parse_keyword(src, k, "=");
const e = parse_expr_ast(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_let(span(start, k), mutOpt.ok, name.text, e.expr), k);
}
if (starts_with_at(src, k, "while")) {
k = parse_keyword(src, k, "while");
k = parse_keyword(src, k, "(");
const cond = parse_expr_ast(src, k);
k = parse_keyword(src, cond.nextPos, ")");
const body = parse_stmt_block_ast(src, k);
k = parse_optional_semicolon(src, body.nextPos);
return ParsedStmtAst(stmt_while(span(start, k), cond.expr, body.stmts), k);
}
if (starts_with_at(src, k, "if")) {
k = parse_keyword(src, k, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr_ast(src, k);
k = parse_keyword(src, cond.nextPos, ")");
const thenB = parse_stmt_block_ast(src, k);
k = thenB.nextPos;
const j = skip_ws(src, k);
if (starts_with_at(src, j, "else")) {
k = parse_keyword(src, k, "else");
const elseB = parse_stmt_block_ast(src, k);
k = parse_optional_semicolon(src, elseB.nextPos);
return ParsedStmtAst(stmt_if(span(start, k), cond.expr, thenB.stmts, true, elseB.stmts), k);
}
k = parse_optional_semicolon(src, k);
return ParsedStmtAst(stmt_if(span(start, k), cond.expr, thenB.stmts, false, vec_new()), k);
}
if (is_assign_stmt_start(src, k)) {
const name = parse_ident(src, k);
k = parse_keyword(src, name.nextPos, "=");
const e = parse_expr_ast(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_assign(span(start, k), name.text, e.expr), k);
}
if (is_field_assign_stmt_start(src, k)) {
const base = parse_ident(src, k);
k = base.nextPos;
const fields = vec_new();
while (true) {
const t = skip_ws(src, k);
if ((!((t < stringLen(src)) && (stringCharCodeAt(src, t) == 46)))) {
break;
}
k = parse_keyword(src, k, ".");
const part = parse_ident(src, k);
vec_push(fields, part.text);
k = part.nextPos;
}
k = parse_keyword(src, k, "=");
const e = parse_expr_ast(src, k);
k = parse_optional_semicolon(src, e.nextPos);
const baseExpr = expr_ident(span(base.startPos, base.nextPos), base.text);
return ParsedStmtAst(stmt_field_assign(span(start, k), baseExpr, fields, e.expr), k);
}
if (is_index_assign_stmt_start(src, k)) {
const name = parse_ident(src, k);
k = parse_keyword(src, name.nextPos, "[");
const idx = parse_expr_ast(src, k);
k = parse_keyword(src, idx.nextPos, "]");
k = parse_keyword(src, k, "=");
const val = parse_expr_ast(src, k);
k = parse_optional_semicolon(src, val.nextPos);
const baseExpr = expr_ident(span(name.startPos, name.nextPos), name.text);
return ParsedStmtAst(stmt_index_assign(span(start, k), baseExpr, idx.expr, val.expr), k);
}
const e = parse_expr_ast(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_expr(span(start, k), e.expr), k);
}
export function parse_main_body_ast(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 123))) {
const b = parse_block_body_ast(src, i);
return b;
}
const e = parse_expr_ast(src, i);
return ParsedMainAst(vec_new(), e.expr, e.nextPos);
}
export function parse_or(src, i) {
let left = parse_and(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!((j + 1) < stringLen(src)))) {
break;
}
if (((stringCharCodeAt(src, j) == 124) && (stringCharCodeAt(src, (j + 1)) == 124))) {
const rhs = parse_and(src, (j + 2));
left = ParsedExpr((((("(" + left.v0) + " || ") + rhs.v0) + ")"), rhs.v1);
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
if ((!((j + 1) < stringLen(src)))) {
break;
}
if (((stringCharCodeAt(src, j) == 38) && (stringCharCodeAt(src, (j + 1)) == 38))) {
const rhs = parse_cmp(src, (j + 2));
left = ParsedExpr((((("(" + left.v0) + " && ") + rhs.v0) + ")"), rhs.v1);
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
if ((!(j < stringLen(src)))) {
break;
}
const c0 = stringCharCodeAt(src, j);
const c1 = (((j + 1) < stringLen(src)) ? stringCharCodeAt(src, (j + 1)) : 0);
let op = "";
let adv = 0;
if (((c0 == 61) && (c1 == 61))) {
op = "==";
adv = 2;
}
if ((((op == "") && (c0 == 33)) && (c1 == 61))) {
op = "!=";
adv = 2;
}
if ((((op == "") && (c0 == 60)) && (c1 == 61))) {
op = "<=";
adv = 2;
}
if ((((op == "") && (c0 == 62)) && (c1 == 61))) {
op = ">=";
adv = 2;
}
if (((op == "") && (c0 == 60))) {
op = "<";
adv = 1;
}
if (((op == "") && (c0 == 62))) {
op = ">";
adv = 1;
}
if ((op == "")) {
break;
}
const rhs = parse_add(src, (j + adv));
left = ParsedExpr((((((("(" + left.v0) + " ") + op) + " ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
}
return left;
}
export function parse_add(src, i) {
let left = parse_mul(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!(j < stringLen(src)))) {
break;
}
const op = stringCharCodeAt(src, j);
if ((!((op == 43) || (op == 45)))) {
break;
}
const rhs = parse_mul(src, (j + 1));
const opStr = ((op == 43) ? "+" : "-");
left = ParsedExpr((((((("(" + left.v0) + " ") + opStr) + " ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
}
return left;
}
export function parse_mul(src, i) {
let left = parse_unary(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if ((!(j < stringLen(src)))) {
break;
}
const op = stringCharCodeAt(src, j);
if ((!((op == 42) || (op == 47)))) {
break;
}
const rhs = parse_unary(src, (j + 1));
const opStr = ((op == 42) ? "*" : "/");
left = ParsedExpr((((((("(" + left.v0) + " ") + opStr) + " ") + rhs.v0) + ")"), rhs.v1);
j = left.v1;
}
return left;
}
export function parse_unary(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 33))) {
const inner = parse_unary(src, (j + 1));
return ParsedExpr((("(!" + inner.v0) + ")"), inner.v1);
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 45))) {
const inner = parse_unary(src, (j + 1));
return ParsedExpr((("(-" + inner.v0) + ")"), inner.v1);
}
return parse_postfix(src, i);
}
export function parse_postfix(src, i) {
let left = parse_primary(src, i);
let j = left.v1;
while (true) {
j = skip_ws(src, j);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 60))) {
const skipped = try_skip_type_args_for_call(src, j);
if (skipped.ok) {
j = skipped.nextPos;
continue;
}
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 40))) {
const args = parse_arg_list(src, j);
left = ParsedExpr((((left.v0 + "(") + args.v0) + ")"), args.v1);
j = left.v1;
continue;
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46))) {
const t = skip_ws(src, (j + 1));
if (((t < stringLen(src)) && is_digit(stringCharCodeAt(src, t)))) {
const n = parse_number(src, t);
left = ParsedExpr((((left.v0 + "[") + ("" + n.value)) + "]"), n.nextPos);
j = left.v1;
continue;
}
const next = parse_ident(src, (j + 1));
left = ParsedExpr(((left.v0 + ".") + next.text), next.nextPos);
j = left.v1;
continue;
}
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 91))) {
let k = parse_keyword(src, j, "[");
const idx = parse_expr(src, k);
k = idx.v1;
k = skip_ws(src, k);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 93)))) {
panic("expected ']' ");
}
left = ParsedExpr((((("vec_get(" + left.v0) + ", ") + idx.v0) + ")"), (k + 1));
j = left.v1;
continue;
}
break;
}
return left;
}
export function try_skip_type_args_for_call(src, i) {
let k = skip_ws(src, i);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 60)))) {
return ParsedBool(false, i);
}
let p = (k + 1);
let depth = 1;
while ((p < stringLen(src))) {
const ch = stringCharCodeAt(src, p);
if ((ch == 60)) {
depth = (depth + 1);
p = (p + 1);
continue;
}
if ((ch == 62)) {
depth = (depth - 1);
p = (p + 1);
if ((depth == 0)) {
const after = skip_ws(src, p);
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) == 40))) {
return ParsedBool(true, p);
}
return ParsedBool(false, i);
}
continue;
}
p = (p + 1);
}
return ParsedBool(false, i);
}
export function parse_arg_list(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedParams("", (k + 1));
}
let out = "";
let first = true;
while (true) {
const e = parse_expr(src, k);
k = e.v1;
if (first) {
out = (out + e.v0);
} else {
out = ((out + ", ") + e.v0);
}
first = false;
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ')' in arg list");
}
const c = stringCharCodeAt(src, k);
if ((c == 44)) {
k = (k + 1);
continue;
}
if ((c == 41)) {
return ParsedParams(out, (k + 1));
}
panic_at(src, k, "expected ',' or ')' in arg list");
}
return ParsedParams(out, k);
}
export function parse_struct_lit(src, structName, i) {
const fields = find_struct_fields(structName);
let k = skip_ws(src, i);
k = parse_keyword(src, k, "{");
let out = "({ ";
let idx = 0;
while (true) {
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected '}' in struct literal");
}
if ((stringCharCodeAt(src, k) == 125)) {
if ((!(idx == vec_len(fields)))) {
panic_at(src, k, ("wrong number of values in struct literal for " + structName));
}
return ParsedExpr((out + " })"), (k + 1));
}
if ((!(idx < vec_len(fields)))) {
panic_at(src, k, ("too many values in struct literal for " + structName));
}
const e = parse_expr(src, k);
k = e.v1;
const fieldName = vec_get(fields, idx);
if ((idx == 0)) {
out = (out + ((fieldName + ": ") + e.v0));
} else {
out = (out + (((", " + fieldName) + ": ") + e.v0));
}
idx = (idx + 1);
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ',' or '}' in struct literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 125)) {
continue;
}
panic_at(src, k, "expected ',' or '}' in struct literal");
}
return ParsedExpr((out + " })"), k);
}
export function parse_primary(src, i) {
const j = skip_ws(src, i);
if ((!(j < stringLen(src)))) {
panic_at(src, j, "expected expression");
}
const c = stringCharCodeAt(src, j);
if (starts_with_at(src, j, "if")) {
const ie = parse_if_expr(src, j);
return ie;
}
if (starts_with_at(src, j, "match")) {
const me = parse_match_expr(src, j);
return me;
}
if ((c == 91)) {
const ve = parse_vec_lit(src, j);
return ve;
}
if ((c == 123)) {
const be = parse_block_expr(src, j);
return be;
}
if ((c == 39)) {
const start = j;
let k = (j + 1);
if ((!(k < stringLen(src)))) {
panic_at(src, start, "unterminated char literal");
}
let code = 0;
const ch0 = stringCharCodeAt(src, k);
if ((ch0 == 92)) {
k = (k + 1);
if ((!(k < stringLen(src)))) {
panic_at(src, start, "unterminated char escape");
}
const esc = stringCharCodeAt(src, k);
code = (() => { switch (esc) {
case 110: return 10;
case 114: return 13;
case 116: return 9;
case 48: return 0;
case 92: return 92;
case 39: return 39;
case 34: return 34;
default: return (() => {
panic_at(src, k, "unknown char escape");
return 0;
})();
} })();
k = (k + 1);
} else {
code = ch0;
k = (k + 1);
}
if ((!(k < stringLen(src)))) {
panic_at(src, start, "unterminated char literal");
}
if ((stringCharCodeAt(src, k) != 39)) {
panic_at(src, start, "char literal must contain exactly one character");
}
return ParsedExpr(("" + code), (k + 1));
}
if ((c == 34)) {
const start = j;
let k = (j + 1);
while ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if ((ch == 34)) {
return ParsedExpr(stringSlice(src, start, (k + 1)), (k + 1));
}
if ((ch == 92)) {
k = (k + 1);
if ((k < stringLen(src))) {
k = (k + 1);
continue;
}
panic_at(src, start, "unterminated string");
}
k = (k + 1);
}
panic_at(src, start, "unterminated string");
}
if ((c == 40)) {
const first = parse_expr(src, (j + 1));
let k = skip_ws(src, first.v1);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExpr((("(" + first.v0) + ")"), (k + 1));
}
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 44))) {
let out = ("[" + first.v0);
while (true) {
k = (k + 1);
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 41))) {
return ParsedExpr((out + "]"), (k + 1));
}
const e = parse_expr(src, k);
out = ((out + ", ") + e.v0);
k = skip_ws(src, e.v1);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ')' in tuple literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
continue;
}
if ((ch == 41)) {
return ParsedExpr((out + "]"), (k + 1));
}
panic_at(src, k, "expected ',' or ')' in tuple literal");
}
}
panic_at(src, k, "expected ')'");
}
if (is_digit(c)) {
const n = parse_number(src, j);
return ParsedExpr(("" + n.value), n.nextPos);
}
if (is_ident_start(c)) {
const id = parse_ident(src, j);
let k = id.nextPos;
let out = id.text;
while (true) {
const t = skip_ws(src, k);
if ((!((t + 1) < stringLen(src)))) {
break;
}
if ((!((stringCharCodeAt(src, t) == 58) && (stringCharCodeAt(src, (t + 1)) == 58)))) {
break;
}
const next = parse_ident(src, (t + 2));
out = ((out + ".") + next.text);
k = next.nextPos;
}
const t2 = skip_ws(src, k);
if (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 123))) {
const lit = parse_struct_lit(src, out, t2);
return lit;
}
return ParsedExpr(out, k);
}
let end = (j + 32);
if ((end > stringLen(src))) {
end = stringLen(src);
}
return panic_at(src, j, (("expected expression near '" + stringSlice(src, j, end)) + "'"));
}
export function parse_vec_lit(src, i) {
let k = parse_keyword(src, i, "[");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 93))) {
return ParsedExpr("(() => { const __v = vec_new(); return __v; })()", (k + 1));
}
let pushes = "";
while (true) {
const e = parse_expr(src, k);
k = e.v1;
pushes = (pushes + (("vec_push(__v, " + e.v0) + ");\n"));
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected ']' in vec literal");
}
const ch = stringCharCodeAt(src, k);
if ((ch == 44)) {
k = (k + 1);
continue;
}
if ((ch == 93)) {
return ParsedExpr((("(() => { const __v = vec_new();\n" + pushes) + "return __v;\n})()"), (k + 1));
}
panic_at(src, k, "expected ',' or ']' in vec literal");
}
return ParsedExpr("None", k);
}
export function parse_block_body(src, i) {
const j = skip_ws(src, i);
if ((!((j < stringLen(src)) && (stringCharCodeAt(src, j) == 123)))) {
panic_at(src, j, "expected '{'");
}
let k = (j + 1);
let body = "";
while (true) {
const t = skip_ws(src, k);
if ((!(t < stringLen(src)))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
break;
}
const isStmt = ((((((starts_with_at(src, t, "let") || starts_with_at(src, t, "while")) || starts_with_at(src, t, "if")) || starts_with_at(src, t, "yield")) || is_field_assign_stmt_start(src, t)) || is_assign_stmt_start(src, t)) || is_index_assign_stmt_start(src, t));
if (isStmt) {
const st = parse_stmt(src, k);
body = (body + st.v0);
k = st.v1;
continue;
}
const e = parse_expr(src, k);
const after = skip_ws(src, e.v1);
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) == 59))) {
body = (body + (e.v0 + ";\n"));
k = (after + 1);
continue;
}
if (((after < stringLen(src)) && (stringCharCodeAt(src, after) != 125))) {
body = (body + (e.v0 + ";\n"));
k = e.v1;
continue;
}
break;
}
const t2 = skip_ws(src, k);
if (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 125))) {
return ParsedMain(body, "undefined", (t2 + 1));
}
const tail = parse_expr(src, k);
k = skip_ws(src, tail.v1);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 125)))) {
panic_at(src, k, "expected '}'");
}
return ParsedMain(body, tail.v0, (k + 1));
}
export function parse_block_expr(src, i) {
const b = parse_block_body(src, i);
return ParsedExpr((((("(() => {\n" + b.body) + "return ") + b.expr) + ";\n})()"), b.v1);
}
export function parse_if_expr(src, i) {
let k = parse_keyword(src, i, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const t1 = skip_ws(src, k);
const thenE = (((t1 < stringLen(src)) && (stringCharCodeAt(src, t1) == 123)) ? parse_block_expr(src, k) : parse_expr(src, k));
k = thenE.v1;
k = parse_keyword(src, k, "else");
const t2 = skip_ws(src, k);
const elseE = (((t2 < stringLen(src)) && (stringCharCodeAt(src, t2) == 123)) ? parse_block_expr(src, k) : parse_expr(src, k));
return ParsedExpr((((((("(" + cond.v0) + " ? ") + thenE.v0) + " : ") + elseE.v0) + ")"), elseE.v1);
}
export function parse_match_expr(src, i) {
let k = parse_keyword(src, i, "match");
k = parse_keyword(src, k, "(");
const scrut = parse_expr(src, k);
k = scrut.v1;
k = parse_keyword(src, k, ")");
k = parse_keyword(src, k, "{");
let cases = "";
let def = "";
while (true) {
k = skip_ws(src, k);
if ((!(k < stringLen(src)))) {
panic_at(src, k, "expected '}'");
}
if ((stringCharCodeAt(src, k) == 125)) {
k = (k + 1);
break;
}
let pat = "";
const c0 = stringCharCodeAt(src, k);
if ((c0 == 34)) {
const lit = parse_primary(src, k);
pat = lit.v0;
k = lit.v1;
} else {
if (is_digit(c0)) {
const n = parse_number(src, k);
pat = ("" + n.value);
k = n.nextPos;
} else {
const id = parse_ident(src, k);
pat = id.text;
k = id.nextPos;
}
}
k = parse_keyword(src, k, "=>");
const t = skip_ws(src, k);
const arm = (((t < stringLen(src)) && (stringCharCodeAt(src, t) == 123)) ? parse_block_expr(src, k) : parse_expr(src, k));
k = arm.v1;
if ((!(((((pat == "_") || (pat == "true")) || (pat == "false")) || is_digit(stringCharCodeAt(pat, 0))) || ((stringLen(pat) > 0) && (stringCharCodeAt(pat, 0) == 34))))) {
panic_at(src, k, ("unsupported match pattern: " + pat));
}
if ((pat == "_")) {
def = arm.v0;
} else {
cases = (cases + (((("case " + pat) + ": return ") + arm.v0) + ";\n"));
}
k = skip_ws(src, k);
if ((k < stringLen(src))) {
const ch = stringCharCodeAt(src, k);
if (((ch == 44) || (ch == 59))) {
k = (k + 1);
}
}
}
if ((def == "")) {
panic_at(src, k, "match requires _ arm");
}
return ParsedExpr((((((("(() => { switch (" + scrut.v0) + ") {\n") + cases) + "default: return ") + def) + ";\n} })()"), k);
}
export function parse_mut_opt(src, i) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "mut")) {
if (((j + 3) < stringLen(src))) {
const n = stringCharCodeAt(src, (j + 3));
if (is_ident_part(n)) {
return ParsedBool(false, i);
}
}
return ParsedBool(true, (j + 3));
}
return ParsedBool(false, i);
}
export function parse_stmt_block(src, i) {
let k = skip_ws(src, i);
if ((!((k < stringLen(src)) && (stringCharCodeAt(src, k) == 123)))) {
panic_at(src, k, "expected '{'");
}
k = (k + 1);
let body = "";
while (true) {
const t = skip_ws(src, k);
if ((!(t < stringLen(src)))) {
panic_at(src, t, "expected '}'");
}
if ((stringCharCodeAt(src, t) == 125)) {
return ParsedExpr(body, (t + 1));
}
const st = parse_stmt(src, k);
body = (body + st.v0);
k = st.v1;
}
return ParsedExpr(body, k);
}
export function parse_stmt(src, i) {
let k = skip_ws(src, i);
if (starts_with_at(src, k, "yield")) {
k = parse_keyword(src, k, "yield");
k = skip_ws(src, k);
if (((k < stringLen(src)) && (stringCharCodeAt(src, k) == 59))) {
return ParsedStmt("return;\n", (k + 1));
}
const e = parse_expr(src, k);
k = e.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((("return " + e.v0) + ";\n"), k);
}
if (starts_with_at(src, k, "let")) {
k = parse_keyword(src, k, "let");
const mutOpt = parse_mut_opt(src, k);
k = mutOpt.nextPos;
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (((t0 < stringLen(src)) && (stringCharCodeAt(src, t0) == 58))) {
const _ty = parse_type_expr(src, (t0 + 1));
k = _ty.v1;
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
const declKw = (mutOpt.ok ? "let" : "const");
return ParsedStmt((((((declKw + " ") + name.text) + " = ") + expr.v0) + ";\n"), k);
}
if (starts_with_at(src, k, "while")) {
k = parse_keyword(src, k, "while");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const body = parse_stmt_block(src, k);
k = body.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((("while (" + cond.v0) + ") {\n") + body.v0) + "}\n"), k);
}
if (starts_with_at(src, k, "if")) {
k = parse_keyword(src, k, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr(src, k);
k = cond.v1;
k = parse_keyword(src, k, ")");
const thenB = parse_stmt_block(src, k);
k = thenB.v1;
const j = skip_ws(src, k);
if (starts_with_at(src, j, "else")) {
k = parse_keyword(src, k, "else");
const elseB = parse_stmt_block(src, k);
k = elseB.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((((("if (" + cond.v0) + ") {\n") + thenB.v0) + "} else {\n") + elseB.v0) + "}\n"), k);
}
k = parse_optional_semicolon(src, k);
return ParsedStmt((((("if (" + cond.v0) + ") {\n") + thenB.v0) + "}\n"), k);
}
if (is_assign_stmt_start(src, k)) {
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((name.text + " = ") + expr.v0) + ";\n"), k);
}
if (is_field_assign_stmt_start(src, k)) {
const base = parse_ident(src, k);
k = base.nextPos;
let lhs = base.text;
while (true) {
const t = skip_ws(src, k);
if ((!((t < stringLen(src)) && (stringCharCodeAt(src, t) == 46)))) {
break;
}
k = parse_keyword(src, k, ".");
const part = parse_ident(src, k);
lhs = ((lhs + ".") + part.text);
k = part.nextPos;
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((lhs + " = ") + expr.v0) + ";\n"), k);
}
if (is_index_assign_stmt_start(src, k)) {
const name = parse_ident(src, k);
k = name.nextPos;
k = parse_keyword(src, k, "[");
const idx = parse_expr(src, k);
k = idx.v1;
k = parse_keyword(src, k, "]");
k = parse_keyword(src, k, "=");
const val = parse_expr(src, k);
k = val.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((((((("vec_set(" + name.text) + ", ") + idx.v0) + ", ") + val.v0) + ");\n"), k);
}
const e = parse_expr(src, k);
k = e.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt((e.v0 + ";\n"), k);
return panic_at(src, k, "expected statement");
}
export function is_index_assign_stmt_start(src, i) {
let j = skip_ws(src, i);
if ((!(j < stringLen(src)))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
return ((j < stringLen(src)) && (stringCharCodeAt(src, j) == 91));
}
export function is_assign_stmt_start(src, i) {
let j = skip_ws(src, i);
if ((!(j < stringLen(src)))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
if ((!((j < stringLen(src)) && (stringCharCodeAt(src, j) == 61)))) {
return false;
}
if (((j + 1) < stringLen(src))) {
const n = stringCharCodeAt(src, (j + 1));
if (((n == 61) || (n == 62))) {
return false;
}
}
return true;
}
export function is_field_assign_stmt_start(src, i) {
let j = skip_ws(src, i);
if ((!(j < stringLen(src)))) {
return false;
}
const c0 = stringCharCodeAt(src, j);
if ((!is_ident_start(c0))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
if ((!((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46)))) {
return false;
}
while (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 46))) {
j = (j + 1);
j = skip_ws(src, j);
if ((!(j < stringLen(src)))) {
return false;
}
const c1 = stringCharCodeAt(src, j);
if ((!is_ident_start(c1))) {
return false;
}
j = (j + 1);
while ((j < stringLen(src))) {
const c = stringCharCodeAt(src, j);
if ((!is_ident_part(c))) {
break;
}
j = (j + 1);
}
j = skip_ws(src, j);
}
if ((!((j < stringLen(src)) && (stringCharCodeAt(src, j) == 61)))) {
return false;
}
if (((j + 1) < stringLen(src))) {
const n = stringCharCodeAt(src, (j + 1));
if (((n == 61) || (n == 62))) {
return false;
}
}
return true;
}
export function parse_main_body(src, i) {
const j = skip_ws(src, i);
if (((j < stringLen(src)) && (stringCharCodeAt(src, j) == 123))) {
const b = parse_block_body(src, i);
return ParsedMain(b.body, b.expr, b.v1);
}
const e = parse_expr(src, i);
return ParsedMain("", e.v0, e.v1);
}
