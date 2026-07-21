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
  StringLiteral,
  Identifier,
  StructValue,
  RefValue,
  ArrayValue,
  ArrayLiteral,
  IndexAccess,
  LengthAccess,
  ClosureExpr,
  ClosureValue,
  BlockExpr,
  Position,
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
import {
  isRefValue,
  isArrayValue,
  isClosureValue,
  type ClosureEnvValue,
} from "./ast";
import type { Type } from "./types";
import { typeEquals, isArrayType } from "./types";

// The core result type for expression evaluation.
// This includes all possible runtime values the interpreter can produce.
type EvalResult =
  number | string | StructValue | RefValue | ArrayValue | ClosureValue;

/** Convert an EvalResult to a number (used only at the top level). */
function toNumber(val: EvalResult): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    throw new RuntimeError("cannot return string value as program result");
  }
  return 0;
}

/** Convert an EvalResult to a number or struct/array (for storage in structs). */
function toNumberOrStruct(val: EvalResult): number | StructValue | ArrayValue {
  if (typeof val === "number") return val;
  if (isRefValue(val)) return 0;
  if (isClosureValue(val)) return 0;
  return val;
}

export function evaluateProgram(node: Program, scopes: Scope[]): number {
  let result = 0;
  for (const stmt of node.body) {
    const val = evaluateStatement(stmt, scopes);
    result = toNumber(val);
  }
  return result;
}

// -- Statement evaluation --

function evaluateStatement(node: Statement, scopes: Scope[]): EvalResult {
  if (isDefStatement(node)) return evalDef(node, scopes);
  if (isAssignStatement(node)) return evalAssign(node, scopes);
  return evalControl(node, scopes);
}

function isDefStatement(
  node: Statement,
): node is FunctionDefStatement | StructDefStatement {
  return (
    node.type === "FunctionDefStatement" || node.type === "StructDefStatement"
  );
}

function evalDef(
  node: FunctionDefStatement | StructDefStatement,
  scopes: Scope[],
): EvalResult {
  if (node.type === "FunctionDefStatement") return evalFuncDef(node, scopes);
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

function evalAssign(
  node: AssignStatement | CompoundAssignStatement | DerefAssignStatement,
  scopes: Scope[],
): EvalResult {
  if (node.type === "AssignStatement") return evalSimpleAssign(node, scopes);
  if (node.type === "CompoundAssignStatement")
    return evalCompoundAssign(node, scopes);
  return evalDerefAssign(node, scopes);
}

function evalControl(node: Statement, scopes: Scope[]): EvalResult {
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

// -- Statement evaluators --

function evalFuncDef(node: FunctionDefStatement, scopes: Scope[]): EvalResult {
  const scope = scopes[scopes.length - 1]!;
  scope.functions[node.name] = { body: node.body, params: node.params };
  scope.functionReturnTypes[node.name] = node.returnAnnotation;
  if (node.returnAnnotation) {
    const srcType = inferExprType(node.body, scopes);
    checkTypeCompatibility(srcType, node.returnAnnotation, node.loc);
  }
  return 0;
}

function evalExprStmt(node: ExprStatement, scopes: Scope[]): EvalResult {
  const result = evaluateExpr(node.expression, scopes);
  if (isArrayValue(result)) {
    throw new RuntimeError(
      "array values cannot be used as final expression",
      node.loc,
    );
  }
  if (isClosureValue(result)) {
    throw new RuntimeError(
      "closure values cannot be used as final expression",
      node.loc,
    );
  }
  return result;
}

function evalLet(node: LetStatement, scopes: Scope[]): EvalResult {
  const value = evaluateExpr(node.value, scopes);
  const srcType = inferExprType(node.value, scopes);
  checkTypeCompatibility(srcType, node.typeAnnotation, node.loc);
  if (typeof value === "number")
    validateTypeRange(value, node.typeAnnotation, node.loc);
  if (
    node.typeAnnotation &&
    isArrayType(node.typeAnnotation) &&
    isArrayValue(value)
  ) {
    validateArrayElements(value, node.typeAnnotation, scopes, node.loc);
  }
  const scope = scopes[scopes.length - 1]!;
  scope.env[node.name] = value;
  scope.types[node.name] = node.typeAnnotation ?? srcType;
  if (node.mutable) scope.mutable.add(node.name);
  return 0;
}

function validateArrayElements(
  arr: ArrayValue,
  arrayType: Type,
  scopes: Scope[],
  loc?: { line: number; col: number },
): void {
  if (arrayType.kind !== "array") return;
  for (let i = 0; i < arr.length; i++) {
    const elem = arr[i]!;
    if (typeof elem === "number") {
      validateTypeRange(elem, arrayType.elementType, loc);
    }
  }
}

function evalSimpleAssign(node: AssignStatement, scopes: Scope[]): EvalResult {
  const scope = validateMutableTarget(node.name, scopes, node.loc);
  const srcType = inferExprType(node.value, scopes);
  const dstType = scope.types[node.name] ?? null;
  checkTypeCompatibility(srcType, dstType, node.loc);
  const value = evaluateExpr(node.value, scopes);
  scope.env[node.name] = value;
  return 0;
}

function evalCompoundAssign(
  node: CompoundAssignStatement,
  scopes: Scope[],
): EvalResult {
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

function evalDerefAssign(
  node: DerefAssignStatement,
  scopes: Scope[],
): EvalResult {
  const refVal = evaluateExpr(node.target, scopes);
  if (node.target.type === "IndexAccess") {
    return evalIndexAssign(node, scopes);
  }
  return evalRefAssign(refVal, node, scopes);
}

function evalRefAssign(
  refVal: EvalResult,
  node: DerefAssignStatement,
  scopes: Scope[],
): EvalResult {
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
  scope.env[refVal.name] = value;
  return 0;
}

function evalIndexAssign(
  node: DerefAssignStatement,
  scopes: Scope[],
): EvalResult {
  const indexNode = node.target;
  if (indexNode.type !== "IndexAccess") {
    throw new RuntimeError("invalid assignment target", node.loc);
  }
  const objExpr = indexNode.object;
  const objName = objExpr.type === "Identifier" ? objExpr.name : "";
  const scope = findScope(objName, scopes);
  if (!scope) {
    throw new RuntimeError(`undefined identifier: ${objName}`, indexNode.loc);
  }
  if (!scope.mutable.has(objName)) {
    throw new RuntimeError(
      `cannot assign to immutable variable: ${objName}`,
      indexNode.loc,
    );
  }
  const objVal = scope.env[objName];
  if (!isArrayValue(objVal)) {
    throw new RuntimeError("cannot index non-array value", indexNode.loc);
  }
  const index = evaluateExpr(indexNode.index, scopes);
  const idx = typeof index === "number" ? index : 0;
  if (idx < 0 || idx >= objVal.length) {
    throw new RuntimeError(`array index out of bounds: ${idx}`, indexNode.loc);
  }
  const value = evaluateExpr(node.value, scopes);
  objVal[idx] = toNumberOrStruct(value);
  return 0;
}

function evalStructDef(node: StructDefStatement, scopes: Scope[]): EvalResult {
  const scope = scopes[scopes.length - 1]!;
  if (node.name in scope.structs) {
    throw new RuntimeError(`duplicate struct: ${node.name}`, node.loc);
  }
  scope.structs[node.name] = node.fields;
  return 0;
}

function evalBlock(node: BlockStatement, scopes: Scope[]): EvalResult {
  return evalStmtList(node.body, scopes);
}

function evalStmtList(stmts: Statement[], scopes: Scope[]): EvalResult {
  scopes.push(createScope());
  let result: EvalResult = 0;
  for (const stmt of stmts) {
    result = evaluateStatement(stmt, scopes);
  }
  scopes.pop();
  return result;
}

function checkBoolCondition(
  condition: Expr,
  scopes: Scope[],
  loc?: { line: number; col: number },
): void {
  const condType = inferExprType(condition, scopes);
  if (!condType || !typeEquals(condType, { kind: "bool" })) {
    throw new TypeError("condition must be Bool", loc);
  }
}

function evalIf(node: IfStatement, scopes: Scope[]): EvalResult {
  checkBoolCondition(node.condition, scopes, node.loc);
  const condition = evaluateExpr(node.condition, scopes);
  if (condition) {
    return evaluateStatement(node.thenBranch, scopes);
  } else if (node.elseBranch) {
    return evaluateStatement(node.elseBranch, scopes);
  }
  return 0;
}

function evalWhile(node: WhileStatement, scopes: Scope[]): EvalResult {
  checkBoolCondition(node.condition, scopes, node.loc);
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

// -- Expression evaluation --

export function evaluateExpr(node: Expr, scopes: Scope[]): EvalResult {
  if (isLiteral(node)) return evalLiteral(node);
  if (isSimpleExpr(node)) return evalSimple(node, scopes);
  return evalComplex(node, scopes);
}

function isLiteral(
  node: Expr,
): node is NumberLiteral | BooleanLiteral | StringLiteral {
  return (
    node.type === "NumberLiteral" ||
    node.type === "BooleanLiteral" ||
    node.type === "StringLiteral"
  );
}

function isSimpleExpr(node: Expr): node is Identifier | BinaryExpr | CallExpr {
  return (
    node.type === "Identifier" ||
    node.type === "BinaryExpr" ||
    node.type === "CallExpr"
  );
}

function evalComplex(
  node:
    | StructLiteral
    | FieldAccess
    | RefExpr
    | DerefExpr
    | UnaryExpr
    | ArrayLiteral
    | IndexAccess
    | LengthAccess
    | ClosureExpr
    | BlockExpr,
  scopes: Scope[],
): EvalResult {
  if (node.type === "StructLiteral") return evalStructLit(node, scopes);
  if (node.type === "FieldAccess") return evalFieldAcc(node, scopes);
  if (node.type === "RefExpr") return evalRef(node, scopes);
  if (node.type === "DerefExpr") return evalDeref(node, scopes);
  if (node.type === "ArrayLiteral") return evalArrayLit(node, scopes);
  if (node.type === "IndexAccess") return evalIndex(node, scopes);
  if (node.type === "LengthAccess") return evalLength(node, scopes);
  if (node.type === "ClosureExpr") return evalClosure(node, scopes);
  if (node.type === "BlockExpr") return evalBlockExpr(node, scopes);
  return evalUnary(node, scopes);
}

// -- Block expression --

function evalBlockExpr(node: BlockExpr, scopes: Scope[]): EvalResult {
  return evalStmtList(node.body, scopes);
}

// -- Closure --

function evalClosure(node: ClosureExpr, scopes: Scope[]): ClosureValue {
  const capturedScopes = scopes.slice();
  let snapshotEnv: Record<string, ClosureEnvValue> | undefined;
  if (node.captureMode === "move") {
    snapshotEnv = buildSnapshot(capturedScopes);
  }
  return {
    __closure: true,
    params: node.params,
    body: node.body,
    capturedScopes,
    captureMode: node.captureMode,
    snapshotEnv,
  };
}

function buildSnapshot(scopes: Scope[]): Record<string, ClosureEnvValue> {
  const snapshot: Record<string, ClosureEnvValue> = {};
  for (const scope of scopes) {
    for (const [name, value] of Object.entries(scope.env)) {
      if (!(name in snapshot)) {
        snapshot[name] = value;
      }
    }
  }
  return snapshot;
}

function evalClosureCall(
  closure: ClosureValue,
  args: Expr[],
  scopes: Scope[],
): EvalResult {
  if (args.length !== closure.params.length) {
    throw new RuntimeError(
      `closure expects ${closure.params.length} arguments, got ${args.length}`,
    );
  }
  const callScope = createScope();
  for (let i = 0; i < closure.params.length; i++) {
    const param = closure.params[i]!;
    const argValue = evaluateExpr(args[i]!, scopes);
    callScope.env[param.name] = argValue;
    callScope.types[param.name] = param.typeAnnotation;
  }
  const newScopes = buildClosureScopes(closure, callScope);
  return evaluateExpr(closure.body, newScopes);
}

function buildClosureScopes(closure: ClosureValue, callScope: Scope): Scope[] {
  if (closure.captureMode === "move") {
    const snapshotScope: Scope = createScope();
    snapshotScope.env = { ...(closure.snapshotEnv || {}) };
    return [snapshotScope, callScope];
  }
  return [...closure.capturedScopes, callScope];
}

// -- Struct --

function evalStructLit(node: StructLiteral, scopes: Scope[]): StructValue {
  const scope = scopes[scopes.length - 1]!;
  const structDef = scope.structs[node.structName];
  if (!structDef) {
    throw new RuntimeError(`undefined struct: ${node.structName}`, node.loc);
  }
  validateStructFields(node, structDef);
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

// -- Field access --

function evalFieldAcc(
  node: FieldAccess,
  scopes: Scope[],
): number | StructValue | ArrayValue {
  const obj = evaluateExpr(node.object, scopes);
  if (isRefValue(obj)) {
    throw new RuntimeError(
      `cannot access field ${node.field} on reference value`,
      node.loc,
    );
  }
  if (isClosureValue(obj)) {
    throw new RuntimeError(
      `cannot access field ${node.field} on closure value`,
      node.loc,
    );
  }
  if (isArrayValue(obj)) {
    throw new RuntimeError(
      `cannot access field ${node.field} on array value`,
      node.loc,
    );
  }
  if (typeof obj === "object" && obj !== null && !isArrayValue(obj)) {
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

// -- Array --

function evalArrayLit(node: ArrayLiteral, scopes: Scope[]): ArrayValue {
  const elements: ArrayValue = [];
  for (const elem of node.elements) {
    const val = evaluateExpr(elem, scopes);
    elements.push(toNumberOrStruct(val));
  }
  return elements;
}

function evalIndex(node: IndexAccess, scopes: Scope[]): EvalResult {
  const obj = evaluateExpr(node.object, scopes);
  if (typeof obj === "string") {
    const index = evaluateExpr(node.index, scopes);
    const idx = typeof index === "number" ? index : 0;
    if (idx < 0 || idx >= obj.length) {
      throw new RuntimeError(`string index out of bounds: ${idx}`, node.loc);
    }
    return obj.codePointAt(idx) ?? 0;
  }
  if (!isArrayValue(obj)) {
    throw new RuntimeError("cannot index non-array value", node.loc);
  }
  const index = evaluateExpr(node.index, scopes);
  const idx = typeof index === "number" ? index : 0;
  if (idx < 0 || idx >= obj.length) {
    throw new RuntimeError(`array index out of bounds: ${idx}`, node.loc);
  }
  return obj[idx]!;
}

function evalLength(node: LengthAccess, scopes: Scope[]): number {
  const obj = evaluateExpr(node.object, scopes);
  if (typeof obj === "string") {
    return obj.length;
  }
  if (!isArrayValue(obj)) {
    throw new RuntimeError("cannot access length of non-array value", node.loc);
  }
  return obj.length;
}

// -- Simple expressions --

function evalSimple(
  node: Identifier | BinaryExpr | CallExpr,
  scopes: Scope[],
): EvalResult {
  if (node.type === "Identifier") return evalIdent(node, scopes);
  if (node.type === "BinaryExpr") return evalBinary(node, scopes);
  return evalCall(node, scopes);
}

function evalIdent(node: Identifier, scopes: Scope[]): EvalResult {
  const value = lookupValue(node.name, scopes);
  if (value !== undefined) return value;
  throw new RuntimeError(`undefined identifier: ${node.name}`, node.loc);
}

function evalBinary(node: BinaryExpr, scopes: Scope[]): number {
  const left = evaluateExpr(node.left, scopes);
  const right = evaluateExpr(node.right, scopes);
  const leftStr = typeof left === "string" ? left : null;
  const rightStr = typeof right === "string" ? right : null;
  if (leftStr !== null && rightStr !== null) {
    return applyStringOp(node.op, leftStr, rightStr);
  }
  if (leftStr !== null || rightStr !== null) {
    throw new RuntimeError(
      "strings cannot be used with arithmetic operators",
      node.loc,
    );
  }
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
  return compareEq(op, left, right);
}

function compareEq(op: string, left: number, right: number): number {
  if (op === "==") return left == right ? 1 : 0;
  if (op === "!=") return left != right ? 1 : 0;
  throw new RuntimeError(`unknown operator: ${op}`);
}

function applyStringOp(op: string, left: string, right: string): number {
  if (isEqualityOp(op)) return applyStringEquality(op, left, right);
  if (isOrderingOp(op)) return applyStringOrdering(op, left, right);
  throw new RuntimeError(`unknown operator: ${op}`);
}

function isEqualityOp(op: string): boolean {
  return op === "==" || op === "!=";
}

function isOrderingOp(op: string): boolean {
  return op === "<" || op === ">" || op === "<=" || op === ">=";
}

function applyStringEquality(op: string, left: string, right: string): number {
  if (op === "==") return left === right ? 1 : 0;
  return left !== right ? 1 : 0;
}

function applyStringOrdering(op: string, left: string, right: string): number {
  if (op === "<") return left < right ? 1 : 0;
  if (op === ">") return left > right ? 1 : 0;
  if (op === "<=") return left <= right ? 1 : 0;
  return left >= right ? 1 : 0;
}

// -- Call --

function evalCall(node: CallExpr, scopes: Scope[]): EvalResult {
  const calleeValue = lookupValue(node.name, scopes);
  if (isClosureValue(calleeValue)) {
    return evalClosureCall(calleeValue, node.arguments, scopes);
  }
  return evalNamedCall(node, scopes);
}

function evalNamedCall(node: CallExpr, scopes: Scope[]): EvalResult {
  const funcInfo = lookupFunctionInfo(node.name, scopes);
  if (funcInfo === null)
    throw new RuntimeError(`undefined function: ${node.name}`, node.loc);
  const callScope = createScope();
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
  return result;
}

// -- Unary --

function evalUnary(
  node: UnaryExpr,
  scopes: Scope[],
): number | StructValue | RefValue {
  const operand = evaluateExpr(node.operand, scopes);
  const numVal = typeof operand === "number" ? operand : 0;
  return -numVal;
}

// -- Literal --

function evalLiteral(
  node: NumberLiteral | BooleanLiteral | StringLiteral,
): EvalResult {
  if (node.type === "NumberLiteral") return node.value;
  if (node.type === "StringLiteral") return node.value;
  return node.value ? 1 : 0;
}

// -- Ref / Deref --

function evalRef(node: RefExpr, scopes: Scope[]): RefValue {
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

function evalDeref(node: DerefExpr, scopes: Scope[]): number | StructValue {
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
