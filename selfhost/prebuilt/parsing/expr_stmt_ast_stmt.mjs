// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len } from "../rt/vec.mjs";
import { panic_at } from "../util/diagnostics.mjs";
import { skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_ident, parse_keyword, parse_optional_semicolon } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { ParsedStmtAst } from "./expr_stmt_types.mjs";
import { parse_mut_opt_impl } from "./expr_stmt_helpers.mjs";
import { is_assign_stmt_start_impl, is_field_assign_stmt_start_impl, is_index_assign_stmt_start_impl } from "./expr_stmt_stmt_starts.mjs";
import { parse_stmt_block_ast, parse_main_body_ast_impl } from "./expr_stmt_ast_blocks.mjs";
import { parse_expr_ast_impl } from "./expr_stmt_ast_expr.mjs";
import { parse_type_param_names_list_ast } from "./expr_stmt_ast_primary.mjs";
import { is_identifier_too_short, warn_short_identifier } from "../util/diagnostics.mjs";
import { span, expr_span, expr_undefined, expr_ident, expr_lambda, expr_block, stmt_let, stmt_let_typed, stmt_assign, stmt_expr, stmt_yield, stmt_while, stmt_if, stmt_index_assign, stmt_field_assign } from "../ast.mjs";
export function parse_stmt_ast(src, i) {
let k = skip_ws(src, i);
const start = k;
if (starts_with_at(src, k, "yield")) {
k = parse_keyword(src, k, "yield");
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 59) {
return ParsedStmtAst(stmt_yield(span(start, k + 1), expr_undefined(span(k, k))), k + 1);
}
const e = parse_expr_ast_impl(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_yield(span(start, k), e.expr), k);
}
if (starts_with_at(src, k, "let")) {
k = parse_keyword(src, k, "let");
const mutOpt = parse_mut_opt_impl(src, k);
k = mutOpt.nextPos;
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
let tyAnn = "";
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 58) {
const _ty = parse_type_expr(src, t0 + 1);
tyAnn = _ty.v0;
k = _ty.v1;
}
k = parse_keyword(src, k, "=");
const e = parse_expr_ast_impl(src, k);
k = parse_optional_semicolon(src, e.nextPos);
if (tyAnn == "") {
return ParsedStmtAst(stmt_let(span(start, k), mutOpt.ok, name.text, e.expr), k);
}
return ParsedStmtAst(stmt_let_typed(span(start, k), mutOpt.ok, name.text, tyAnn, e.expr), k);
}
if (starts_with_at(src, k, "fn")) {
k = parse_keyword(src, k, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
let typeParams = vec_new();
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 60) {
const tp = parse_type_param_names_list_ast(src, t0);
typeParams = tp.typeParams;
k = tp.nextPos;
}
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
const params = vec_new();
const paramTyAnns = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
k = k + 1;
} else {
while (true) {
const p = parse_ident(src, k);
vec_push(params, p.text);
k = skip_ws(src, p.nextPos);
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
panic_at(src, k, "expected ')' in fn params");
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
panic_at(src, k, "expected ',' or ')' in fn params");
}
}
k = skip_ws(src, k);
let retTyAnn = "";
if (k < stringLen(src) && stringCharCodeAt(src, k) == 58) {
k = parse_keyword(src, k, ":");
const ret = parse_type_expr(src, k);
retTyAnn = ret.v0;
k = ret.v1;
}
k = parse_keyword(src, k, "=>");
const bodyStart = skip_ws(src, k);
const body = parse_main_body_ast_impl(src, k);
k = body.nextPos;
const bodyExpr = (vec_len(body.body) == 0 ? body.tail : expr_block(span(bodyStart, body.nextPos), body.body, body.tail));
const lam = expr_lambda(span(start, body.nextPos), typeParams, params, paramTyAnns, retTyAnn, bodyExpr);
k = parse_optional_semicolon(src, k);
return ParsedStmtAst(stmt_let(span(start, k), false, name.text, lam), k);
}
if (starts_with_at(src, k, "while")) {
k = parse_keyword(src, k, "while");
k = parse_keyword(src, k, "(");
const cond = parse_expr_ast_impl(src, k);
k = parse_keyword(src, cond.nextPos, ")");
const body = parse_stmt_block_ast(src, k);
k = parse_optional_semicolon(src, body.nextPos);
return ParsedStmtAst(stmt_while(span(start, k), cond.expr, body.stmts), k);
}
if (starts_with_at(src, k, "if")) {
k = parse_keyword(src, k, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr_ast_impl(src, k);
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
if (is_assign_stmt_start_impl(src, k)) {
const name = parse_ident(src, k);
k = parse_keyword(src, name.nextPos, "=");
const e = parse_expr_ast_impl(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_assign(span(start, k), name.text, e.expr), k);
}
if (is_field_assign_stmt_start_impl(src, k)) {
const base = parse_ident(src, k);
k = base.nextPos;
const fields = vec_new();
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src) && stringCharCodeAt(src, t) == 46)) {
break;
}
k = parse_keyword(src, k, ".");
const part = parse_ident(src, k);
vec_push(fields, part.text);
k = part.nextPos;
}
k = parse_keyword(src, k, "=");
const e = parse_expr_ast_impl(src, k);
k = parse_optional_semicolon(src, e.nextPos);
const baseExpr = expr_ident(span(base.startPos, base.nextPos), base.text);
return ParsedStmtAst(stmt_field_assign(span(start, k), baseExpr, fields, e.expr), k);
}
if (is_index_assign_stmt_start_impl(src, k)) {
const name = parse_ident(src, k);
k = parse_keyword(src, name.nextPos, "[");
const idx = parse_expr_ast_impl(src, k);
k = parse_keyword(src, idx.nextPos, "]");
k = parse_keyword(src, k, "=");
const val = parse_expr_ast_impl(src, k);
k = parse_optional_semicolon(src, val.nextPos);
const baseExpr = expr_ident(span(name.startPos, name.nextPos), name.text);
return ParsedStmtAst(stmt_index_assign(span(start, k), baseExpr, idx.expr, val.expr), k);
}
const e = parse_expr_ast_impl(src, k);
k = parse_optional_semicolon(src, e.nextPos);
return ParsedStmtAst(stmt_expr(span(start, k), e.expr), k);
}
