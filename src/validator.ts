import type { AstNode, Expr, VarType } from "./types";

export function validateScopes(nodes: AstNode[]): void {
  for (const node of nodes) {
    validateU8(node);
  }
  const scope: string[] = [];
  const mutableVars = new Set<string>();
  const types = new Map<string, VarType>();
  const u8Vars = new Set<string>();
  for (const node of nodes) {
    if (node.type === "decl") {
      scope.push(node.name);
    } else {
      validateNodeScope(node, scope, mutableVars, types, u8Vars);
    }
  }
}

function validateU8(node: AstNode): void {
  if (node.type === "let" || node.type === "assign" || node.type === "expr") {
    validateU8Expr(
      node.type === "let"
        ? node.init
        : node.type === "assign"
          ? node.value
          : node.expr,
    );
  }
  if (node.type === "while") {
    validateU8Expr(node.condition);
    for (const n of node.body) validateU8(n);
  }
  if (node.type === "for") {
    validateU8Range(node.rangeExpr);
    for (const n of node.body) validateU8(n);
  }
}

function validateU8Expr(expr: Expr): void {
  if (expr.type === "number" && expr.u8 && expr.value > 255) {
    throw new Error(`U8 literal out of range: ${expr.value}`);
  }
  if (expr.type === "binary") {
    validateU8Expr(expr.left);
    validateU8Expr(expr.right);
  }
  if (expr.type === "group") {
    for (const n of expr.nodes) validateU8(n);
  }
  if (expr.type === "if") {
    validateU8Expr(expr.condition);
    validateU8(expr.thenNode);
    if (expr.elseNode) validateU8(expr.elseNode);
  }
  if (expr.type === "match") {
    validateU8Expr(expr.target);
    for (const c of expr.cases) {
      validateU8Expr(c.pattern);
      validateU8Expr(c.body);
    }
  }
  if (expr.type === "array") {
    for (const e of expr.elements) validateU8Expr(e);
  }
  if (expr.type === "index") {
    validateU8Expr(expr.target);
    validateU8Expr(expr.index);
  }
  if (expr.type === "unary") {
    validateU8Expr(expr.operand);
  }
}

function validateU8Range(expr: Expr): void {
  if (expr.type === "range") {
    validateU8Expr(expr.start);
    validateU8Expr(expr.end);
  }
}

function validateNodeScope(
  node: AstNode,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  u8Vars: Set<string>,
): void {
  if (node.type === "decl") return;
  if (node.type === "let") {
    const initType = inferExprType(node.init, scope, mutableVars, types);
    if (isU8Expr(node.init)) {
      u8Vars.add(node.name);
    }
    scope.push(node.name);
    types.set(node.name, initType);
    if (node.mutable) {
      mutableVars.add(node.name);
    }
    return;
  }
  if (node.type === "assign") {
    validateAssignExpr(node.target, node.value, scope, mutableVars, types);
    return;
  }
  if (node.type === "expr") {
    validateExprScope(node.expr, scope, mutableVars, types, u8Vars);
    return;
  }
  if (node.type === "while") {
    inferExprType(node.condition, scope, mutableVars, types);
    const scope_ = [...scope];
    const mut_ = new Set(mutableVars);
    const types_ = new Map(types);
    const u8_ = new Set(u8Vars);
    for (const n of node.body) {
      validateNodeScope(n, scope_, mut_, types_, u8_);
    }
    return;
  }
  if (node.type === "for") {
    validateRangeExpr(node.rangeExpr, scope, mutableVars, types);
    const scope_ = [...scope, node.varName];
    const mut_ = new Set(mutableVars);
    mut_.add(node.varName);
    const types_ = new Map(types);
    types_.set(node.varName, "number");
    const u8_ = new Set(u8Vars);
    for (const n of node.body) {
      validateNodeScope(n, scope_, mut_, types_, u8_);
    }
    return;
  }
  if (node.type === "break" || node.type === "continue") return;
}

function isU8Expr(expr: Expr): boolean {
  return expr.type === "number" && expr.u8;
}

function assertDefined(name: string, scope: string[]): void {
  if (!scope.includes(name)) {
    throw new Error(`Undefined variable: ${name}`);
  }
}

function validateRangeExpr(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): void {
  if (expr.type === "range") {
    inferExprType(expr.start, scope, mutableVars, types);
    inferExprType(expr.end, scope, mutableVars, types);
  } else if (expr.type === "identifier") {
    assertDefined(expr.name, scope);
    const varType = types.get(expr.name);
    if (varType !== "range") {
      throw new Error(`Expected range type, got ${varType}`);
    }
  } else {
    throw new Error("Expected range expression or range variable");
  }
}

function checkTypeMismatch(
  varName: string,
  value: Expr,
  types: Map<string, VarType>,
  scope: string[],
  mutableVars: Set<string>,
): void {
  const varType = types.get(varName)!;
  const valType = inferExprType(value, scope, mutableVars, types);
  if (varType !== valType) {
    throw new Error(`Type mismatch: cannot assign ${valType} to ${varType}`);
  }
}

function validateAssignExpr(
  target: Expr,
  value: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): void {
  inferExprType(target, scope, mutableVars, types);
  if (target.type === "identifier") {
    if (!mutableVars.has(target.name)) {
      throw new Error(`Cannot assign to immutable variable: ${target.name}`);
    }
    checkTypeMismatch(target.name, value, types, scope, mutableVars);
  } else {
    inferExprType(value, scope, mutableVars, types);
  }
}

function isGroupExpr(expr: Expr): expr is { type: "group"; nodes: AstNode[] } {
  return expr.type === "group";
}

function validateGroupScope(
  expr: { type: "group"; nodes: AstNode[] },
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  u8Vars: Set<string>,
): [string[], Set<string>, Map<string, VarType>] {
  const scope_ = [...scope];
  const mut_ = new Set(mutableVars);
  const types_ = new Map(types);
  const u8_ = new Set(u8Vars);
  for (const node of expr.nodes) {
    validateNodeScope(node, scope_, mut_, types_, u8_);
  }
  return [scope_, mut_, types_];
}

function validateExprScope(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  u8Vars: Set<string>,
): void {
  if (isGroupExpr(expr)) {
    validateGroupScope(expr, scope, mutableVars, types, u8Vars);
    return;
  }
  if (expr.type === "if") {
    validateNodeScope(expr.thenNode, scope, mutableVars, types, u8Vars);
    if (expr.elseNode) {
      validateNodeScope(expr.elseNode, scope, mutableVars, types, u8Vars);
    }
    return;
  }
  if (expr.type === "unary" && expr.op === "-") {
    if (expr.operand.type === "identifier" && u8Vars.has(expr.operand.name)) {
      throw new Error(`Cannot negate U8 variable: ${expr.operand.name}`);
    }
  }
  inferExprType(expr, scope, mutableVars, types);
}

function inferNodeType(
  node: AstNode,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): VarType {
  if (node.type === "expr") return inferExprType(node.expr, scope, mutableVars, types);
  if (node.type === "let") return types.get(node.name)!;
  if (node.type === "assign") {
    if (node.target.type === "identifier") return types.get(node.target.name)!;
    return inferExprType(node.target, scope, mutableVars, types);
  }
  throw new Error("Node type cannot be inferred");
}

function inferExprType(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): VarType {
  if (expr.type === "number") return "number";
  if (expr.type === "boolean") return "boolean";
  if (expr.type === "identifier") {
    assertDefined(expr.name, scope);
    return types.get(expr.name) || "number";
  }
  if (expr.type === "binary") {
    if (expr.op === "..") return "range";
    if (comparisonOps.has(expr.op)) return "boolean";
    return "number";
  }
  if (expr.type === "assign") {
    const target = expr.target;
    if (target.type === "identifier") {
      checkTypeMismatch(target.name, expr.value, types, scope, mutableVars);
      return types.get(target.name)!;
    }
    inferExprType(target, scope, mutableVars, types);
    return inferExprType(expr.value, scope, mutableVars, types);
  }
  if (isGroupExpr(expr)) {
    const [scope_, mut_, types_] = validateGroupScope(
      expr,
      scope,
      mutableVars,
      types,
      new Set(),
    );
    const last = expr.nodes[expr.nodes.length - 1];
    if (last && last.type === "expr") {
      return inferExprType(last.expr, scope_, mut_, types_);
    }
    throw new Error("Block used as expression must end with an expression");
  }
  if (expr.type === "if") {
    if (!expr.elseNode) {
      throw new Error("If used as expression must have an else branch");
    }
    const thenType = inferNodeType(expr.thenNode, scope, mutableVars, types);
    const elseType = inferNodeType(expr.elseNode, scope, mutableVars, types);
    if (thenType !== elseType) {
      throw new Error(
        `If branches must have the same type: ${thenType} vs ${elseType}`,
      );
    }
    return thenType;
  }
  if (expr.type === "unary") return "number";
  if (expr.type === "array") {
    for (const elem of expr.elements) {
      inferExprType(elem, scope, mutableVars, types);
    }
    return "array";
  }
  if (expr.type === "index") {
    assertDefined(
      expr.target.type === "identifier" ? expr.target.name : "",
      scope,
    );
    inferExprType(expr.target, scope, mutableVars, types);
    inferExprType(expr.index, scope, mutableVars, types);
    return "number";
  }
  return "number";
}

const comparisonOps = new Set(["==", "<"]);
