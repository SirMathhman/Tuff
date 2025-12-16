// compiled by selfhost tuffc
import { vec_new, vec_push, vec_len, vec_get } from "../rt/vec.mjs";
import { stringLen, stringCharCodeAt } from "../rt/stdlib.mjs";
import { set_current_file, reset_errors, reset_warnings, reset_struct_defs } from "../util/diagnostics.mjs";
import { lsp_resolve_module_path_impl, lsp_ident_at_impl, lsp_module_path_at_impl } from "./lsp_util.mjs";
import { span_start, span_end } from "../ast.mjs";
import { lsp_parse_file_impl } from "./lsp_check.mjs";
export function DefLocation(found, defStart, defEnd, defFile) {
return { found: found, defStart: defStart, defEnd: defEnd, defFile: defFile };
}
export function lsp_def(name, defStart, defEnd, kind) {
return ({ tag: "LspDef", name: name, defStart: defStart, defEnd: defEnd, kind: kind, defFile: "" });
}
export function lsp_def_ext(name, defStart, defEnd, kind, defFile) {
return ({ tag: "LspDef", name: name, defStart: defStart, defEnd: defEnd, kind: kind, defFile: defFile });
}
export function lsp_ref_ext(refStart, refEnd, defStart, defEnd, defFile) {
return ({ tag: "LspRef", refStart: refStart, refEnd: refEnd, defStart: defStart, defEnd: defEnd, defFile: defFile });
}
export function lsp_lookup(defs, name) {
let i = vec_len(defs) - 1;
while (i >= 0) {
const d = vec_get(defs, i);
if (d.name == name) {
return d;
}
i = i - 1;
}
return lsp_def("", -1, -1, "");
}
export function lsp_lookup_type(defs, name) {
let i = vec_len(defs) - 1;
while (i >= 0) {
const d = vec_get(defs, i);
if (d.name == name && (d.kind == "struct" || d.kind == "type")) {
return d;
}
i = i - 1;
}
return lsp_def("", -1, -1, "");
}
export function lsp_lookup_field(defs, structName, fieldName) {
const fullName = structName + "." + fieldName;
let i = 0;
while (i < vec_len(defs)) {
const d = vec_get(defs, i);
if (d.name == fullName && d.kind == "field") {
return d;
}
i = i + 1;
}
return lsp_def("", -1, -1, "");
}
export function lsp_in_range(offset, start, end) {
return offset >= start && offset < end;
}
export function lsp_collect_decls(decls, defs, filePath) {
let i = 0;
while (i < vec_len(decls)) {
lsp_collect_decl(vec_get(decls, i), defs, filePath);
i = i + 1;
}
return undefined;
}
export function lsp_collect_decl(d, defs, filePath) {
if ((d.tag === "DExternFrom")) {
let ni = 0;
while (ni < vec_len(d.names)) {
vec_push(defs, lsp_def(vec_get(d.names, ni), span_start(d.span), span_end(d.span), "extern"));
ni = ni + 1;
}
}
if ((d.tag === "DImport")) {
const targetFile = lsp_resolve_module_path_impl(d.modulePath, filePath);
let ni = 0;
while (ni < vec_len(d.names)) {
vec_push(defs, lsp_def_ext(vec_get(d.names, ni), 0, 0, "import", targetFile));
ni = ni + 1;
}
}
if ((d.tag === "DLet")) {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "var"));
}
if ((d.tag === "DFn")) {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "fn"));
}
if ((d.tag === "DClassFn")) {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "fn"));
}
if ((d.tag === "DStruct")) {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "struct"));
let fi = 0;
while (fi < vec_len(d.fields)) {
const fieldName = vec_get(d.fields, fi);
vec_push(defs, lsp_def(d.name + "." + fieldName, span_start(d.span), span_end(d.span), "field"));
fi = fi + 1;
}
}
if ((d.tag === "DTypeUnion")) {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "type"));
let vi = 0;
while (vi < vec_len(d.variants)) {
const v = vec_get(d.variants, vi);
vec_push(defs, lsp_def(v.name, span_start(v.span), span_end(v.span), "variant"));
vi = vi + 1;
}
}
if ((d.tag === "DModule")) {
vec_push(defs, lsp_def(d.name, span_start(d.span), span_end(d.span), "module"));
lsp_collect_decls(d.decls, defs, filePath);
}
return undefined;
}
export function lsp_resolve_expr(e, defs, refs) {
if ((e.tag === "EIdent")) {
const d = lsp_lookup(defs, e.name);
if (d.defStart >= 0 || stringLen(d.defFile) > 0) {
vec_push(refs, lsp_ref_ext(span_start(e.span), span_end(e.span), d.defStart, d.defEnd, d.defFile));
}
return "";
}
if ((e.tag === "EStructLit")) {
let structName = "";
let nameSpan = e.span;
if ((e.nameExpr.tag === "EIdent")) {
structName = e.nameExpr.name;
nameSpan = e.nameExpr.span;
}
if ((e.nameExpr.tag === "EPath")) {
if (vec_len(e.nameExpr.parts) > 0) {
structName = vec_get(e.nameExpr.parts, vec_len(e.nameExpr.parts) - 1);
nameSpan = e.nameExpr.span;
}
}
if (stringLen(structName) > 0) {
const tyDef = lsp_lookup_type(defs, structName);
if (tyDef.defStart >= 0 || stringLen(tyDef.defFile) > 0) {
vec_push(refs, lsp_ref_ext(span_start(nameSpan), span_end(nameSpan), tyDef.defStart, tyDef.defEnd, tyDef.defFile));
}
}
let vi = 0;
while (vi < vec_len(e.values)) {
lsp_resolve_expr(vec_get(e.values, vi), defs, refs);
vi = vi + 1;
}
return structName;
}
if ((e.tag === "EField")) {
const baseTy = lsp_resolve_expr(e.base, defs, refs);
if (stringLen(baseTy) > 0) {
const fieldDef = lsp_lookup_field(defs, baseTy, e.field);
if (fieldDef.defStart >= 0) {
const fieldStart = span_end(e.base.span) + 1;
vec_push(refs, lsp_ref_ext(fieldStart, span_end(e.span), fieldDef.defStart, fieldDef.defEnd, fieldDef.defFile));
}
}
return "";
}
if ((e.tag === "ECall")) {
lsp_resolve_expr(e.callee, defs, refs);
let ai = 0;
while (ai < vec_len(e.args)) {
lsp_resolve_expr(vec_get(e.args, ai), defs, refs);
ai = ai + 1;
}
}
if ((e.tag === "EBinary")) {
lsp_resolve_expr(e.left, defs, refs);
lsp_resolve_expr(e.right, defs, refs);
}
if ((e.tag === "EUnary")) {
lsp_resolve_expr(e.expr, defs, refs);
}
if ((e.tag === "EIf")) {
lsp_resolve_expr(e.cond, defs, refs);
lsp_resolve_expr(e.thenExpr, defs, refs);
lsp_resolve_expr(e.elseExpr, defs, refs);
}
if ((e.tag === "EBlock")) {
lsp_resolve_stmts(e.body, defs, refs);
lsp_resolve_expr(e.tail, defs, refs);
}
if ((e.tag === "ELambda")) {
let pi = 0;
while (pi < vec_len(e.params)) {
vec_push(defs, lsp_def(vec_get(e.params, pi), span_start(e.span), span_end(e.span), "param"));
pi = pi + 1;
}
lsp_resolve_expr(e.body, defs, refs);
}
if ((e.tag === "EMatch")) {
lsp_resolve_expr(e.scrut, defs, refs);
let mi = 0;
while (mi < vec_len(e.arms)) {
const arm = vec_get(e.arms, mi);
let bi = 0;
while (bi < vec_len(arm.bindings)) {
vec_push(defs, lsp_def(vec_get(arm.bindings, bi), span_start(arm.span), span_end(arm.span), "binding"));
bi = bi + 1;
}
lsp_resolve_expr(arm.expr, defs, refs);
mi = mi + 1;
}
}
if ((e.tag === "EIndex")) {
lsp_resolve_expr(e.base, defs, refs);
lsp_resolve_expr(e.index, defs, refs);
}
if ((e.tag === "ETupleIndex")) {
lsp_resolve_expr(e.base, defs, refs);
}
if ((e.tag === "EVecLit")) {
let ii = 0;
while (ii < vec_len(e.items)) {
lsp_resolve_expr(vec_get(e.items, ii), defs, refs);
ii = ii + 1;
}
}
if ((e.tag === "ETupleLit")) {
let ii = 0;
while (ii < vec_len(e.items)) {
lsp_resolve_expr(vec_get(e.items, ii), defs, refs);
ii = ii + 1;
}
}
return "";
}
export function lsp_resolve_stmt(s, defs, refs) {
if ((s.tag === "SLet")) {
lsp_resolve_expr(s.init, defs, refs);
vec_push(defs, lsp_def(s.name, span_start(s.span), span_end(s.span), "var"));
}
if ((s.tag === "SAssign")) {
const d = lsp_lookup(defs, s.name);
if (d.defStart >= 0) {
vec_push(refs, lsp_ref_ext(span_start(s.span), span_start(s.span) + stringLen(s.name), d.defStart, d.defEnd, d.defFile));
}
lsp_resolve_expr(s.value, defs, refs);
}
if ((s.tag === "SExpr")) {
lsp_resolve_expr(s.expr, defs, refs);
}
if ((s.tag === "SYield")) {
lsp_resolve_expr(s.expr, defs, refs);
}
if ((s.tag === "SWhile")) {
lsp_resolve_expr(s.cond, defs, refs);
lsp_resolve_stmts(s.body, defs, refs);
}
if ((s.tag === "SIf")) {
lsp_resolve_expr(s.cond, defs, refs);
lsp_resolve_stmts(s.thenBody, defs, refs);
if (s.hasElse) {
lsp_resolve_stmts(s.elseBody, defs, refs);
}
}
if ((s.tag === "SIndexAssign")) {
lsp_resolve_expr(s.base, defs, refs);
lsp_resolve_expr(s.index, defs, refs);
lsp_resolve_expr(s.value, defs, refs);
}
if ((s.tag === "SFieldAssign")) {
lsp_resolve_expr(s.base, defs, refs);
lsp_resolve_expr(s.value, defs, refs);
}
return undefined;
}
export function lsp_resolve_stmts(stmts, defs, refs) {
let i = 0;
while (i < vec_len(stmts)) {
lsp_resolve_stmt(vec_get(stmts, i), defs, refs);
i = i + 1;
}
return undefined;
}
export function lsp_resolve_decl(d, defs, refs) {
if ((d.tag === "DLet")) {
lsp_resolve_expr(d.init, defs, refs);
}
if ((d.tag === "DFn")) {
let pi = 0;
while (pi < vec_len(d.params)) {
vec_push(defs, lsp_def(vec_get(d.params, pi), span_start(d.span), span_end(d.span), "param"));
pi = pi + 1;
}
lsp_resolve_stmts(d.body, defs, refs);
lsp_resolve_expr(d.tail, defs, refs);
}
if ((d.tag === "DClassFn")) {
let pi = 0;
while (pi < vec_len(d.params)) {
vec_push(defs, lsp_def(vec_get(d.params, pi), span_start(d.span), span_end(d.span), "param"));
pi = pi + 1;
}
lsp_resolve_stmts(d.body, defs, refs);
lsp_resolve_expr(d.tail, defs, refs);
}
if ((d.tag === "DModule")) {
lsp_resolve_decls(d.decls, defs, refs);
}
return undefined;
}
export function lsp_resolve_decls(decls, defs, refs) {
let i = 0;
while (i < vec_len(decls)) {
lsp_resolve_decl(vec_get(decls, i), defs, refs);
i = i + 1;
}
return undefined;
}
export function lsp_find_ref_at(refs, offset) {
let i = 0;
while (i < vec_len(refs)) {
const r = vec_get(refs, i);
if (lsp_in_range(offset, r.refStart, r.refEnd)) {
return r;
}
i = i + 1;
}
return lsp_ref_ext(-1, -1, -1, -1, "");
}
export function lsp_find_definition_impl(src, offset, filePath) {
reset_struct_defs();
reset_errors();
reset_warnings();
set_current_file(filePath);
const decls = lsp_parse_file_impl(src);
const defs = vec_new();
const refs = vec_new();
lsp_collect_decls(decls, defs, filePath);
lsp_resolve_decls(decls, defs, refs);
const r = lsp_find_ref_at(refs, offset);
if (r.refStart < 0) {
const modulePath = lsp_module_path_at_impl(src, offset);
if (stringLen(modulePath) > 0) {
const targetFile = lsp_resolve_module_path_impl(modulePath, filePath);
return DefLocation(true, 0, 0, targetFile);
}
const ident = lsp_ident_at_impl(src, offset);
if (stringLen(ident) > 0) {
const d = lsp_lookup(defs, ident);
if (d.defStart >= 0 || stringLen(d.defFile) > 0) {
return DefLocation(true, d.defStart, d.defEnd, d.defFile);
}
}
return DefLocation(false, 0, 0, "");
}
return DefLocation(true, r.defStart, r.defEnd, r.defFile);
}
