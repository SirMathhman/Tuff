import type {
  Program,
  Statement,
  Expr,
  ExprStatement,
  LetStatement,
  AssignStatement,
  CompoundAssignStatement,
  DerefAssignStatement,
  BlockStatement,
  IfStatement,
  WhileStatement,
  FunctionDefStatement,
  StructDefStatement,
  StructLiteral,
  FieldAccess,
  RefExpr,
  DerefExpr,
  CallExpr,
  BinaryExpr,
  NumberLiteral,
  BooleanLiteral,
  Identifier,
  StructValue,
  RefValue,
} from "./ast";
import type { Scope } from "./scope";
import { createScope, lookup, findScope, lookupValue } from "./scope";
import {
  inferExprType,
  checkTypeCompatibility,
  validateTypeRange,
  lookupFunctionInfo,
} from "./typechecker";
import { RuntimeError, TypeError } from "./errors";
import { isRefValue } from "./ast";
import type { Type } from "./types";
import { typeEquals } from "./types";

export function evaluateProgram(node: Program, scopes: Scope[]): number {
  let result = 0;
  for (const stmt of node.body) {
    result = evaluateStatement(stmt, scopes);
  }
  return result;
}

function evaluateStatement(node: Statement, scopes: Scope[]): number {
  if (isDefStatement(node)) return evalDefStatement(node, scopes);
  if (isAssignStatement(node)) return evalAssignStatement(node, scopes);
  return evalControlStatement(node, scopes);
}

function isDefStatement(
  node: Statement,
): node is FunctionDefStatement | StructDefStatement {
  return (
    node.type === "FunctionDefStatement" || node.type === "StructDefStatement"
  );
}

function evalDefStatement(
  node: FunctionDefStatement | StructDefStatement,
  scopes: Scope[],
): number {
  if (node.type === "FunctionDefStatement")
    return evalFunctionDef(node, scopes);
  return evalStructDef(node, scopes);
}

function isAssignStatement(
  node: Statement,
): node is AssignStatement | CompoundAssignStatement | DerefAssignStatement {
  return (
    node.type === "AssignStatement" ||
    node.type === "CompoundAssignStatement" ||
    node.type === "DerefAssignStatement"
  );
}

function evalAssignStatement(
  node: AssignStatement | CompoundAssignStatement | DerefAssignStatement,
  scopes: Scope[],
): number {
  if (node.type === "AssignStatement") return evalAssign(node, scopes);
  if (node.type === "CompoundAssignStatement")
    return evalCompoundAssign(node, scopes);
  return evalDerefAssign(node, scopes);
}

function evalControlStatement(node: Statement, scopes: Scope[]): number {
  switch (node.type) {
    case "ExprStatement":
      return evalExprStmt(node, scopes);
    case "LetStatement":
      return evalLet(node, scopes);
    case "BlockStatement":
      return evalBlock(node, scopes);
    case "IfStatement":
      return evalIf(node, scopes);
    case "WhileStatement":
      return evalWhile(node, scopes);
    default:
      return 0;
  }
}

function evalFunctionDef(node: FunctionDefStatement, scopes: Scope[]): number {
  const scope = scopes[scopes.length - 1]!;
  scope.functions[node.name] = { body: node.body, params: node.params };
  scope.functionReturnTypes[node.name] = node.returnAnnotation;
  if (node.returnAnnotation) {
    const srcType = inferExprType(node.body, scopes);
    checkTypeCompatibility(srcType, node.returnAnnotation, node.loc);
  }
  return 0;
}

function evalExprStmt(node: ExprStatement, scopes: Scope[]): number {
  const result = evaluateExpr(node.expression, scopes);
  return typeof result === "number" ? result : 0;
}

function evalLet(node: LetStatement, scopes: Scope[]): number {
  const value = evaluateExpr(node.value, scopes);
  const srcType = inferExprType(node.value, scopes);
  checkTypeCompatibility(srcType, node.typeAnnotation, node.loc);
  if (typeof value === "number")
    validateTypeRange(value, node.typeAnnotation, node.loc);
  const scope = scopes[scopes.length - 1]!;
  scope.env[node.name] = value;
  scope.types[node.name] = node.typeAnnotation ?? srcType;
  if (node.mutable) scope.mutable.add(node.name);
  return 0;
}

function evalAssign(node: AssignStatement, scopes: Scope[]): number {
  const scope = validateMutableTarget(node.name, scopes, node.loc);
  const srcType = inferExprType(node.value, scopes);
  const dstType = scope.types[node.name] ?? null;
  checkTypeCompatibility(srcType, dstType, node.loc);
  const value = evaluateExpr(node.value, scopes);
  scope.env[node.name] = typeof value === "number" ? value : 0;
  return 0;
}

function evalCompoundAssign(
  node: CompoundAssignStatement,
  scopes: Scope[],
): number {
  const scope = validateMutableTarget(node.name, scopes, node.loc);
  const value = evaluateExpr(node.value, scopes);
  if (node.op === "+=") {
    const current = scope.env[node.name]!;
    const numValue = typeof value === "number" ? value : 0;
    scope.env[node.name] =
      (typeof current === "number" ? current : 0) + numValue;
  }
  return 0;
}

function evalDerefAssign(node: DerefAssignStatement, scopes: Scope[]): number {
  const refVal = evaluateExpr(node.target, scopes);
  if (!isRefValue(refVal)) {
    throw new RuntimeError("cannot assign to non-reference value", node.loc);
  }
  if (!refVal.mutable) {
    throw new RuntimeError(
      "cannot assign through immutable reference",
      node.loc,
    );
  }
  const scope = findScope(refVal.name, scopes);
  if (!scope) {
    throw new RuntimeError(`undefined identifier: ${refVal.name}`, node.loc);
  }
  const value = evaluateExpr(node.value, scopes);
  scope.env[refVal.name] = typeof value === "number" ? value : 0;
  return 0;
}

function evalStructDef(node: StructDefStatement, scopes: Scope[]): number {
  const scope = scopes[scopes.length - 1]!;
  if (node.name in scope.structs) {
    throw new RuntimeError(`duplicate struct: ${node.name}`, node.loc);
  }
  scope.structs[node.name] = node.fields;
  return 0;
}

function evalStructLiteral(node: StructLiteral, scopes: Scope[]): StructValue {
  const scope = scopes[scopes.length - 1]!;
  const structDef = scope.structs[node.structName];
  if (!structDef) {
    throw new RuntimeError(`undefined struct: ${node.structName}`, node.loc);
  }
  validateStructFields(node, structDef);
  return buildStructFields(node, structDef, scopes);
}

function validateStructFields(
  node: StructLiteral,
  structDef: { name: string; typeAnnotation: Type | null }[],
): void {
  const definedFields = new Set(structDef.map((f) => f.name));
  const providedFields = new Set(node.fields.map((f) => f.name));
  for (const field of providedFields) {
    if (!definedFields.has(field)) {
      const fieldLoc = node.fields.find((f) => f.name === field)?.loc;
      throw new RuntimeError(
        `unknown field "${field}" in ${node.structName} literal`,
        fieldLoc,
      );
    }
  }
  for (const field of definedFields) {
    if (!providedFields.has(field)) {
      throw new RuntimeError(
        `missing field "${field}" in ${node.structName} literal`,
        node.loc,
      );
    }
  }
}

function buildStructFields(
  node: StructLiteral,
  structDef: { name: string; typeAnnotation: Type | null }[],
  scopes: Scope[],
): StructValue {
  const fields: StructValue = {};
  for (const field of node.fields) {
    const val = evaluateExpr(field.value, scopes);
    const defField = structDef.find((f) => f.name === field.name);
    if (defField && defField.typeAnnotation) {
      const valType = inferExprType(field.value, scopes);
      checkTypeCompatibility(valType, defField.typeAnnotation, field.loc);
    }
    fields[field.name] = toNumberOrStruct(val);
  }
  return fields;
}

function toNumberOrStruct(
  val: number | StructValue | RefValue,
): number | StructValue {
  if (typeof val === "number") return val;
  if (isRefValue(val)) return 0;
  return val;
}

function evalFieldAccess(
  node: FieldAccess,
  scopes: Scope[],
): number | StructValue {
  const obj = evaluateExpr(node.object, scopes);
  if (isRefValue(obj)) {
    throw new RuntimeError(
      `cannot access field ${node.field} on reference value`,
      node.loc,
    );
  }
  if (typeof obj === "object" && obj !== null) {
    const val = (obj as StructValue)[node.field];
    if (val === undefined)
      throw new RuntimeError(
        `field ${node.field} not found on struct`,
        node.loc,
      );
    return val;
  }
  throw new RuntimeError(
    `cannot access field ${node.field} on non-struct value`,
    node.loc,
  );
}

function evalBlock(node: BlockStatement, scopes: Scope[]): number {
  scopes.push(createScope());
  let result = 0;
  for (const stmt of node.body) {
    result = evaluateStatement(stmt, scopes);
  }
  scopes.pop();
  return result;
}

function evalIf(node: IfStatement, scopes: Scope[]): number {
  const condType = inferExprType(node.condition, scopes);
  if (!condType || !typeEquals(condType, { kind: "bool" })) {
    throw new TypeError("if condition must be Bool", node.loc);
  }
  const condition = evaluateExpr(node.condition, scopes);
  if (condition) {
    return evaluateStatement(node.thenBranch, scopes);
  } else if (node.elseBranch) {
    return evaluateStatement(node.elseBranch, scopes);
  }
  return 0;
}

function evalWhile(node: WhileStatement, scopes: Scope[]): number {
  const condType = inferExprType(node.condition, scopes);
  if (!condType || !typeEquals(condType, { kind: "bool" })) {
    throw new TypeError("while condition must be Bool", node.loc);
  }
  while (evaluateExpr(node.condition, scopes)) {
    evaluateStatement(node.body, scopes);
  }
  return 0;
}

function validateMutableTarget(
  name: string,
  scopes: Scope[],
  loc?: Position,
): Scope {
  if (!lookup(name, scopes)) {
    throw new RuntimeError(`undefined identifier: ${name}`, loc);
  }
  const scope = findScope(name, scopes);
  if (!scope || !scope.mutable.has(name)) {
    throw new RuntimeError(`cannot assign to immutable variable: ${name}`, loc);
  }
  return scope;
}

export function evaluateExpr(
  node: Expr,
  scopes: Scope[],
): number | StructValue | RefValue {
  switch (node.type) {
    case "NumberLiteral":
    case "BooleanLiteral":
      return evalLiteral(node);
    case "Identifier":
      return evalIdentifier(node, scopes);
    case "BinaryExpr":
      return evalBinary(node, scopes);
    case "CallExpr":
      return evalCall(node, scopes);
    case "StructLiteral":
    case "FieldAccess":
      return evalStructOrField(node, scopes);
    case "RefExpr":
    case "DerefExpr":
      return evalRefOrDeref(node, scopes);
  }
}

function evalLiteral(
  node: NumberLiteral | BooleanLiteral,
): number | StructValue {
  if (node.type === "NumberLiteral") return node.value;
  return node.value ? 1 : 0;
}

function evalRefOrDeref(
  node: RefExpr | DerefExpr,
  scopes: Scope[],
): number | StructValue | RefValue {
  if (node.type === "RefExpr") return evalRefExpr(node, scopes);
  return evalDerefExpr(node, scopes);
}

function evalStructOrField(
  node: StructLiteral | FieldAccess,
  scopes: Scope[],
): number | StructValue | RefValue {
  if (node.type === "StructLiteral") return evalStructLiteral(node, scopes);
  return evalFieldAccess(node, scopes);
}

function evalIdentifier(
  node: Identifier,
  scopes: Scope[],
): number | StructValue | RefValue {
  const value = lookupValue(node.name, scopes);
  if (value !== undefined) return value;
  throw new RuntimeError(`undefined identifier: ${node.name}`, node.loc);
}

function evalRefExpr(node: RefExpr, scopes: Scope[]): RefValue {
  const operand = node.operand;
  if (operand.type !== "Identifier") {
    throw new RuntimeError(
      "can only take reference of an identifier",
      node.loc,
    );
  }
  const name = operand.name;
  const val = lookupValue(name, scopes);
  if (val === undefined) {
    throw new RuntimeError(`undefined identifier: ${name}`, node.loc);
  }
  if (node.mutable) {
    const scope = findScope(name, scopes);
    if (!scope || !scope.mutable.has(name)) {
      throw new RuntimeError(
        `cannot take mutable reference to immutable variable: ${name}`,
        node.loc,
      );
    }
  }
  return { __ref: true, name, mutable: node.mutable };
}

function evalDerefExpr(node: DerefExpr, scopes: Scope[]): number | StructValue {
  const val = evaluateExpr(node.operand, scopes);
  if (isRefValue(val)) {
    const scope = findScope(val.name, scopes);
    if (scope) {
      const stored = scope.env[val.name];
      if (stored !== undefined && !isRefValue(stored)) return stored;
    }
  }
  return typeof val === "number" ? val : 0;
}

function evalCall(node: CallExpr, scopes: Scope[]): number {
  const funcInfo = lookupFunctionInfo(node.name, scopes);
  if (funcInfo === null)
    throw new RuntimeError(`undefined function: ${node.name}`, node.loc);
  const callScope: Scope = createScope();
  for (let i = 0; i < funcInfo.params.length; i++) {
    const param = funcInfo.params[i]!;
    const argType = inferExprType(node.arguments[i]!, scopes);
    checkTypeCompatibility(argType, param.typeAnnotation, node.loc);
    let argValue = evaluateExpr(node.arguments[i]!, scopes);
    if (isRefValue(argValue)) {
      const scope = findScope(argValue.name, scopes);
      if (scope) {
        const stored = scope.env[argValue.name];
        if (stored !== undefined && !isRefValue(stored)) {
          argValue = stored;
        }
      }
    }
    callScope.env[param.name] = argValue;
    callScope.types[param.name] = param.typeAnnotation;
  }
  scopes.push(callScope);
  const result = evaluateExpr(funcInfo.body, scopes);
  scopes.pop();
  return typeof result === "number" ? result : 0;
}

function evalBinary(node: BinaryExpr, scopes: Scope[]): number {
  const left = evaluateExpr(node.left, scopes);
  const right = evaluateExpr(node.right, scopes);
  return applyOp(
    node.op,
    typeof left === "number" ? left : 0,
    typeof right === "number" ? right : 0,
  );
}

function applyOp(op: string, left: number, right: number): number {
  if (op === "+") return left + right;
  if (op === "-") return left - right;
  if (op === "*") return left * right;
  if (op === "/") return left / right;
  if (op === "||") return left || right;
  if (op === "&&") return left && right;
  return compareOp(op, left, right);
}

function compareOp(op: string, left: number, right: number): number {
  if (op === "<") return left < right ? 1 : 0;
  if (op === ">") return left > right ? 1 : 0;
  if (op === "<=") return left <= right ? 1 : 0;
  if (op === ">=") return left >= right ? 1 : 0;
  return compareEquality(op, left, right);
}

function compareEquality(op: string, left: number, right: number): number {
  if (op === "==") return left == right ? 1 : 0;
  if (op === "!=") return left != right ? 1 : 0;
  throw new RuntimeError(`unknown operator: ${op}`);
}
