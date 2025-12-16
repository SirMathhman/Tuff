// compiled by selfhost tuffc
import { vec_new, vec_len } from "./rt/vec.mjs";
export const SpanVal = (value) => { return { tag: "SpanVal", value: value }; };
export const OpAdd = { tag: "OpAdd" };
export const OpSub = { tag: "OpSub" };
export const OpMul = { tag: "OpMul" };
export const OpDiv = { tag: "OpDiv" };
export const OpEq = { tag: "OpEq" };
export const OpNe = { tag: "OpNe" };
export const OpLt = { tag: "OpLt" };
export const OpLe = { tag: "OpLe" };
export const OpGt = { tag: "OpGt" };
export const OpGe = { tag: "OpGe" };
export const OpAnd = { tag: "OpAnd" };
export const OpOr = { tag: "OpOr" };
export const TyName = { tag: "TyName" };
export const TyTuple = { tag: "TyTuple" };
export const TyFn = { tag: "TyFn" };
export const TyApp = { tag: "TyApp" };
export const EUndefined = { tag: "EUndefined" };
export const EInt = { tag: "EInt" };
export const EFloat = { tag: "EFloat" };
export const EBool = { tag: "EBool" };
export const EString = { tag: "EString" };
export const EPath = { tag: "EPath" };
export const EIdent = { tag: "EIdent" };
export const ELambda = { tag: "ELambda" };
export const EStructLit = { tag: "EStructLit" };
export const EUnary = { tag: "EUnary" };
export const EBinary = { tag: "EBinary" };
export const ECall = { tag: "ECall" };
export const EIf = { tag: "EIf" };
export const EBlock = { tag: "EBlock" };
export const EVecLit = { tag: "EVecLit" };
export const ETupleLit = { tag: "ETupleLit" };
export const EIndex = { tag: "EIndex" };
export const ETupleIndex = { tag: "ETupleIndex" };
export const EField = { tag: "EField" };
export const EMatch = { tag: "EMatch" };
export const EIsType = { tag: "EIsType" };
export const OpNot = { tag: "OpNot" };
export const OpNeg = { tag: "OpNeg" };
export const MPWildcard = { tag: "MPWildcard" };
export const MPInt = { tag: "MPInt" };
export const MPBool = { tag: "MPBool" };
export const MPString = { tag: "MPString" };
export const MPVariant = { tag: "MPVariant" };
export const SLet = { tag: "SLet" };
export const SAssign = { tag: "SAssign" };
export const SExpr = { tag: "SExpr" };
export const SYield = { tag: "SYield" };
export const SWhile = { tag: "SWhile" };
export const SIf = { tag: "SIf" };
export const SIndexAssign = { tag: "SIndexAssign" };
export const SFieldAssign = { tag: "SFieldAssign" };
export const DExternFrom = { tag: "DExternFrom" };
export const DExternType = { tag: "DExternType" };
export const DLet = { tag: "DLet" };
export const DFn = { tag: "DFn" };
export const DClassFn = { tag: "DClassFn" };
export const DStruct = { tag: "DStruct" };
export const DTypeUnion = { tag: "DTypeUnion" };
export const DModule = { tag: "DModule" };
export const DImport = { tag: "DImport" };
export function span(start, end) {
return SpanVal([start, end]);
}
export function span_start(s) {
return s.value[0];
}
export function span_end(s) {
return s.value[1];
}
export function span_len(s) {
return span_end(s) - span_start(s);
}
export function expr_kind(e) {
if ((e.tag === "EUndefined")) {
return "EUndefined";
}
if ((e.tag === "EInt")) {
return "EInt";
}
if ((e.tag === "EFloat")) {
return "EFloat";
}
if ((e.tag === "EBool")) {
return "EBool";
}
if ((e.tag === "EString")) {
return "EString";
}
if ((e.tag === "EPath")) {
return "EPath";
}
if ((e.tag === "EIdent")) {
return "EIdent";
}
if ((e.tag === "ELambda")) {
return "ELambda";
}
if ((e.tag === "EStructLit")) {
return "EStructLit";
}
if ((e.tag === "EUnary")) {
return "EUnary";
}
if ((e.tag === "EBinary")) {
return "EBinary";
}
if ((e.tag === "ECall")) {
return "ECall";
}
if ((e.tag === "EIf")) {
return "EIf";
}
if ((e.tag === "EBlock")) {
return "EBlock";
}
if ((e.tag === "EVecLit")) {
return "EVecLit";
}
if ((e.tag === "ETupleLit")) {
return "ETupleLit";
}
if ((e.tag === "EIndex")) {
return "EIndex";
}
if ((e.tag === "ETupleIndex")) {
return "ETupleIndex";
}
if ((e.tag === "EField")) {
return "EField";
}
if ((e.tag === "EMatch")) {
return "EMatch";
}
if ((e.tag === "EIsType")) {
return "EIsType";
}
return "Unknown";
}
export function type_span(t) {
return t.span;
}
export function expr_span(e) {
return e.span;
}
export function stmt_span(s) {
return s.span;
}
export function decl_span(d) {
return d.span;
}
export function ty_name(span, name) {
return ({ tag: "TyName", span: span, name: name });
}
export function ty_tuple(span, items) {
return ({ tag: "TyTuple", span: span, items: items });
}
export function ty_fn(span, params, result) {
return ({ tag: "TyFn", span: span, params: params, result: result });
}
export function ty_app(span, callee, args) {
return ({ tag: "TyApp", span: span, callee: callee, args: args });
}
export function expr_undefined(span) {
return ({ tag: "EUndefined", span: span });
}
export function expr_int(span, value) {
return ({ tag: "EInt", span: span, value: value });
}
export function expr_float(span, text, suffix) {
return ({ tag: "EFloat", span: span, text: text, suffix: suffix });
}
export function expr_bool(span, value) {
return ({ tag: "EBool", span: span, value: value });
}
export function expr_string(span, value) {
return ({ tag: "EString", span: span, value: value });
}
export function expr_ident(span, name) {
return ({ tag: "EIdent", span: span, name: name });
}
export function expr_path(span, parts) {
return ({ tag: "EPath", span: span, parts: parts });
}
export function expr_lambda(span, typeParams, params, paramTyAnns, retTyAnn, body) {
return ({ tag: "ELambda", span: span, typeParams: typeParams, params: params, paramTyAnns: paramTyAnns, retTyAnn: retTyAnn, body: body });
}
export function expr_struct_lit(span, nameExpr, values) {
return ({ tag: "EStructLit", span: span, nameExpr: nameExpr, values: values });
}
export function expr_unary(span, op, expr) {
return ({ tag: "EUnary", span: span, op: op, expr: expr });
}
export function expr_binary(span, op, left, right) {
return ({ tag: "EBinary", span: span, op: op, left: left, right: right });
}
export function expr_call(span, callee, args) {
return ({ tag: "ECall", span: span, callee: callee, typeArgs: vec_new(), args: args });
}
export function expr_call_typed(span, callee, typeArgs, args) {
return ({ tag: "ECall", span: span, callee: callee, typeArgs: typeArgs, args: args });
}
export function expr_if(span, cond, thenExpr, elseExpr) {
return ({ tag: "EIf", span: span, cond: cond, thenExpr: thenExpr, elseExpr: elseExpr });
}
export function expr_block(span, body, tail) {
return ({ tag: "EBlock", span: span, body: body, tail: tail });
}
export function expr_vec_lit(span, items) {
return ({ tag: "EVecLit", span: span, items: items });
}
export function expr_tuple_lit(span, items) {
return ({ tag: "ETupleLit", span: span, items: items });
}
export function expr_index(span, base, index) {
return ({ tag: "EIndex", span: span, base: base, index: index });
}
export function expr_tuple_index(span, base, index) {
return ({ tag: "ETupleIndex", span: span, base: base, index: index });
}
export function expr_field(span, base, field) {
return ({ tag: "EField", span: span, base: base, field: field });
}
export function expr_is_type(span, expr, typeToCheck) {
return ({ tag: "EIsType", span: span, expr: expr, typeToCheck: typeToCheck });
}
export function pat_wildcard(span) {
return ({ tag: "MPWildcard", span: span });
}
export function pat_int(span, value) {
return ({ tag: "MPInt", span: span, value: value });
}
export function pat_bool(span, value) {
return ({ tag: "MPBool", span: span, value: value });
}
export function pat_string(span, value) {
return ({ tag: "MPString", span: span, value: value });
}
export function pat_variant(span, name) {
return ({ tag: "MPVariant", span: span, name: name });
}
export function mk_match_arm(span, pat, expr) {
return ({ tag: "MatchArm", span: span, pat: pat, expr: expr });
}
export function expr_match(span, scrut, arms) {
return ({ tag: "EMatch", span: span, scrut: scrut, arms: arms });
}
export function stmt_let(span, isMut, name, init) {
return ({ tag: "SLet", span: span, isMut: isMut, name: name, tyAnn: "", init: init });
}
export function stmt_let_typed(span, isMut, name, tyAnn, init) {
return ({ tag: "SLet", span: span, isMut: isMut, name: name, tyAnn: tyAnn, init: init });
}
export function stmt_assign(span, name, value) {
return ({ tag: "SAssign", span: span, name: name, value: value });
}
export function stmt_expr(span, expr) {
return ({ tag: "SExpr", span: span, expr: expr });
}
export function stmt_yield(span, expr) {
return ({ tag: "SYield", span: span, expr: expr });
}
export function stmt_while(span, cond, body) {
return ({ tag: "SWhile", span: span, cond: cond, body: body });
}
export function stmt_if(span, cond, thenBody, hasElse, elseBody) {
return ({ tag: "SIf", span: span, cond: cond, thenBody: thenBody, hasElse: hasElse, elseBody: elseBody });
}
export function stmt_index_assign(span, base, index, value) {
return ({ tag: "SIndexAssign", span: span, base: base, index: index, value: value });
}
export function stmt_field_assign(span, base, fields, value) {
return ({ tag: "SFieldAssign", span: span, base: base, fields: fields, value: value });
}
export function decl_extern_from(span, modulePath, names) {
return ({ tag: "DExternFrom", span: span, modulePath: modulePath, names: names });
}
export function decl_extern_type(span, isOut, name, typeParams) {
return ({ tag: "DExternType", span: span, isOut: isOut, name: name, typeParams: typeParams });
}
export function decl_import(span, modulePath, names) {
return ({ tag: "DImport", span: span, modulePath: modulePath, names: names });
}
export function decl_struct(span, name, fields) {
return ({ tag: "DStruct", span: span, name: name, typeParams: vec_new(), fields: fields, fieldTyAnns: vec_new() });
}
export function decl_struct_typed(span, name, typeParams, fields, fieldTyAnns) {
return ({ tag: "DStruct", span: span, name: name, typeParams: typeParams, fields: fields, fieldTyAnns: fieldTyAnns });
}
export function type_union_variant(span, name, hasPayload) {
return ({ tag: "TypeUnionVariant", span: span, name: name, hasPayload: hasPayload, payloadTyAnns: vec_new() });
}
export function type_union_variant_typed(span, name, payloadTyAnns) {
return ({ tag: "TypeUnionVariant", span: span, name: name, hasPayload: vec_len(payloadTyAnns) > 0, payloadTyAnns: payloadTyAnns });
}
export function decl_type_union(span, name, typeParams, variants) {
return ({ tag: "DTypeUnion", span: span, name: name, typeParams: typeParams, variants: variants });
}
export function decl_fn(span, isOut, name, params, body, tail) {
return ({ tag: "DFn", span: span, isOut: isOut, name: name, typeParams: vec_new(), params: params, paramTyAnns: vec_new(), retTyAnn: "", body: body, tail: tail });
}
export function decl_fn_typed(span, isOut, name, typeParams, params, paramTyAnns, retTyAnn, body, tail) {
return ({ tag: "DFn", span: span, isOut: isOut, name: name, typeParams: typeParams, params: params, paramTyAnns: paramTyAnns, retTyAnn: retTyAnn, body: body, tail: tail });
}
export function decl_class_fn(span, isOut, name, params, body, tail) {
return ({ tag: "DClassFn", span: span, isOut: isOut, name: name, typeParams: vec_new(), params: params, paramTyAnns: vec_new(), retTyAnn: "", body: body, tail: tail });
}
export function decl_class_fn_typed(span, isOut, name, typeParams, params, paramTyAnns, retTyAnn, body, tail) {
return ({ tag: "DClassFn", span: span, isOut: isOut, name: name, typeParams: typeParams, params: params, paramTyAnns: paramTyAnns, retTyAnn: retTyAnn, body: body, tail: tail });
}
export function decl_let(span, isMut, name, init) {
return ({ tag: "DLet", span: span, isMut: isMut, name: name, tyAnn: "", init: init });
}
export function decl_let_typed(span, isMut, name, tyAnn, init) {
return ({ tag: "DLet", span: span, isMut: isMut, name: name, tyAnn: tyAnn, init: init });
}
export function decl_module(span, name, decls) {
return ({ tag: "DModule", span: span, name: name, decls: decls });
}
