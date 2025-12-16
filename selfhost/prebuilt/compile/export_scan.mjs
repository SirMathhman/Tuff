// compiled by selfhost tuffc
import { stringLen, stringCharCodeAt, stringSlice } from "../rt/stdlib.mjs";
import { vec_new, vec_len, vec_get, vec_push } from "../rt/vec.mjs";
import { is_ident_part, skip_ws, starts_with_at } from "../util/lexing.mjs";
import { parse_keyword, parse_ident, parse_optional_semicolon } from "../parsing/primitives.mjs";
import { parse_type_expr } from "../parsing/types.mjs";
import { parse_mut_opt, parse_expr_ast } from "../parsing/expr_stmt.mjs";
import { parse_extern_decl_ast, parse_imports_ast, parse_module_decl_ast, parse_fn_decl_ast2, parse_class_fn_decl_ast2, parse_struct_decl_ast, parse_type_union_decl_ast } from "../parsing/decls.mjs";
import { mk_fn_sig } from "../analyzer.mjs";
import { span, span_start, decl_let, decl_let_typed } from "../ast.mjs";
import { deprecation_reason_before } from "./deprecation_comments.mjs";
export function kw_at(src, i, kw) {
if (!starts_with_at(src, i, kw)) {
return false;
}
const end = i + stringLen(kw);
if (end < stringLen(src) && is_ident_part(stringCharCodeAt(src, end))) {
return false;
}
return true;
}
export function is_extern_decl_start(src, i) {
const j = skip_ws(src, i);
if (kw_at(src, j, "extern")) {
return true;
}
if (kw_at(src, j, "out")) {
const k = skip_ws(src, j + 3);
if (kw_at(src, k, "extern")) {
return true;
}
}
return false;
}
export function module_index(modulePaths, path) {
let i = 0;
while (i < vec_len(modulePaths)) {
if (vec_get(modulePaths, i) == path) {
return i;
}
i = i + 1;
}
return -1;
}
export function fnsig_lookup_by_name(fns, name) {
let i = 0;
while (i < vec_len(fns)) {
const s = vec_get(fns, i);
if (s.name == name) {
return s;
}
i = i + 1;
}
return mk_fn_sig("", "", vec_new(), vec_new(), vec_new(), "");
}
export function scan_top_level_fn_exports(src) {
const outSigs = vec_new();
const privateNames = vec_new();
const allSigs = vec_new();
let decls = vec_new();
let i = 0;
while (true) {
if (is_extern_decl_start(src, i)) {
const ex = parse_extern_decl_ast(src, i);
vec_push(decls, ex.decl);
i = ex.nextPos;
continue;
}
break;
}
const imps = parse_imports_ast(src, i);
let ii = 0;
while (ii < vec_len(imps.decls)) {
vec_push(decls, vec_get(imps.decls, ii));
ii = ii + 1;
}
i = imps.nextPos;
while (true) {
const j = skip_ws(src, i);
if (!starts_with_at(src, j, "module")) {
break;
}
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "module")) {
const m = parse_module_decl_ast(src, i);
vec_push(decls, m.decl);
i = m.nextPos;
continue;
}
if (starts_with_at(src, j, "type")) {
const td = parse_type_union_decl_ast(src, i, false);
vec_push(decls, td.decl);
i = td.nextPos;
continue;
}
if (starts_with_at(src, j, "struct")) {
const sd = parse_struct_decl_ast(src, i);
vec_push(decls, sd.decl);
i = sd.nextPos;
continue;
}
break;
}
while (true) {
const j = skip_ws(src, i);
if (!starts_with_at(src, j, "let")) {
break;
}
const start = skip_ws(src, i);
i = parse_keyword(src, i, "let");
const mutOpt = parse_mut_opt(src, i);
i = mutOpt.nextPos;
const name = parse_ident(src, i);
i = name.nextPos;
let tyAnn = "";
const t0 = skip_ws(src, i);
if (t0 < stringLen(src) && stringCharCodeAt(src, t0) == 58) {
const _ty = parse_type_expr(src, t0 + 1);
tyAnn = _ty.v0;
i = _ty.v1;
}
i = parse_keyword(src, i, "=");
const expr = parse_expr_ast(src, i);
i = expr.nextPos;
i = parse_optional_semicolon(src, i);
if (tyAnn == "") {
vec_push(decls, decl_let(span(start, i), mutOpt.ok, name.text, expr.expr));
} else {
vec_push(decls, decl_let_typed(span(start, i), mutOpt.ok, name.text, tyAnn, expr.expr));
}
}
while (true) {
const j = skip_ws(src, i);
if (starts_with_at(src, j, "fn")) {
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
if (starts_with_at(src, j, "out")) {
const k0 = parse_keyword(src, i, "out");
const j2 = skip_ws(src, k0);
if (starts_with_at(src, j2, "class")) {
const f = parse_class_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
const f = parse_fn_decl_ast2(src, i, false);
vec_push(decls, f.decl);
i = f.nextPos;
continue;
}
break;
}
let di = 0;
while (di < vec_len(decls)) {
const d = vec_get(decls, di);
if ((d.tag === "DFn")) {
const depReason = deprecation_reason_before(src, span_start(d.span));
const sig = mk_fn_sig(d.name, depReason, d.typeParams, d.params, d.paramTyAnns, d.retTyAnn);
vec_push(allSigs, sig);
if (d.isOut) {
vec_push(outSigs, sig);
} else {
vec_push(privateNames, d.name);
}
}
if ((d.tag === "DClassFn")) {
const depReason = deprecation_reason_before(src, span_start(d.span));
const sig = mk_fn_sig(d.name, depReason, d.typeParams, d.params, d.paramTyAnns, d.retTyAnn);
vec_push(allSigs, sig);
if (d.isOut) {
vec_push(outSigs, sig);
} else {
vec_push(privateNames, d.name);
}
}
di = di + 1;
}
return [outSigs, privateNames, allSigs];
}
