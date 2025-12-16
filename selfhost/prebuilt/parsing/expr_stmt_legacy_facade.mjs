// compiled by selfhost tuffc
import { ParsedExpr, ParsedMain, ParsedStmt } from "./expr_stmt_types.mjs";
import { parse_expr } from "./expr_stmt_legacy_expr.mjs";
import { parse_stmt, parse_main_body } from "./expr_stmt_legacy_stmt.mjs";
export function parse_expr_impl(src, i) {
return parse_expr(src, i);
}
export function parse_stmt_impl(src, i) {
return parse_stmt(src, i);
}
export function parse_main_body_impl(src, i) {
return parse_main_body(src, i);
}
