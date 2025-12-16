// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { panic_at, is_identifier_too_short, warn_short_identifier } from "../util/diagnostics.mjs";
import { skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_ident, parse_keyword, parse_optional_semicolon } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { ParsedExpr, ParsedMain, ParsedStmt } from "./expr_stmt_types.mjs";
import { parse_mut_opt_impl } from "./expr_stmt_helpers.mjs";
import { is_assign_stmt_start_impl, is_field_assign_stmt_start_impl, is_index_assign_stmt_start_impl } from "./expr_stmt_stmt_starts.mjs";
import { parse_expr } from "./expr_stmt_legacy_expr.mjs";
import { parse_block_body } from "./expr_stmt_legacy_primary.mjs";
export function parse_stmt_block(src, i) {
let k = skip_ws(src, i);
if (!(k < stringLen(src) && stringCharCodeAt(src, k) == 123)) {
panic_at(src, k, "expected '{'");
}
k = k + 1;
let body = "";
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src))) {
panic_at(src, t, "expected '}'");
}
if (stringCharCodeAt(src, t) == 125) {
return ParsedExpr(body, t + 1);
}
const st = parse_stmt(src, k);
body = body + st.v0;
k = st.v1;
}
return ParsedExpr(body, k);
}
export function parse_stmt(src, i) {
let k = skip_ws(src, i);
if (starts_with_at(src, k, "yield")) {
k = parse_keyword(src, k, "yield");
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 59) {
return ParsedStmt("return;\n", k + 1);
}
const e = parse_expr(src, k);
k = e.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt("return " + e.v0 + ";\n", k);
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
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 58) {
const _ty = parse_type_expr(src, t0 + 1);
k = _ty.v1;
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
const declKw = (mutOpt.ok ? "let" : "const");
return ParsedStmt(declKw + " " + name.text + " = " + expr.v0 + ";\n", k);
}
if (starts_with_at(src, k, "fn")) {
k = parse_keyword(src, k, "fn");
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
const t0 = skip_ws(src, k);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 60) {
let j = t0 + 1;
while (j < stringLen(src)) {
const ch = stringCharCodeAt(src, j);
if (ch == 62) {
k = j + 1;
j = stringLen(src);
} else {
j = j + 1;
}
}
}
k = parse_keyword(src, k, "(");
k = skip_ws(src, k);
let paramsCsv = "";
let first = true;
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
k = k + 1;
} else {
while (true) {
const p = parse_ident(src, k);
if (first) {
paramsCsv = paramsCsv + p.text;
first = false;
} else {
paramsCsv = paramsCsv + ", " + p.text;
}
k = skip_ws(src, p.nextPos);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 58) {
const _ty = parse_type_expr(src, k + 1);
k = _ty.v1;
}
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
if (k < stringLen(src) && stringCharCodeAt(src, k) == 58) {
const _rt = parse_type_expr(src, k + 1);
k = _rt.v1;
}
k = parse_keyword(src, k, "=>");
const body = parse_main_body(src, k);
k = body.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt("const " + name.text + " = (" + paramsCsv + ") => {\n" + body.body + "return " + body.expr + ";\n};\n", k);
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
return ParsedStmt("while (" + cond.v0 + ") {\n" + body.v0 + "}\n", k);
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
return ParsedStmt("if (" + cond.v0 + ") {\n" + thenB.v0 + "} else {\n" + elseB.v0 + "}\n", k);
}
k = parse_optional_semicolon(src, k);
return ParsedStmt("if (" + cond.v0 + ") {\n" + thenB.v0 + "}\n", k);
}
if (is_assign_stmt_start_impl(src, k)) {
const name = parse_ident(src, k);
k = name.nextPos;
if (is_identifier_too_short(name.text)) {
warn_short_identifier(src, name.startPos, name.text);
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt(name.text + " = " + expr.v0 + ";\n", k);
}
if (is_field_assign_stmt_start_impl(src, k)) {
const base = parse_ident(src, k);
k = base.nextPos;
let lhs = base.text;
while (true) {
const t = skip_ws(src, k);
if (!(t < stringLen(src) && stringCharCodeAt(src, t) == 46)) {
break;
}
k = parse_keyword(src, k, ".");
const part = parse_ident(src, k);
lhs = lhs + "." + part.text;
k = part.nextPos;
}
k = parse_keyword(src, k, "=");
const expr = parse_expr(src, k);
k = expr.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt(lhs + " = " + expr.v0 + ";\n", k);
}
if (is_index_assign_stmt_start_impl(src, k)) {
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
return ParsedStmt("vec_set(" + name.text + ", " + idx.v0 + ", " + val.v0 + ");\n", k);
}
const e = parse_expr(src, k);
k = e.v1;
k = parse_optional_semicolon(src, k);
return ParsedStmt(e.v0 + ";\n", k);
return panic_at(src, k, "expected statement");
}
export function parse_main_body(src, i) {
const j = skip_ws(src, i);
if (j < stringLen(src) && stringCharCodeAt(src, j) == 123) {
const b = parse_block_body(src, i);
return ParsedMain(b.body, b.expr, b.v1);
}
const e = parse_expr(src, i);
return ParsedMain("", e.v0, e.v1);
}
