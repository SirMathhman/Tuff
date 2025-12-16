// compiled by selfhost tuffc
import { panic, stringLen, stringSlice, stringCharCodeAt, stringFromCharCode } from "../rt/stdlib.mjs";
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { panic_at, panic_at_help } from "../util/diagnostics.mjs";
import { is_digit, is_ident_start, is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { ParsedIdent, parse_ident, parse_keyword, parse_number } from "./primitives.mjs";
import { parse_type_expr } from "./types.mjs";
import { ParsedExprAst, ParsedExprListAst, ParsedTypeParamsForLambdaAst } from "./expr_stmt_types.mjs";
import { parse_expr_ast_impl } from "./expr_stmt_ast_expr.mjs";
import { parse_block_expr_ast } from "./expr_stmt_ast_blocks.mjs";
import { find_matching_rparen, parse_lambda_expr_ast, parse_type_param_names_list_ast } from "./expr_stmt_ast_lambda.mjs";
import { span, span_start, expr_span, expr_int, expr_float, expr_string, expr_ident, expr_path, expr_lambda, expr_struct_lit, expr_vec_lit, expr_tuple_lit, expr_if, expr_match, mk_match_arm, pat_wildcard, pat_int, pat_bool, pat_string, pat_variant } from "../ast.mjs";
export function parse_string_lit_value(src, startQuote) {
let k = startQuote + 1;
let out = "";
while (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 34) {
return ParsedIdent(out, startQuote, k + 1);
}
if (ch == 92) {
k = k + 1;
if (!(k < stringLen(src))) {
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
out = out + stringFromCharCode(code);
k = k + 1;
continue;
}
out = out + stringFromCharCode(ch);
k = k + 1;
}
return panic_at(src, startQuote, "unterminated string");
}
export function parse_vec_lit_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "[");
k = skip_ws(src, k);
const items = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 93) {
return ParsedExprAst(expr_vec_lit(span(start, k + 1), items), k + 1);
}
while (true) {
const e = parse_expr_ast_impl(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ']' in vec literal");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
continue;
}
if (ch == 93) {
return ParsedExprAst(expr_vec_lit(span(start, k + 1), items), k + 1);
}
panic_at(src, k, "expected ',' or ']' in vec literal");
}
return ParsedExprAst(expr_vec_lit(span(start, k), items), k);
}
export function parse_struct_lit_values_ast(src, i) {
let k = skip_ws(src, i);
k = parse_keyword(src, k, "{");
k = skip_ws(src, k);
const items = vec_new();
if (k < stringLen(src) && stringCharCodeAt(src, k) == 125) {
return ParsedExprListAst(items, k + 1);
}
while (true) {
const e = parse_expr_ast_impl(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ',' or '}' in struct literal");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
k = k + 1;
continue;
}
if (ch == 125) {
return ParsedExprListAst(items, k + 1);
}
panic_at(src, k, "expected ',' or '}' in struct literal");
}
return ParsedExprListAst(items, k);
}
export function parse_if_expr_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "if");
k = parse_keyword(src, k, "(");
const cond = parse_expr_ast_impl(src, k);
k = cond.nextPos;
k = parse_keyword(src, k, ")");
const t1 = skip_ws(src, k);
const thenE = (t1 < stringLen(src) && stringCharCodeAt(src, t1) == 123 ? parse_block_expr_ast(src, k) : parse_expr_ast_impl(src, k));
k = thenE.nextPos;
k = parse_keyword(src, k, "else");
const t2 = skip_ws(src, k);
const elseE = (t2 < stringLen(src) && stringCharCodeAt(src, t2) == 123 ? parse_block_expr_ast(src, k) : parse_expr_ast_impl(src, k));
return ParsedExprAst(expr_if(span(start, elseE.nextPos), cond.expr, thenE.expr, elseE.expr), elseE.nextPos);
}
export function parse_match_expr_ast(src, i) {
const start = skip_ws(src, i);
let k = parse_keyword(src, start, "match");
k = parse_keyword(src, k, "(");
const scrut = parse_expr_ast_impl(src, k);
k = scrut.nextPos;
k = parse_keyword(src, k, ")");
k = parse_keyword(src, k, "{");
const arms = vec_new();
let sawDefault = false;
let sawVariant = false;
while (true) {
k = skip_ws(src, k);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected '}'");
}
if (stringCharCodeAt(src, k) == 125) {
k = k + 1;
break;
}
const patStart = k;
const c0 = stringCharCodeAt(src, k);
let pat = pat_wildcard(span(patStart, patStart));
if (c0 == 34) {
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
let name = id.text;
while (true) {
const t = skip_ws(src, k);
if (!(t + 1 < stringLen(src))) {
break;
}
if (!(stringCharCodeAt(src, t) == 58 && stringCharCodeAt(src, t + 1) == 58)) {
break;
}
const next = parse_ident(src, t + 2);
name = next.text;
k = next.nextPos;
}
if (id.text == "_") {
pat = pat_wildcard(span(patStart, k));
} else {
if (id.text == "true") {
pat = pat_bool(span(patStart, k), true);
} else {
if (id.text == "false") {
pat = pat_bool(span(patStart, k), false);
} else {
pat = pat_variant(span(patStart, k), name);
sawVariant = true;
}
}
}
}
}
k = parse_keyword(src, k, "=>");
const t = skip_ws(src, k);
const armE = (t < stringLen(src) && stringCharCodeAt(src, t) == 123 ? parse_block_expr_ast(src, k) : parse_expr_ast_impl(src, k));
k = armE.nextPos;
if (pat.tag == "MPWildcard") {
sawDefault = true;
}
vec_push(arms, mk_match_arm(span(patStart, armE.nextPos), pat, armE.expr));
k = skip_ws(src, k);
if (k < stringLen(src)) {
const ch = stringCharCodeAt(src, k);
if (ch == 44 || ch == 59) {
k = k + 1;
}
}
}
if (!sawDefault && !sawVariant) {
panic_at(src, k, "match requires _ arm");
}
return ParsedExprAst(expr_match(span(start, k), scrut.expr, arms), k);
}
export function parse_primary_ast(src, i) {
const j = skip_ws(src, i);
if (!(j < stringLen(src))) {
panic_at(src, j, "expected expression");
}
const c = stringCharCodeAt(src, j);
if (starts_with_at(src, j, "if")) {
return parse_if_expr_ast(src, j);
}
if (starts_with_at(src, j, "match")) {
return parse_match_expr_ast(src, j);
}
if (c == 91) {
return parse_vec_lit_ast(src, j);
}
if (c == 123) {
return parse_block_expr_ast(src, j);
}
if (c == 39) {
const start = j;
let k = j + 1;
if (!(k < stringLen(src))) {
panic_at(src, start, "unterminated char literal");
}
let code = 0;
const ch0 = stringCharCodeAt(src, k);
if (ch0 == 92) {
k = k + 1;
if (!(k < stringLen(src))) {
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
k = k + 1;
} else {
code = ch0;
k = k + 1;
}
if (!(k < stringLen(src))) {
panic_at(src, start, "unterminated char literal");
}
if (stringCharCodeAt(src, k) != 39) {
panic_at(src, start, "char literal must contain exactly one character");
}
return ParsedExprAst(expr_int(span(start, k + 1), code), k + 1);
}
if (c == 34) {
const lit = parse_string_lit_value(src, j);
return ParsedExprAst(expr_string(span(j, lit.nextPos), lit.text), lit.nextPos);
}
if (c == 40) {
const rp = find_matching_rparen(src, j);
if (rp != -1) {
const after = skip_ws(src, rp + 1);
if (after + 1 < stringLen(src) && stringCharCodeAt(src, after) == 61 && stringCharCodeAt(src, after + 1) == 62) {
return parse_lambda_expr_ast(src, j);
}
if (after < stringLen(src) && stringCharCodeAt(src, after) == 58) {
return parse_lambda_expr_ast(src, j);
}
}
const first = parse_expr_ast_impl(src, j + 1);
let k = skip_ws(src, first.nextPos);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedExprAst(first.expr, k + 1);
}
if (k < stringLen(src) && stringCharCodeAt(src, k) == 44) {
const items = vec_new();
vec_push(items, first.expr);
while (true) {
k = k + 1;
k = skip_ws(src, k);
if (k < stringLen(src) && stringCharCodeAt(src, k) == 41) {
return ParsedExprAst(expr_tuple_lit(span(j, k + 1), items), k + 1);
}
const e = parse_expr_ast_impl(src, k);
vec_push(items, e.expr);
k = skip_ws(src, e.nextPos);
if (!(k < stringLen(src))) {
panic_at(src, k, "expected ')' in tuple literal");
}
const ch = stringCharCodeAt(src, k);
if (ch == 44) {
continue;
}
if (ch == 41) {
return ParsedExprAst(expr_tuple_lit(span(j, k + 1), items), k + 1);
}
panic_at(src, k, "expected ',' or ')' in tuple literal");
}
}
panic_at_help(src, k, "expected ')'", "Add ')' to close the opening '('.");
}
if (is_digit(c)) {
let k = j;
while (k < stringLen(src) && is_digit(stringCharCodeAt(src, k))) {
k = k + 1;
}
if (k + 1 < stringLen(src) && stringCharCodeAt(src, k) == 46 && is_digit(stringCharCodeAt(src, k + 1))) {
let m = k + 1;
while (m < stringLen(src) && is_digit(stringCharCodeAt(src, m))) {
m = m + 1;
}
const text = stringSlice(src, j, m);
let suffix = "";
let endPos = m;
if (m + 2 < stringLen(src)) {
const s1 = stringSlice(src, m, m + 3);
if (s1 == "F32") {
suffix = "F32";
endPos = m + 3;
} else {
if (s1 == "F64") {
suffix = "F64";
endPos = m + 3;
}
}
}
return ParsedExprAst(expr_float(span(j, endPos), text, suffix), endPos);
}
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
if (!(t + 1 < stringLen(src))) {
break;
}
if (!(stringCharCodeAt(src, t) == 58 && stringCharCodeAt(src, t + 1) == 58)) {
break;
}
const next = parse_ident(src, t + 2);
vec_push(parts, next.text);
k = next.nextPos;
}
const t2 = skip_ws(src, k);
if (t2 < stringLen(src) && stringCharCodeAt(src, t2) == 123) {
const vals = parse_struct_lit_values_ast(src, t2);
const nameExpr = expr_path(span(j, k), parts);
return ParsedExprAst(expr_struct_lit(span(j, vals.nextPos), nameExpr, vals.items), vals.nextPos);
}
if (vec_len(parts) == 1) {
return ParsedExprAst(expr_ident(span(j, k), vec_get(parts, 0)), k);
}
return ParsedExprAst(expr_path(span(j, k), parts), k);
}
let end = j + 32;
if (end > stringLen(src)) {
end = stringLen(src);
}
return panic_at(src, j, "expected expression near '" + stringSlice(src, j, end) + "'");
}
