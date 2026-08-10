import type { AstNode, Expr, IntType, VarType } from "./types";

const INT_RANGES: Record<IntType, [number, number]> = {
  U8: [0, 255],
  U16: [0, 65535],
  U32: [0, 4294967295],
  I8: [-128, 127],
  I16: [-32768, 32767],
  I32: [-2147483648, 2147483647],
};

const UNSIGNED_TYPES = new Set<IntType>(["U8", "U16", "U32"]);

function isSubtypeOf(actual: IntType, expected: IntType): boolean {
  if (actual === expected) return true;
  if (actual === "U8" && expected === "U16") return true;
  if (actual === "U8" && expected === "U32") return true;
  if (actual === "I8" && expected === "I16") return true;
  if (actual === "I8" && expected === "I32") return true;
  if (actual === "U16" && expected === "U32") return true;
  if (actual === "I16" && expected === "I32") return true;
  return false;
}

export function validateScopes(nodes: AstNode[]): void {
  for (const node of nodes) {
    validateIntRanges(node);
  }
  const scope: string[] = [];
  const mutableVars = new Set<string>();
  const types = new Map<string, VarType>();
  const intVars = new Map<string, IntType>();
  for (const node of nodes) {
    if (node.type === "decl") {
      scope.push(node.name);
    } else {
      validateNodeScope(node, scope, mutableVars, types, intVars);
    }
  }
}

function validateIntRanges(node: AstNode): void {
  if (node.type === "let" || node.type === "assign" || node.type === "expr") {
    validateIntExpr(
      node.type === "let"
        ? node.init
        : node.type === "assign"
          ? node.value
          : node.expr,
    );
  }
  if (node.type === "let" && node.typeAnnotation) {
    const initExpr = node.init;
    if (initExpr.type === "number" && initExpr.intType) {
      if (!isSubtypeOf(initExpr.intType, node.typeAnnotation)) {
        throw new Error(
          `Type mismatch: cannot assign ${initExpr.intType} to ${node.typeAnnotation}`,
        );
      }
    } else {
      throw new Error(
        `Type annotation ${node.typeAnnotation} requires an integer literal`,
      );
    }
  }
  if (node.type === "while") {
    validateIntExpr(node.condition);
    for (const n of node.body) validateIntRanges(n);
  }
  if (node.type === "for") {
    validateIntRange(node.rangeExpr);
    for (const n of node.body) validateIntRanges(n);
  }
}

function validateIntExpr(expr: Expr): void {
  if (expr.type === "number" && expr.intType) {
    const [min, max] = INT_RANGES[expr.intType];
    if (expr.value < min || expr.value > max) {
      throw new Error(
        `${expr.intType} literal out of range: ${expr.value} (must be ${min}..${max})`,
      );
    }
  }
  if (expr.type === "binary") {
    validateIntExpr(expr.left);
    validateIntExpr(expr.right);
  }
  if (expr.type === "group") {
    for (const n of expr.nodes) validateIntRanges(n);
  }
  if (expr.type === "if") {
    validateIntExpr(expr.condition);
    validateIntRanges(expr.thenNode);
    if (expr.elseNode) validateIntRanges(expr.elseNode);
  }
  if (expr.type === "match") {
    validateIntExpr(expr.target);
    for (const c of expr.cases) {
      validateIntExpr(c.pattern);
      validateIntExpr(c.body);
    }
  }
  if (expr.type === "array") {
    for (const e of expr.elements) validateIntExpr(e);
  }
  if (expr.type === "index") {
    validateIntExpr(expr.target);
    validateIntExpr(expr.index);
  }
  if (expr.type === "unary") {
    validateIntExpr(expr.operand);
  }
  if (expr.type === "is") {
    validateIntExpr(expr.value);
  }
}

function validateIntRange(expr: Expr): void {
  if (expr.type === "range") {
    validateIntExpr(expr.start);
    validateIntExpr(expr.end);
  }
}

function validateNodeScope(
  node: AstNode,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  intVars: Map<string, IntType>,
): void {
  if (node.type === "decl") return;
  if (node.type === "let") {
    const initType = inferExprType(node.init, scope, mutableVars, types);
    if (hasIntType(node.init)) {
      intVars.set(node.name, (node.init as { type: "number"; intType: IntType }).intType);
    } else if (node.typeAnnotation) {
      intVars.set(node.name, node.typeAnnotation);
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
    validateExprScope(node.expr, scope, mutableVars, types, intVars);
    return;
  }
  if (node.type === "while") {
    inferExprType(node.condition, scope, mutableVars, types);
    const scope_ = [...scope];
    const mut_ = new Set(mutableVars);
    const types_ = new Map(types);
    const int_ = new Map(intVars);
    for (const n of node.body) {
      validateNodeScope(n, scope_, mut_, types_, int_);
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
    const int_ = new Map(intVars);
    for (const n of node.body) {
      validateNodeScope(n, scope_, mut_, types_, int_);
    }
    return;
  }
  if (node.type === "break" || node.type === "continue") return;
}

function hasIntType(expr: Expr): boolean {
  return expr.type === "number" && expr.intType !== false;
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
  intVars: Map<string, IntType>,
): [string[], Set<string>, Map<string, VarType>] {
  const scope_ = [...scope];
  const mut_ = new Set(mutableVars);
  const types_ = new Map(types);
  const int_ = new Map(intVars);
  for (const node of expr.nodes) {
    validateNodeScope(node, scope_, mut_, types_, int_);
  }
  return [scope_, mut_, types_];
}

function validateExprScope(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  intVars: Map<string, IntType>,
): void {
  if (isGroupExpr(expr)) {
    validateGroupScope(expr, scope, mutableVars, types, intVars);
    return;
  }
  if (expr.type === "if") {
    validateNodeScope(expr.thenNode, scope, mutableVars, types, intVars);
    if (expr.elseNode) {
      validateNodeScope(expr.elseNode, scope, mutableVars, types, intVars);
    }
    return;
  }
  if (expr.type === "unary" && expr.op === "-") {
    if (expr.operand.type === "identifier" && intVars.has(expr.operand.name)) {
      const intType = intVars.get(expr.operand.name);
      if (intType && UNSIGNED_TYPES.has(intType)) {
        throw new Error(`Cannot negate unsigned variable: ${expr.operand.name}`);
      }
    }
    if (expr.operand.type === "number" && expr.operand.intType && UNSIGNED_TYPES.has(expr.operand.intType)) {
      throw new Error(`Cannot negate unsigned literal: ${expr.operand.value}`);
    }
  }
  if (expr.type === "is") {
    if (expr.value.type === "number" && expr.value.intType) {
      if (!isSubtypeOf(expr.value.intType, expr.typeAnnotation)) {
        throw new Error(
          `Type mismatch: ${expr.value.intType} is not ${expr.typeAnnotation}`,
        );
      }
    } else if (expr.value.type === "identifier" && intVars.has(expr.value.name)) {
      const actualIntType = intVars.get(expr.value.name)!;
      if (!isSubtypeOf(actualIntType, expr.typeAnnotation)) {
        throw new Error(
          `Type mismatch: ${actualIntType} is not ${expr.typeAnnotation}`,
        );
      }
    } else {
      throw new Error(
        `is operator requires a number value, got ${inferExprType(expr.value, scope, mutableVars, types)}`,
      );
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
      new Map(),
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
  if (expr.type === "is") return "number";
  return "number";
}

const comparisonOps = new Set(["==", "<"]);
