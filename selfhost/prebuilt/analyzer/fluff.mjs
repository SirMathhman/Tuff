// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get } from "../rt/vec.mjs";
import { error_at, warn_at } from "../util/diagnostics.mjs";
let __fluff_unused_locals = 0;
let __fluff_unused_params = 0;
let __fluff_complexity = 0;
let __fluff_complexity_threshold = 15;
let __fluff_max_file_lines = 0;
let __fluff_max_file_lines_threshold = 500;
let __fluff_max_params = 0;
let __fluff_max_params_threshold = 3;
let __fluff_single_char_identifiers = 0;
let __fluff_missing_docs = 0;
export function fluff_set_options(unusedLocalsSeverity, unusedParamsSeverity) {
__fluff_unused_locals = unusedLocalsSeverity;
__fluff_unused_params = unusedParamsSeverity;
return undefined;
}
export function fluff_set_complexity_options(complexitySeverity, threshold) {
__fluff_complexity = complexitySeverity;
__fluff_complexity_threshold = (threshold > 0 ? threshold : 15);
return undefined;
}
export function fluff_set_file_size_options(severity, threshold) {
__fluff_max_file_lines = severity;
__fluff_max_file_lines_threshold = (threshold > 0 ? threshold : 500);
return undefined;
}
export function fluff_set_max_params_options(severity, threshold) {
__fluff_max_params = severity;
__fluff_max_params_threshold = (threshold > 0 ? threshold : 3);
return undefined;
}
export function fluff_set_single_char_identifiers_options(severity) {
__fluff_single_char_identifiers = severity;
return undefined;
}
export function fluff_set_missing_docs_options(severity) {
__fluff_missing_docs = severity;
return undefined;
}
export function fluff_emit_at(src, pos, severity, msg) {
if (severity == 1) {
warn_at(src, pos, msg);
return;
}
if (severity == 2) {
error_at(src, pos, msg);
return;
}
return undefined;
}
export function count_lines(src) {
if (stringLen(src) == 0) {
return 0;
}
let count = 0;
let i = 0;
while (i < stringLen(src)) {
if (stringCharCodeAt(src, i) == 10) {
count = count + 1;
}
i = i + 1;
}
if (stringCharCodeAt(src, stringLen(src) - 1) != 10) {
count = count + 1;
}
return count;
}
export function fluff_check_file_size(src) {
if (__fluff_max_file_lines == 0) {
return;
}
const lineCount = count_lines(src);
if (lineCount > __fluff_max_file_lines_threshold) {
const msg = "file has " + lineCount + " lines, exceeds limit of " + __fluff_max_file_lines_threshold;
fluff_emit_at(src, 0, __fluff_max_file_lines, msg);
}
return undefined;
}
export function binding_name_is_intentionally_unused(name) {
if (stringLen(name) > 0 && stringCharCodeAt(name, 0) == 95) {
return true;
}
return false;
}
export function fluff_warn_unused_locals_in_scope(src, scopes, depth) {
const severity = __fluff_unused_locals;
if (severity == 0) {
return;
}
const scope = vec_get(scopes, depth - 1);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (!b.read && !b.isParam && !binding_name_is_intentionally_unused(b.name)) {
fluff_emit_at(src, b.declPos, severity, "unused local: " + b.name);
}
bi = bi + 1;
}
return undefined;
}
export function fluff_warn_unused_params_in_scope(src, scopes, depth) {
const severity = __fluff_unused_params;
if (severity == 0) {
return;
}
const scope = vec_get(scopes, depth - 1);
let bi = 0;
while (bi < vec_len(scope)) {
const b = vec_get(scope, bi);
if (!b.read && b.isParam && !binding_name_is_intentionally_unused(b.name)) {
fluff_emit_at(src, b.declPos, severity, "unused parameter: " + b.name);
}
bi = bi + 1;
}
return undefined;
}
export function warn_unused_locals_in_scope(src, scopes, depth) {
return fluff_warn_unused_locals_in_scope(src, scopes, depth);
}
export function warn_unused_params_in_scope(src, scopes, depth) {
return fluff_warn_unused_params_in_scope(src, scopes, depth);
}
export function check_fn_complexity(src, pos, fnName, body, tail) {
return fluff_check_fn_complexity(src, pos, fnName, body, tail);
}
export function check_lambda_complexity(src, pos, name, body) {
return fluff_check_lambda_complexity(src, pos, name, body);
}
export function check_fn_max_params(src, pos, fnName, paramCount) {
return fluff_check_fn_max_params(src, pos, fnName, paramCount);
}
export function check_single_char_identifier(src, pos, name, kind) {
return fluff_check_single_char_identifier(src, pos, name, kind);
}
export function cc_expr(e) {
if ((e.tag === "EUndefined")) {
return 0;
}
if ((e.tag === "EInt")) {
return 0;
}
if ((e.tag === "EFloat")) {
return 0;
}
if ((e.tag === "EBool")) {
return 0;
}
if ((e.tag === "EString")) {
return 0;
}
if ((e.tag === "EIdent")) {
return 0;
}
if ((e.tag === "EPath")) {
return 0;
}
if ((e.tag === "ELambda")) {
return 0;
}
if ((e.tag === "EStructLit")) {
let cc = 0;
let i = 0;
while (i < vec_len(e.values)) {
cc = cc + cc_expr(vec_get(e.values, i));
i = i + 1;
}
return cc;
}
if ((e.tag === "EUnary")) {
return cc_expr(e.expr);
}
if ((e.tag === "EBinary")) {
let cc = cc_expr(e.left) + cc_expr(e.right);
if ((e.op.tag === "OpAnd") || (e.op.tag === "OpOr")) {
cc = cc + 1;
}
return cc;
}
if ((e.tag === "ECall")) {
let cc = cc_expr(e.callee);
let i = 0;
while (i < vec_len(e.args)) {
cc = cc + cc_expr(vec_get(e.args, i));
i = i + 1;
}
return cc;
}
if ((e.tag === "EIf")) {
const cc = 1 + cc_expr(e.cond) + cc_expr(e.thenExpr) + cc_expr(e.elseExpr);
return cc;
}
if ((e.tag === "EBlock")) {
let cc = cc_stmts(e.body);
cc = cc + cc_expr(e.tail);
return cc;
}
if ((e.tag === "EVecLit")) {
let cc = 0;
let i = 0;
while (i < vec_len(e.items)) {
cc = cc + cc_expr(vec_get(e.items, i));
i = i + 1;
}
return cc;
}
if ((e.tag === "ETupleLit")) {
let cc = 0;
let i = 0;
while (i < vec_len(e.items)) {
cc = cc + cc_expr(vec_get(e.items, i));
i = i + 1;
}
return cc;
}
if ((e.tag === "EIndex")) {
return cc_expr(e.base) + cc_expr(e.index);
}
if ((e.tag === "ETupleIndex")) {
return cc_expr(e.base);
}
if ((e.tag === "EField")) {
return cc_expr(e.base);
}
if ((e.tag === "EMatch")) {
let cc = cc_expr(e.scrut);
const armCount = vec_len(e.arms);
if (armCount > 1) {
cc = cc + armCount - 1;
}
let i = 0;
while (i < armCount) {
const arm = vec_get(e.arms, i);
cc = cc + cc_expr(arm.expr);
i = i + 1;
}
return cc;
}
return 0;
}
export function cc_stmt(s) {
if ((s.tag === "SLet")) {
return cc_expr(s.init);
}
if ((s.tag === "SAssign")) {
return cc_expr(s.value);
}
if ((s.tag === "SExpr")) {
return cc_expr(s.expr);
}
if ((s.tag === "SYield")) {
return cc_expr(s.expr);
}
if ((s.tag === "SWhile")) {
const cc = 1 + cc_expr(s.cond) + cc_stmts(s.body);
return cc;
}
if ((s.tag === "SIf")) {
let cc = 1 + cc_expr(s.cond) + cc_stmts(s.thenBody);
if (s.hasElse) {
cc = cc + cc_stmts(s.elseBody);
}
return cc;
}
if ((s.tag === "SIndexAssign")) {
return cc_expr(s.base) + cc_expr(s.index) + cc_expr(s.value);
}
if ((s.tag === "SFieldAssign")) {
return cc_expr(s.base) + cc_expr(s.value);
}
return 0;
}
export function cc_stmts(stmts) {
let cc = 0;
let i = 0;
while (i < vec_len(stmts)) {
cc = cc + cc_stmt(vec_get(stmts, i));
i = i + 1;
}
return cc;
}
export function fluff_check_fn_complexity(src, pos, fnName, body, tail) {
const severity = __fluff_complexity;
if (severity == 0) {
return;
}
const cc = 1 + cc_stmts(body) + cc_expr(tail);
const threshold = __fluff_complexity_threshold;
if (cc > threshold) {
const msg = "cyclomatic complexity of " + fnName + " is " + ("" + cc) + " (threshold: " + ("" + threshold) + ")";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
export function fluff_check_lambda_complexity(src, pos, name, body) {
const severity = __fluff_complexity;
if (severity == 0) {
return;
}
const cc = 1 + cc_expr(body);
const threshold = __fluff_complexity_threshold;
if (cc > threshold) {
const msg = "cyclomatic complexity of " + name + " is " + ("" + cc) + " (threshold: " + ("" + threshold) + ")";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
export function fluff_check_fn_max_params(src, pos, fnName, paramCount) {
const severity = __fluff_max_params;
if (severity == 0) {
return;
}
const threshold = __fluff_max_params_threshold;
if (paramCount > threshold) {
const msg = "function " + fnName + " has " + ("" + paramCount) + " parameters (threshold: " + ("" + threshold) + ")";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
export function fluff_check_single_char_identifier(src, pos, name, kind) {
const severity = __fluff_single_char_identifiers;
if (severity == 0) {
return;
}
if (binding_name_is_intentionally_unused(name)) {
return;
}
if (stringLen(name) == 1) {
const msg = kind + " name '" + name + "' is only a single character; use a more descriptive name";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
export function is_whitespace_char(ch) {
return ch == 32 || ch == 9 || ch == 10 || ch == 13;
}
export function has_doc_comment_before(src, pos) {
if (pos <= 0) {
return false;
}
let i = pos - 1;
while (i >= 0 && is_whitespace_char(stringCharCodeAt(src, i))) {
i = i - 1;
}
if (i < 0) {
return false;
}
if (i >= 1) {
const ch1 = stringCharCodeAt(src, i - 1);
const ch2 = stringCharCodeAt(src, i);
if (ch1 == 42 && ch2 == 47) {
return true;
}
}
let lineStart = i;
while (lineStart > 0 && stringCharCodeAt(src, lineStart - 1) != 10) {
lineStart = lineStart - 1;
}
let j = lineStart;
while (j <= i && is_whitespace_char(stringCharCodeAt(src, j))) {
j = j + 1;
}
if (j + 1 <= i) {
const ch1 = stringCharCodeAt(src, j);
const ch2 = stringCharCodeAt(src, j + 1);
if (ch1 == 47 && ch2 == 47) {
return true;
}
}
return false;
}
export function fluff_check_missing_docs(src, pos, name, kind, isExported) {
const severity = __fluff_missing_docs;
if (severity == 0) {
return;
}
if (!isExported) {
return;
}
if (name == "main") {
return;
}
if (!has_doc_comment_before(src, pos)) {
const msg = "missing documentation comment for exported " + kind + " '" + name + "'";
fluff_emit_at(src, pos, severity, msg);
}
return undefined;
}
