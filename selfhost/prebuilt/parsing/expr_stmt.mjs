// compiled by selfhost tuffc
import { ParsedBool } from "./primitives.mjs";
import { ParsedExpr, ParsedMain, ParsedStmt, ParsedParams, ParsedExprAst, ParsedMainAst } from "./expr_stmt_types.mjs";
import { parse_expr_ast_impl } from "./expr_stmt_ast_expr.mjs";
import { parse_main_body_ast_impl } from "./expr_stmt_ast_blocks.mjs";
import { parse_expr_impl, parse_stmt_impl, parse_main_body_impl } from "./expr_stmt_legacy_facade.mjs";
import { parse_mut_opt_impl } from "./expr_stmt_helpers.mjs";
import { is_assign_stmt_start_impl, is_field_assign_stmt_start_impl, is_index_assign_stmt_start_impl } from "./expr_stmt_stmt_starts.mjs";
export function parse_expr(src, i) {
return parse_expr_impl(src, i);
}
export function parse_stmt(src, i) {
return parse_stmt_impl(src, i);
}
export function parse_main_body(src, i) {
return parse_main_body_impl(src, i);
}
export function parse_expr_ast(src, i) {
return parse_expr_ast_impl(src, i);
}
export function parse_main_body_ast(src, i) {
return parse_main_body_ast_impl(src, i);
}
export function parse_mut_opt(src, i) {
return parse_mut_opt_impl(src, i);
}
export function is_assign_stmt_start(src, i) {
return is_assign_stmt_start_impl(src, i);
}
export function is_field_assign_stmt_start(src, i) {
return is_field_assign_stmt_start_impl(src, i);
}
export function is_index_assign_stmt_start(src, i) {
return is_index_assign_stmt_start_impl(src, i);
}
