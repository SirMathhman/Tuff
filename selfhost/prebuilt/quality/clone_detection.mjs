// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_push, vec_get, vec_set } from "../rt/vec.mjs";
import { warn_at } from "../util/diagnostics.mjs";
import { span_start, span_end } from "../ast.mjs";
let __clone_detection_enabled = 0;
let __clone_min_tokens = 10;
let __clone_min_occurrences = 2;
let __clone_parameterized_enabled = true;
export function set_clone_detection_options(severity, minTokens, minOccurrences) {
__clone_detection_enabled = severity;
__clone_min_tokens = (minTokens > 0 ? minTokens : 10);
__clone_min_occurrences = (minOccurrences > 0 ? minOccurrences : 2);
return undefined;
}
export function set_clone_parameterized_enabled(enabled) {
__clone_parameterized_enabled = enabled;
return undefined;
}
export function IRToken(kind, spanStart, spanEnd) {
return { kind: kind, spanStart: spanStart, spanEnd: spanEnd };
}
export function ir_token(kind, spanStart, spanEnd) {
return IRToken(kind, spanStart, spanEnd);
}
export function serialize_binop(op) {
if ((op.tag === "OpAdd")) {
return "op_add";
}
if ((op.tag === "OpSub")) {
return "op_sub";
}
if ((op.tag === "OpMul")) {
return "op_mul";
}
if ((op.tag === "OpDiv")) {
return "op_div";
}
if ((op.tag === "OpEq")) {
return "op_eq";
}
if ((op.tag === "OpNe")) {
return "op_ne";
}
if ((op.tag === "OpLt")) {
return "op_lt";
}
if ((op.tag === "OpLe")) {
return "op_le";
}
if ((op.tag === "OpGt")) {
return "op_gt";
}
if ((op.tag === "OpGe")) {
return "op_ge";
}
if ((op.tag === "OpAnd")) {
return "op_and";
}
if ((op.tag === "OpOr")) {
return "op_or";
}
return "op_unknown";
}
export function serialize_unop(op) {
if ((op.tag === "OpNot")) {
return "op_not";
}
if ((op.tag === "OpNeg")) {
return "op_neg";
}
return "op_unknown";
}
export function serialize_expr(e, tokens) {
const start = span_start(e.span);
const end = span_end(e.span);
if ((e.tag === "EUndefined")) {
vec_push(tokens, ir_token("expr_undefined", start, end));
return;
}
if ((e.tag === "EInt")) {
vec_push(tokens, ir_token("expr_int", start, end));
return;
}
if ((e.tag === "EFloat")) {
vec_push(tokens, ir_token("expr_float", start, end));
return;
}
if ((e.tag === "EBool")) {
vec_push(tokens, ir_token("expr_bool", start, end));
return;
}
if ((e.tag === "EString")) {
vec_push(tokens, ir_token("expr_string", start, end));
return;
}
if ((e.tag === "EIdent")) {
vec_push(tokens, ir_token("expr_ident", start, end));
return;
}
if ((e.tag === "EPath")) {
vec_push(tokens, ir_token("expr_path", start, end));
return;
}
if ((e.tag === "EUnary")) {
vec_push(tokens, ir_token("expr_unary", start, end));
vec_push(tokens, ir_token(serialize_unop(e.op), start, end));
serialize_expr(e.expr, tokens);
return;
}
if ((e.tag === "EBinary")) {
vec_push(tokens, ir_token("expr_binary", start, end));
vec_push(tokens, ir_token(serialize_binop(e.op), start, end));
serialize_expr(e.left, tokens);
serialize_expr(e.right, tokens);
return;
}
if ((e.tag === "ECall")) {
vec_push(tokens, ir_token("expr_call", start, end));
serialize_expr(e.callee, tokens);
let i = 0;
while (i < vec_len(e.args)) {
serialize_expr(vec_get(e.args, i), tokens);
i = i + 1;
}
vec_push(tokens, ir_token("expr_call_end", start, end));
return;
}
if ((e.tag === "EIf")) {
vec_push(tokens, ir_token("expr_if", start, end));
serialize_expr(e.cond, tokens);
serialize_expr(e.thenExpr, tokens);
serialize_expr(e.elseExpr, tokens);
vec_push(tokens, ir_token("expr_if_end", start, end));
return;
}
if ((e.tag === "EBlock")) {
vec_push(tokens, ir_token("expr_block", start, end));
serialize_stmts(e.body, tokens);
serialize_expr(e.tail, tokens);
vec_push(tokens, ir_token("expr_block_end", start, end));
return;
}
if ((e.tag === "EVecLit")) {
vec_push(tokens, ir_token("expr_vec", start, end));
let i = 0;
while (i < vec_len(e.items)) {
serialize_expr(vec_get(e.items, i), tokens);
i = i + 1;
}
vec_push(tokens, ir_token("expr_vec_end", start, end));
return;
}
if ((e.tag === "ETupleLit")) {
vec_push(tokens, ir_token("expr_tuple", start, end));
let i = 0;
while (i < vec_len(e.items)) {
serialize_expr(vec_get(e.items, i), tokens);
i = i + 1;
}
vec_push(tokens, ir_token("expr_tuple_end", start, end));
return;
}
if ((e.tag === "EIndex")) {
vec_push(tokens, ir_token("expr_index", start, end));
serialize_expr(e.base, tokens);
serialize_expr(e.index, tokens);
return;
}
if ((e.tag === "ETupleIndex")) {
vec_push(tokens, ir_token("expr_tuple_index", start, end));
serialize_expr(e.base, tokens);
return;
}
if ((e.tag === "EField")) {
vec_push(tokens, ir_token("expr_field", start, end));
serialize_expr(e.base, tokens);
return;
}
if ((e.tag === "EMatch")) {
vec_push(tokens, ir_token("expr_match", start, end));
serialize_expr(e.scrut, tokens);
let i = 0;
while (i < vec_len(e.arms)) {
const arm = vec_get(e.arms, i);
vec_push(tokens, ir_token("match_arm", span_start(arm.span), span_end(arm.span)));
serialize_expr(arm.expr, tokens);
i = i + 1;
}
vec_push(tokens, ir_token("expr_match_end", start, end));
return;
}
if ((e.tag === "EIsType")) {
vec_push(tokens, ir_token("expr_is_type", start, end));
serialize_expr(e.expr, tokens);
return;
}
if ((e.tag === "ELambda")) {
vec_push(tokens, ir_token("expr_lambda", start, end));
serialize_expr(e.body, tokens);
vec_push(tokens, ir_token("expr_lambda_end", start, end));
return;
}
if ((e.tag === "EStructLit")) {
vec_push(tokens, ir_token("expr_struct", start, end));
let i = 0;
while (i < vec_len(e.values)) {
serialize_expr(vec_get(e.values, i), tokens);
i = i + 1;
}
vec_push(tokens, ir_token("expr_struct_end", start, end));
return;
}
vec_push(tokens, ir_token("expr_unknown", start, end));
return undefined;
}
export function serialize_stmt(s, tokens) {
const start = span_start(s.span);
const end = span_end(s.span);
if ((s.tag === "SLet")) {
vec_push(tokens, ir_token((s.isMut ? "stmt_let_mut" : "stmt_let"), start, end));
serialize_expr(s.init, tokens);
return;
}
if ((s.tag === "SAssign")) {
vec_push(tokens, ir_token("stmt_assign", start, end));
serialize_expr(s.value, tokens);
return;
}
if ((s.tag === "SExpr")) {
vec_push(tokens, ir_token("stmt_expr", start, end));
serialize_expr(s.expr, tokens);
return;
}
if ((s.tag === "SYield")) {
vec_push(tokens, ir_token("stmt_yield", start, end));
serialize_expr(s.expr, tokens);
return;
}
if ((s.tag === "SWhile")) {
vec_push(tokens, ir_token("stmt_while", start, end));
serialize_expr(s.cond, tokens);
serialize_stmts(s.body, tokens);
vec_push(tokens, ir_token("stmt_while_end", start, end));
return;
}
if ((s.tag === "SIf")) {
vec_push(tokens, ir_token("stmt_if", start, end));
serialize_expr(s.cond, tokens);
serialize_stmts(s.thenBody, tokens);
if (s.hasElse) {
vec_push(tokens, ir_token("stmt_else", start, end));
serialize_stmts(s.elseBody, tokens);
}
vec_push(tokens, ir_token("stmt_if_end", start, end));
return;
}
if ((s.tag === "SIndexAssign")) {
vec_push(tokens, ir_token("stmt_index_assign", start, end));
serialize_expr(s.base, tokens);
serialize_expr(s.index, tokens);
serialize_expr(s.value, tokens);
return;
}
if ((s.tag === "SFieldAssign")) {
vec_push(tokens, ir_token("stmt_field_assign", start, end));
serialize_expr(s.base, tokens);
serialize_expr(s.value, tokens);
return;
}
vec_push(tokens, ir_token("stmt_unknown", start, end));
return undefined;
}
export function serialize_stmts(stmts, tokens) {
let i = 0;
while (i < vec_len(stmts)) {
serialize_stmt(vec_get(stmts, i), tokens);
i = i + 1;
}
return undefined;
}
export function serialize_fn_body(body, tail, tokens) {
serialize_stmts(body, tokens);
serialize_expr(tail, tokens);
return undefined;
}
export function CloneOccurrence(startTokenIdx, endTokenIdx, spanStart, spanEnd) {
return { startTokenIdx: startTokenIdx, endTokenIdx: endTokenIdx, spanStart: spanStart, spanEnd: spanEnd };
}
export function CloneGroup(signature, tokenCount, occurrences) {
return { signature: signature, tokenCount: tokenCount, occurrences: occurrences };
}
export function hash_string(s) {
let hash = 0;
let i = 0;
while (i < stringLen(s)) {
hash = hash * 31 + stringCharCodeAt(s, i);
if (hash > 100000000) {
hash = hash - 100000000;
}
i = i + 1;
}
return hash;
}
export function compute_sequence_signature(tokens, start, len) {
let sig = "";
let i = 0;
while (i < len && start + i < vec_len(tokens)) {
const t = vec_get(tokens, start + i);
sig = sig + t.kind + ";";
i = i + 1;
}
return sig;
}
export function find_clone_group_by_signature(groups, sig) {
let i = 0;
while (i < vec_len(groups)) {
const g = vec_get(groups, i);
if (g.signature == sig) {
return i;
}
i = i + 1;
}
return -1;
}
export function occurrences_overlap(o1, o2) {
if (o1.spanEnd <= o2.spanStart) {
return false;
}
if (o2.spanEnd <= o1.spanStart) {
return false;
}
return true;
}
export function group_has_overlapping_occurrence(group, occ) {
let i = 0;
while (i < vec_len(group.occurrences)) {
const existing = vec_get(group.occurrences, i);
if (occurrences_overlap(existing, occ)) {
return true;
}
i = i + 1;
}
return false;
}
export function find_clones(tokens, minTokens) {
const groups = vec_new();
const tokenLen = vec_len(tokens);
if (tokenLen < minTokens) {
return groups;
}
const maxWindowSize = tokenLen ?? 2;
let windowSize = minTokens;
while (windowSize <= maxWindowSize) {
let i = 0;
while (i + windowSize <= tokenLen) {
const sig = compute_sequence_signature(tokens, i, windowSize);
const startToken = vec_get(tokens, i);
const endToken = vec_get(tokens, i + windowSize - 1);
const occ = CloneOccurrence(i, i + windowSize, startToken.spanStart, endToken.spanEnd);
const groupIdx = find_clone_group_by_signature(groups, sig);
if (groupIdx >= 0) {
const existingGroup = vec_get(groups, groupIdx);
if (!group_has_overlapping_occurrence(existingGroup, occ)) {
vec_push(existingGroup.occurrences, occ);
}
} else {
const newOccs = vec_new();
vec_push(newOccs, occ);
vec_push(groups, CloneGroup(sig, windowSize, newOccs));
}
i = i + 1;
}
windowSize = windowSize + 1;
}
const filtered = vec_new();
let gi = 0;
while (gi < vec_len(groups)) {
const g = vec_get(groups, gi);
if (vec_len(g.occurrences) >= __clone_min_occurrences) {
vec_push(filtered, g);
}
gi = gi + 1;
}
return filtered;
}
export function extend_clone_maximal(tokens, groups) {
const extended = vec_new();
let gi = 0;
while (gi < vec_len(groups)) {
const group = vec_get(groups, gi);
if (vec_len(group.occurrences) < 2) {
gi = gi + 1;
continue;
}
let canExtendForward = true;
while (canExtendForward) {
const firstOcc = vec_get(group.occurrences, 0);
const nextIdx = firstOcc.endTokenIdx;
if (nextIdx >= vec_len(tokens)) {
canExtendForward = false;
continue;
}
const expectedKind = vec_get(tokens, nextIdx).kind;
let allMatch = true;
let oi = 1;
while (oi < vec_len(group.occurrences)) {
const occ = vec_get(group.occurrences, oi);
if (occ.endTokenIdx >= vec_len(tokens)) {
allMatch = false;
break;
}
const actualKind = vec_get(tokens, occ.endTokenIdx).kind;
if (actualKind != expectedKind) {
allMatch = false;
break;
}
oi = oi + 1;
}
if (allMatch) {
let oi2 = 0;
while (oi2 < vec_len(group.occurrences)) {
const occ = vec_get(group.occurrences, oi2);
const newEnd = occ.endTokenIdx + 1;
const newSpanEnd = vec_get(tokens, newEnd - 1).spanEnd;
vec_set(group.occurrences, oi2, CloneOccurrence(occ.startTokenIdx, newEnd, occ.spanStart, newSpanEnd));
oi2 = oi2 + 1;
}
} else {
canExtendForward = false;
}
}
const firstOcc = vec_get(group.occurrences, 0);
const newTokenCount = firstOcc.endTokenIdx - firstOcc.startTokenIdx;
vec_push(extended, CloneGroup(group.signature, newTokenCount, group.occurrences));
gi = gi + 1;
}
return extended;
}
export function ParameterPosition(tokenOffset, variations) {
return { tokenOffset: tokenOffset, variations: variations };
}
export function ParameterizedClone(baseSignature, tokenCount, parameters, occurrences) {
return { baseSignature: baseSignature, tokenCount: tokenCount, parameters: parameters, occurrences: occurrences };
}
export function tokens_differ_only_in_values(tokens, occ1, occ2) {
const diffPositions = vec_new();
const len1 = occ1.endTokenIdx - occ1.startTokenIdx;
const len2 = occ2.endTokenIdx - occ2.startTokenIdx;
if (len1 != len2) {
return diffPositions;
}
let i = 0;
while (i < len1) {
const t1 = vec_get(tokens, occ1.startTokenIdx + i);
const t2 = vec_get(tokens, occ2.startTokenIdx + i);
if (t1.kind != t2.kind) {
if (t1.kind == "expr_ident" || t1.kind == "expr_int" || t1.kind == "expr_string" || t1.kind == "expr_bool" || t1.kind == "expr_float") {
if (t1.kind == t2.kind) {
vec_push(diffPositions, i);
} else {
return vec_new();
}
} else {
return vec_new();
}
}
i = i + 1;
}
return diffPositions;
}
export function find_parameterized_clones(tokens, exactClones, minTokens) {
if (!__clone_parameterized_enabled) {
return vec_new();
}
const paramClones = vec_new();
const tokenLen = vec_len(tokens);
const maxWindowSize = tokenLen ?? 2;
let windowSize = minTokens;
while (windowSize <= maxWindowSize) {
const structureGroups = vec_new();
let i = 0;
while (i + windowSize <= tokenLen) {
let structSig = "";
let j = 0;
while (j < windowSize) {
const t = vec_get(tokens, i + j);
const kind = t.kind;
const normKind = (kind == "expr_ident" ? "PARAM" : (kind == "expr_int" ? "PARAM" : (kind == "expr_string" ? "PARAM" : (kind == "expr_float" ? "PARAM" : (kind == "expr_bool" ? "PARAM" : kind)))));
structSig = structSig + normKind + ";";
j = j + 1;
}
const startToken = vec_get(tokens, i);
const endToken = vec_get(tokens, i + windowSize - 1);
const occ = CloneOccurrence(i, i + windowSize, startToken.spanStart, endToken.spanEnd);
const groupIdx = find_clone_group_by_signature(structureGroups, structSig);
if (groupIdx >= 0) {
const existingGroup = vec_get(structureGroups, groupIdx);
if (!group_has_overlapping_occurrence(existingGroup, occ)) {
vec_push(existingGroup.occurrences, occ);
}
} else {
const newOccs = vec_new();
vec_push(newOccs, occ);
vec_push(structureGroups, CloneGroup(structSig, windowSize, newOccs));
}
i = i + 1;
}
let gi = 0;
while (gi < vec_len(structureGroups)) {
const g = vec_get(structureGroups, gi);
if (vec_len(g.occurrences) >= __clone_min_occurrences) {
const firstOcc = vec_get(g.occurrences, 0);
const exactSig = compute_sequence_signature(tokens, firstOcc.startTokenIdx, g.tokenCount);
const isExact = find_clone_group_by_signature(exactClones, exactSig) >= 0;
if (!isExact) {
const params = vec_new();
vec_push(paramClones, ParameterizedClone(g.signature, g.tokenCount, params, g.occurrences));
}
}
gi = gi + 1;
}
windowSize = windowSize + 1;
}
return paramClones;
}
export function emit_clone_warning(src, severity, pos, msg) {
if (severity == 1) {
warn_at(src, pos, msg);
return;
}
if (severity == 2) {
warn_at(src, pos, msg);
return;
}
return undefined;
}
export function report_clones(src, exactClones, paramClones) {
if (__clone_detection_enabled == 0) {
return;
}
let gi = 0;
while (gi < vec_len(exactClones)) {
const g = vec_get(exactClones, gi);
const occCount = vec_len(g.occurrences);
if (occCount >= __clone_min_occurrences && g.tokenCount >= __clone_min_tokens) {
const firstOcc = vec_get(g.occurrences, 0);
const msg = "code clone detected: " + ("" + g.tokenCount) + " IR tokens duplicated " + ("" + occCount) + " times; consider extracting to a function";
emit_clone_warning(src, __clone_detection_enabled, firstOcc.spanStart, msg);
}
gi = gi + 1;
}
let pi = 0;
while (pi < vec_len(paramClones)) {
const p = vec_get(paramClones, pi);
const occCount = vec_len(p.occurrences);
if (occCount >= __clone_min_occurrences && p.tokenCount >= __clone_min_tokens) {
const firstOcc = vec_get(p.occurrences, 0);
const msg = "parameterized clone detected: " + ("" + p.tokenCount) + " IR tokens with variations, appears " + ("" + occCount) + " times; consider extracting to a parameterized function";
emit_clone_warning(src, __clone_detection_enabled, firstOcc.spanStart, msg);
}
pi = pi + 1;
}
return undefined;
}
export function analyze_fn_for_clones(src, fnName, body, tail) {
if (__clone_detection_enabled == 0) {
return;
}
const tokens = vec_new();
serialize_fn_body(body, tail, tokens);
if (vec_len(tokens) < __clone_min_tokens * 2) {
return;
}
const exactClones = find_clones(tokens, __clone_min_tokens);
const extendedClones = extend_clone_maximal(tokens, exactClones);
const paramClones = find_parameterized_clones(tokens, extendedClones, __clone_min_tokens);
report_clones(src, extendedClones, paramClones);
return undefined;
}
export function analyze_program_for_clones(src, decls) {
if (__clone_detection_enabled == 0) {
return;
}
const tokens = vec_new();
let i = 0;
while (i < vec_len(decls)) {
const d = vec_get(decls, i);
if ((d.tag === "DFn")) {
serialize_fn_body(d.body, d.tail, tokens);
}
if ((d.tag === "DClassFn")) {
serialize_fn_body(d.body, d.tail, tokens);
}
i = i + 1;
}
if (vec_len(tokens) < __clone_min_tokens * 2) {
return;
}
const exactClones = find_clones(tokens, __clone_min_tokens);
const extendedClones = extend_clone_maximal(tokens, exactClones);
const paramClones = find_parameterized_clones(tokens, extendedClones, __clone_min_tokens);
report_clones(src, extendedClones, paramClones);
return undefined;
}
