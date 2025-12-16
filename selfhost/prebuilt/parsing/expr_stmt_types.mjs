// compiled by selfhost tuffc
export function ParsedExpr(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedMain(body, expr, v1) {
return { body: body, expr: expr, v1: v1 };
}
export function ParsedStmt(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedParams(v0, v1) {
return { v0: v0, v1: v1 };
}
export function ParsedExprAst(expr, nextPos) {
return { expr: expr, nextPos: nextPos };
}
export function ParsedMainAst(body, tail, nextPos) {
return { body: body, tail: tail, nextPos: nextPos };
}
export function ParsedStmtAst(stmt, nextPos) {
return { stmt: stmt, nextPos: nextPos };
}
export function ParsedStmtsAst(stmts, nextPos) {
return { stmts: stmts, nextPos: nextPos };
}
export function ParsedExprListAst(items, nextPos) {
return { items: items, nextPos: nextPos };
}
export function ParsedTypeArgsForCallAst(ok, typeArgs, nextPos) {
return { ok: ok, typeArgs: typeArgs, nextPos: nextPos };
}
export function ParsedTypeParamsForLambdaAst(typeParams, nextPos) {
return { typeParams: typeParams, nextPos: nextPos };
}
