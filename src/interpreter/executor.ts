/* eslint-disable max-lines, complexity, max-lines-per-function, no-restricted-syntax, @typescript-eslint/no-var-requires, no-constant-condition, @typescript-eslint/no-unused-vars */
/**
 * AST-based Executor for Tuff Language.
 * Evaluates AST nodes against an environment.
 */

import type { Env, EnvItem, FunctionValue, ArrayValue, SliceValue, StructValue } from "./types";
import type {
  ASTExpr,
  ASTStmt,
  ASTProgram,
  ASTBinaryOp,
  ASTBlockExpr,
  ASTIfExpr,
  ASTMatchExpr,
  ASTTypeExpr,
} from "./astTypes";
import { blockShadow } from "./env";
import {
  resolveTypeAlias,
  getLinearDestructor,
  setLinearDestructor,
  setTypeAlias,
  cloneTypeAliasMap,
  assertCanMoveBinding,
  assertCanAssignBinding,
  releaseBorrow,
  registerBorrow,
  isIdentifierName,
} from "./shared";
import { validateNumberSuffix } from "./numbers";
import { ReturnValue, isReturnValue } from "./returns";
import { YieldValue, BreakException, ContinueException, isYieldValue, isBreakException, isContinueException } from "./statements";
import { isArrayValue, isSliceValue, parseArrayType } from "./arrays";
import { isPointerValue, findSlicesReferencing } from "./pointers";
import { isStructValue, getStructDef, registerStruct } from "./structs";
import { isTypeCompatible } from "./signatures";

// ============================================================================
// Program Execution
// ============================================================================

export function executeProgram(program: ASTProgram, env?: Env): unknown {
  const execEnv = env ?? new Map<string, EnvItem>();
  let lastValue: unknown = NaN;

  for (const stmt of program.statements) {
    try {
      executeStatement(stmt, execEnv);
      // Check if we need a value from expression statement
      if (stmt.kind === "expr-stmt") {
        lastValue = evaluateExpression(stmt.expr, execEnv);
      }
    } catch (e) {
      if (isReturnValue(e)) throw new Error("Return used outside function");
      if (isYieldValue(e)) {
        return (e as YieldValue).value;
      }
      throw e;
    }
  }

  return lastValue;
}

// ============================================================================
// Statement Execution
// ============================================================================

export function executeStatement(stmt: ASTStmt, env: Env): void {
  switch (stmt.kind) {
    case "let-stmt":
      executeLetStatement(stmt, env);
      break;
    case "fn-stmt":
      executeFnStatement(stmt, env);
      break;
    case "struct-stmt":
      executeStructStatement(stmt);
      break;
    case "type-stmt":
      executeTypeStatement(stmt, env);
      break;
    case "assign-stmt":
      executeAssignStatement(stmt, env);
      break;
    case "compound-assign-stmt":
      executeCompoundAssignStatement(stmt, env);
      break;
    case "if-stmt":
      executeIfStatement(stmt, env);
      break;
    case "while-stmt":
      executeWhileStatement(stmt, env);
      break;
    case "for-stmt":
      executeForStatement(stmt, env);
      break;
    case "return-stmt":
      throw new ReturnValue(stmt.value ? evaluateExpression(stmt.value, env) : NaN);
    case "yield-stmt":
      throw new YieldValue(evaluateExpression(stmt.value, env));
    case "break-stmt":
      throw new BreakException();
    case "continue-stmt":
      throw new ContinueException();
    case "expr-stmt":
      evaluateExpression(stmt.expr, env);
      break;
    default: {
      const _exhaustive: never = stmt;
      throw new Error(`Unknown statement kind: ${(_exhaustive as ASTStmt).kind}`);
    }
  }
}

// ============================================================================
// Let Statement
// ============================================================================

function executeLetStatement(
  stmt: { kind: "let-stmt"; name: string; mutable: boolean; typeAnnotation: ASTTypeExpr | null; initializer: ASTExpr | null },
  env: Env
): void {
  const name = stmt.name;
  const mutable = stmt.mutable;
  const typeAnnotation = stmt.typeAnnotation ? typeExprToString(stmt.typeAnnotation) : undefined;

  if (!stmt.initializer) {
    // Uninitialized declaration
    if (typeAnnotation?.startsWith("[")) {
      const { elementType, initializedCount, length } = parseArrayType(typeAnnotation);
      if (initializedCount !== 0) {
        throw new Error(`Array declaration without initializer must have init=0, got ${typeAnnotation}`);
      }
      if (!mutable) {
        throw new Error("Array with init=0 must be mutable (use 'let mut')");
      }
      const arrayVal: ArrayValue = {
        type: "Array",
        elementType,
        elements: new Array(length).fill(0),
        length,
        initializedCount: 0,
      };
      env.set(name, { value: arrayVal, mutable, type: typeAnnotation });
      return;
    }

    env.set(name, { value: NaN, mutable: typeAnnotation ? mutable : true, type: typeAnnotation });
    return;
  }

  // Handle struct literal with type annotation
  if (typeAnnotation) {
    const structBase = typeAnnotation.includes("<")
      ? typeAnnotation.slice(0, typeAnnotation.indexOf("<")).trim()
      : typeAnnotation;

    if (getStructDef(typeAnnotation) || getStructDef(structBase)) {
      // Struct literal handling - need to evaluate the initializer expressions
      if (stmt.initializer.kind === "struct-literal") {
        const fieldValues = stmt.initializer.fields.map(f => evaluateExpression(f, env));
        const def = getStructDef(structBase) ?? getStructDef(typeAnnotation);
        if (!def) throw new Error(`Unknown struct: ${typeAnnotation}`);
        if (fieldValues.length !== def.fieldNames.length) {
          throw new Error(`Struct ${typeAnnotation} expects ${def.fieldNames.length} fields, got ${fieldValues.length}`);
        }
        const structVal: StructValue = {
          fields: def.fieldNames,
          values: fieldValues,
        };
        env.set(name, { value: structVal as EnvItem["value"], mutable, type: typeAnnotation });
        return;
      }
    }

    // Array literal
    if (typeAnnotation.startsWith("[") && stmt.initializer.kind === "array-literal") {
      const { elementType, initializedCount, length } = parseArrayType(typeAnnotation);
      const elements = stmt.initializer.elements.map(e => {
        const v = evaluateExpression(e, env);
        if (typeof v !== "number") throw new Error("Array element must be a number");
        return v as number;
      });

      if (initializedCount === length && elements.length !== length) {
        throw new Error(`Array literal must have exactly ${length} elements for type ${typeAnnotation}`);
      }

      const arrayVal: ArrayValue = {
        type: "Array",
        elementType,
        elements,
        length,
        initializedCount: elements.length,
      };
      env.set(name, { value: arrayVal, mutable, type: typeAnnotation });
      return;
    }

    // Pointer initializer
    if (typeAnnotation.startsWith("*") && stmt.initializer.kind === "address-of") {
      handlePointerInit(stmt, env, typeAnnotation, name, mutable);
      return;
    }
  }

  // Regular initializer
  const value = evaluateExpression(stmt.initializer, env);
  const inferredType = typeAnnotation ?? inferType(stmt.initializer, env);

  if (typeAnnotation) {
    validateTypeCompatibility(typeAnnotation, inferredType, env);
  }

  env.set(name, { value: value as EnvItem["value"], mutable, type: typeAnnotation ?? inferredType, moved: false });
}

function handlePointerInit(
  stmt: { kind: "let-stmt"; name: string; mutable: boolean; typeAnnotation: ASTTypeExpr | null; initializer: ASTExpr | null },
  env: Env,
  typeAnnotation: string,
  name: string,
  mutable: boolean
): void {
  const init = stmt.initializer as { kind: "address-of"; operand: ASTExpr; mutable: boolean };
  if (init.operand.kind !== "identifier") throw new Error("Address-of must reference an identifier");
  const targetName = init.operand.name;

  if (!env.has(targetName)) throw new Error("Unknown identifier");
  const targetItem = env.get(targetName)!;
  if (targetItem.moved) throw new Error("Use-after-move");

  // Validate pointer mutability
  if (init.mutable && !targetItem.mutable) {
    throw new Error("Cannot take mutable reference to immutable variable");
  }

  const resolvedAnnotation = resolveTypeAlias(typeAnnotation, env);
  let pointeeMutable = false;
  let pointeeType = "";

  if (resolvedAnnotation.startsWith("*")) {
    let rest = resolvedAnnotation.slice(1).trim();
    if (rest.startsWith("mut ")) {
      pointeeMutable = true;
      rest = rest.slice(4).trim();
    }
    pointeeType = rest;

    // Check for slice creation
    if (pointeeType.startsWith("[")) {
      createSliceBinding(targetName, env, pointeeMutable, init.mutable, name, typeAnnotation);
      return;
    }

    // Validate pointer type matches
    const targetType = targetItem.type ?? "I32";
    if (resolveTypeAlias(pointeeType, env) !== resolveTypeAlias(targetType, env)) {
      throw new Error("Pointer type mismatch");
    }

    if (pointeeMutable !== init.mutable) {
      throw new Error("Pointer mutability mismatch");
    }
  }

  const ptr = {
    type: "Pointer" as const,
    env,
    name: targetName,
    pointeeType: pointeeType || targetItem.type,
    pointeeMutable: init.mutable,
  };

  registerBorrow(env, targetName, init.mutable);
  env.set(name, { value: ptr, mutable, type: typeAnnotation });
}

function createSliceBinding(
  targetName: string,
  env: Env,
  annotatedMut: boolean,
  initMut: boolean,
  name: string,
  typeAnnotation: string
): void {
  if (!env.has(targetName)) throw new Error("Unknown identifier");
  const item = env.get(targetName)!;
  if (!isArrayValue(item.value)) throw new Error("Slice initializer must reference an array");

  const arr = item.value as ArrayValue;

  if (annotatedMut) {
    if (!initMut) throw new Error("Pointer mutability mismatch");
    if (!item.mutable) throw new Error("Cannot take mutable reference to immutable variable");
    const existing = findSlicesReferencing(arr, env);
    if (existing.length > 0) throw new Error("Cannot take mutable reference while borrow(s) exist");
  } else {
    const existing = findSlicesReferencing(arr, env);
    if (existing.some(b => b.mutable)) {
      throw new Error("Cannot take immutable slice while mutable borrow exists");
    }
  }

  const slice: SliceValue = {
    type: "Slice",
    elementType: arr.elementType,
    backing: arr,
    start: 0,
    length: arr.length,
    mutable: annotatedMut,
  };

  env.set(name, { value: slice as EnvItem["value"], mutable: false, type: typeAnnotation });
}

// ============================================================================
// Function Statement
// ============================================================================

function executeFnStatement(
  stmt: { kind: "fn-stmt"; name: string; params: { name: string; typeAnnotation: ASTTypeExpr | null }[]; returnType: ASTTypeExpr | null; body: ASTExpr },
  env: Env
): void {
  const params = stmt.params.map(p => p.name);
  const body = astExprToSource(stmt.body);

  const func: FunctionValue = {
    params,
    body,
    env: new Map(env),
  };

  // Build function signature type
  const paramTypes = stmt.params.map(p => p.typeAnnotation ? typeExprToString(p.typeAnnotation) : "I32");
  const returnType = stmt.returnType ? typeExprToString(stmt.returnType) : "I32";
  const sig = `(${paramTypes.join(", ")}) => ${returnType}`;

  const item = { value: func, mutable: false, type: sig };
  
  // Add function to its own captured environment to enable recursion
  func.env.set(stmt.name, item);
  
  // Also add to the main environment
  env.set(stmt.name, item);
}

// ============================================================================
// Struct Statement
// ============================================================================

function executeStructStatement(
  stmt: { kind: "struct-stmt"; name: string; fields: { name: string; typeAnnotation: ASTTypeExpr | null }[]; genericParams: string[] }
): void {
  const fieldNames = stmt.fields.map(f => f.name);
  const fieldTypes = stmt.fields.map(f => f.typeAnnotation ? typeExprToString(f.typeAnnotation) : "I32");

  registerStruct({
    name: stmt.name,
    fieldNames,
    fieldTypes,
    genericParams: stmt.genericParams.length > 0 ? stmt.genericParams : undefined,
  });
}

// ============================================================================
// Type Statement
// ============================================================================

function executeTypeStatement(
  stmt: { kind: "type-stmt"; name: string; aliasOf: ASTTypeExpr; destructor: string | null },
  env: Env
): void {
  const aliasOf = typeExprToString(stmt.aliasOf);
  setTypeAlias(env, stmt.name, aliasOf);

  if (stmt.destructor) {
    if (!isIdentifierName(stmt.destructor)) throw new Error("Invalid type declaration");
    setLinearDestructor(env, stmt.name, stmt.destructor);
  }
}

// ============================================================================
// Assignment Statements
// ============================================================================

function executeAssignStatement(
  stmt: { kind: "assign-stmt"; target: ASTExpr; value: ASTExpr },
  env: Env
): void {
  const value = evaluateExpression(stmt.value, env);

  if (stmt.target.kind === "identifier") {
    const name = stmt.target.name;
    if (!env.has(name)) throw new Error("Unknown identifier");
    const item = env.get(name)!;

    assertCanAssignBinding(env, name);

    if (isArrayValue(item.value)) {
      const existing = findSlicesReferencing(item.value as ArrayValue, env);
      if (existing.length > 0) throw new Error("Cannot reassign array while slices exist");
    }

    if (!item.mutable && !Number.isNaN(item.value as number)) {
      throw new Error("Cannot assign to immutable variable");
    }

    dropLinearIfLive(name, env);

    item.value = value as EnvItem["value"];
    item.moved = false;
    env.set(name, item);
    return;
  }

  if (stmt.target.kind === "deref") {
    executeDerefAssign(stmt.target, value, env);
    return;
  }

  if (stmt.target.kind === "index") {
    executeIndexAssign(stmt.target, value, env);
    return;
  }

  if (stmt.target.kind === "this-field") {
    executeThisFieldAssign(stmt.target, value, env);
    return;
  }

  throw new Error("Invalid assignment target");
}

function executeDerefAssign(
  target: { kind: "deref"; operand: ASTExpr },
  value: unknown,
  env: Env
): void {
  if (target.operand.kind !== "identifier") throw new Error("Cannot dereference complex expression for assignment");
  const ptrName = target.operand.name;
  if (!env.has(ptrName)) throw new Error("Unknown identifier");

  const ptrItem = env.get(ptrName)!;
  if (!isPointerValue(ptrItem.value)) throw new Error("Cannot dereference non-pointer");

  const ptr = ptrItem.value;
  const pointeeItem = ptr.env.get(ptr.name)!;

  if (pointeeItem.moved) throw new Error("Use-after-move");
  if (!ptr.pointeeMutable && !pointeeItem.mutable) {
    throw new Error("Cannot assign through pointer to immutable variable");
  }

  if (typeof value !== "number") throw new Error("Cannot assign non-number through pointer");
  pointeeItem.value = value as number;
  ptr.env.set(ptr.name, pointeeItem);
}

function executeIndexAssign(
  target: { kind: "index"; target: ASTExpr; index: ASTExpr },
  value: unknown,
  env: Env
): void {
  if (target.target.kind !== "identifier") throw new Error("Index assignment requires identifier");
  const arrName = target.target.name;
  if (!env.has(arrName)) throw new Error("Unknown identifier");

  const item = env.get(arrName)!;
  const indexVal = evaluateExpression(target.index, env);
  if (typeof indexVal !== "number") throw new Error("Index must be a number");

  if (isSliceValue(item.value)) {
    const sv = item.value as SliceValue;
    if (!sv.mutable) throw new Error("Cannot assign to slice");

    if (indexVal < 0 || indexVal >= sv.length) {
      throw new Error(`Index out of bounds: ${indexVal} (length: ${sv.length})`);
    }

    const actualIndex = indexVal + sv.start;
    if (actualIndex > sv.backing.initializedCount) {
      throw new Error(`Out-of-order initialization: index ${indexVal} but only ${sv.backing.initializedCount} elements initialized (sequential init required)`);
    }

    if (typeof value !== "number") throw new Error("Assigned value must be a number");
    sv.backing.elements[actualIndex] = value as number;
    if (actualIndex === sv.backing.initializedCount) sv.backing.initializedCount++;
    return;
  }

  if (!isArrayValue(item.value)) throw new Error("Index assignment requires array");
  if (!item.mutable) throw new Error("Cannot assign to immutable array");

  const arr = item.value as ArrayValue;
  if (indexVal < 0 || indexVal >= arr.length) {
    throw new Error(`Index out of bounds: ${indexVal} (length: ${arr.length})`);
  }

  if (indexVal > arr.initializedCount) {
    throw new Error(`Out-of-order initialization: index ${indexVal} but only ${arr.initializedCount} elements initialized (sequential init required)`);
  }

  if (typeof value !== "number") throw new Error("Assigned value must be a number");
  arr.elements[indexVal] = value as number;
  if (indexVal === arr.initializedCount) arr.initializedCount++;
}

function executeThisFieldAssign(
  target: { kind: "this-field"; field: string },
  value: unknown,
  env: Env
): void {
  const name = target.field;
  if (!env.has(name)) throw new Error("Unknown identifier");

  const item = env.get(name)!;
  if (!item.mutable) throw new Error("Cannot assign to immutable variable");

  if (typeof value !== "number") throw new Error("Cannot assign non-number");
  item.value = value as number;
  env.set(name, item);
}

function executeCompoundAssignStatement(
  stmt: { kind: "compound-assign-stmt"; target: ASTExpr; op: string; value: ASTExpr },
  env: Env
): void {
  if (stmt.target.kind !== "identifier") throw new Error("Compound assignment requires identifier");

  const name = stmt.target.name;
  if (!env.has(name)) throw new Error("Unknown identifier");

  const item = env.get(name)!;
  if (typeof item.value !== "number" || Number.isNaN(item.value)) {
    throw new Error("Cannot compound-assign uninitialized or non-number variable");
  }
  if (!item.mutable) throw new Error("Cannot assign to immutable variable");

  const rhs = evaluateExpression(stmt.value, env);
  if (typeof rhs !== "number") throw new Error("Compound assignment requires numeric rhs");

  const op = stmt.op;
  let result: number;
  switch (op) {
    case "+=": result = (item.value as number) + rhs; break;
    case "-=": result = (item.value as number) - rhs; break;
    case "*=": result = (item.value as number) * rhs; break;
    case "/=":
      if (rhs === 0) throw new Error("Division by zero");
      result = Math.trunc((item.value as number) / rhs);
      break;
    default: throw new Error("Unknown compound operator");
  }

  item.value = result;
  env.set(name, item);
}

// ============================================================================
// Control Flow Statements
// ============================================================================

function executeIfStatement(
  stmt: { kind: "if-stmt"; condition: ASTExpr; thenBranch: ASTStmt | ASTBlockExpr; elseBranch: ASTStmt | ASTBlockExpr | null },
  env: Env
): void {
  const cond = evaluateExpression(stmt.condition, env);
  const isTruthy = typeof cond === "number" ? cond !== 0 : Boolean(cond);

  if (isTruthy) {
    executeStatementOrBlock(stmt.thenBranch, env);
  } else if (stmt.elseBranch) {
    executeStatementOrBlock(stmt.elseBranch, env);
  }
}

function executeWhileStatement(
  stmt: { kind: "while-stmt"; condition: ASTExpr; body: ASTStmt | ASTBlockExpr },
  env: Env
): void {
  while (true) {
    const cond = evaluateExpression(stmt.condition, env);
    if (cond === 0 || !cond) break;

    try {
      executeStatementOrBlock(stmt.body, env);
    } catch (e) {
      if (isBreakException(e)) break;
      if (isContinueException(e)) continue;
      throw e;
    }
  }
}

function executeForStatement(
  stmt: { kind: "for-stmt"; varName: string; mutable: boolean; start: ASTExpr; end: ASTExpr; body: ASTStmt | ASTBlockExpr },
  env: Env
): void {
  const startVal = evaluateExpression(stmt.start, env);
  const endVal = evaluateExpression(stmt.end, env);
  if (typeof startVal !== "number" || typeof endVal !== "number") {
    throw new Error("For loop range must be numeric");
  }

  // Create block scope for loop variable
  const loopEnv = new Map(env);
  cloneTypeAliasMap(env, loopEnv);
  blockShadow.set(loopEnv, new Set()); // Empty shadow set - loop var is accessible

  for (let i = startVal; i < endVal; i++) {
    loopEnv.set(stmt.varName, { value: i, mutable: stmt.mutable, type: "I32" });

    try {
      executeStatementOrBlock(stmt.body, loopEnv);
    } catch (e) {
      if (isBreakException(e)) break;
      if (isContinueException(e)) continue;
      throw e;
    }
  }
}

function executeStatementOrBlock(stmtOrBlock: ASTStmt | ASTBlockExpr, env: Env): void {
  if (stmtOrBlock.kind === "block-expr") {
    evaluateBlockExpression(stmtOrBlock, env);
  } else {
    executeStatement(stmtOrBlock, env);
  }
}

// ============================================================================
// Expression Evaluation
// ============================================================================

export function evaluateExpression(expr: ASTExpr, env: Env): unknown {
  switch (expr.kind) {
    case "number": {
      const val = expr.value;
      if (expr.suffix) {
        validateNumberSuffix(expr.suffix, val, String(val));
      }
      return val;
    }
    case "boolean":
      return expr.value ? 1 : 0;
    case "identifier":
      return evaluateIdentifier(expr.name, env);
    case "binary-op":
      return evaluateBinaryOp(expr, env);
    case "unary-not": {
      const operand = evaluateExpression(expr.operand, env);
      return operand === 0 || !operand ? 1 : 0;
    }
    case "unary-minus": {
      const operand = evaluateExpression(expr.operand, env);
      if (typeof operand !== "number") throw new Error("Cannot negate non-number");
      return -(operand as number);
    }
    case "deref":
      return evaluateDeref(expr.operand, env);
    case "address-of":
      return evaluateAddressOf(expr, env);
    case "call":
      return evaluateCall(expr, env);
    case "method-call":
      return evaluateMethodCall(expr, env);
    case "index":
      return evaluateIndex(expr, env);
    case "field-access":
      return evaluateFieldAccess(expr, env);
    case "if-expr":
      return evaluateIfExpression(expr, env);
    case "match-expr":
      return evaluateMatchExpression(expr, env);
    case "block-expr":
      return evaluateBlockExpression(expr, env);
    case "array-literal":
      return evaluateArrayLiteral(expr, env);
    case "struct-literal":
      return evaluateStructLiteral(expr, env);
    case "this":
      return env.has("this") ? env.get("this")!.value : NaN;
    case "this-field":
      return evaluateThisField(expr.field, env);
    case "lambda":
      return evaluateLambda(expr, env);
    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown expression kind: ${(_exhaustive as ASTExpr).kind}`);
    }
  }
}

// ============================================================================
// Expression Helpers
// ============================================================================

function evaluateIdentifier(name: string, env: Env): unknown {
  const shadow = blockShadow.get(env);
  if (shadow?.has(name)) throw new Error("Unknown identifier");

  if (!env.has(name)) throw new Error("Unknown identifier");
  const item = env.get(name)!;
  if (item.type === "__deleted__") throw new Error("Unknown identifier");
  if (item.moved) throw new Error("Use-after-move");

  if (typeof item.value === "number") return item.value;
  return item.value;
}

function evaluateBinaryOp(expr: ASTBinaryOp, env: Env): number {
  // Short-circuit for logical operators
  if (expr.op === "&&") {
    const left = evaluateExpression(expr.left, env);
    if (left === 0 || !left) return 0;
    const right = evaluateExpression(expr.right, env);
    return right === 0 || !right ? 0 : 1;
  }
  if (expr.op === "||") {
    const left = evaluateExpression(expr.left, env);
    if (left !== 0 && left) return 1;
    const right = evaluateExpression(expr.right, env);
    return right === 0 || !right ? 0 : 1;
  }

  const left = evaluateExpression(expr.left, env);
  const right = evaluateExpression(expr.right, env);

  if (typeof left !== "number" || typeof right !== "number") {
    throw new Error("Binary operation requires numeric operands");
  }

  switch (expr.op) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/":
      if (right === 0) throw new Error("Division by zero");
      return Math.trunc(left / right);
    case "%": return left % right;
    case "<": return left < right ? 1 : 0;
    case ">": return left > right ? 1 : 0;
    case "<=": return left <= right ? 1 : 0;
    case ">=": return left >= right ? 1 : 0;
    case "==": return left === right ? 1 : 0;
    case "!=": return left !== right ? 1 : 0;
    default: throw new Error(`Unknown binary operator: ${expr.op}`);
  }
}

function evaluateDeref(operand: ASTExpr, env: Env): number {
  const val = evaluateExpression(operand, env);
  if (!isPointerValue(val)) throw new Error("Cannot dereference non-pointer");

  const ptr = val;
  const pointee = ptr.env.get(ptr.name)!;
  if (pointee.moved) throw new Error("Use-after-move");
  if (typeof pointee.value !== "number") throw new Error("Cannot dereference non-number");
  return pointee.value as number;
}

function evaluateAddressOf(
  expr: { kind: "address-of"; operand: ASTExpr; mutable: boolean },
  env: Env
): unknown {
  if (expr.operand.kind !== "identifier") throw new Error("Address-of requires identifier");
  const name = expr.operand.name;

  if (!env.has(name)) throw new Error("Unknown identifier");
  const item = env.get(name)!;
  if (item.moved) throw new Error("Use-after-move");
  if (expr.mutable && !item.mutable) {
    throw new Error("Cannot take mutable reference to immutable variable");
  }

  registerBorrow(env, name, expr.mutable);

  return {
    type: "Pointer" as const,
    env,
    name,
    pointeeType: item.type ?? "I32",
    pointeeMutable: expr.mutable,
  };
}

function evaluateCall(
  expr: { kind: "call"; func: ASTExpr; args: ASTExpr[] },
  env: Env
): unknown {
  // Get the function value
  let func: FunctionValue;
  if (expr.func.kind === "identifier") {
    const name = expr.func.name;
    if (!env.has(name)) throw new Error("Unknown identifier");
    const item = env.get(name)!;
    if (typeof item.value === "number") throw new Error("Not a function");
    func = item.value as FunctionValue;
  } else {
    const val = evaluateExpression(expr.func, env);
    if (typeof val === "number") throw new Error("Not a function");
    func = val as FunctionValue;
  }

  if (func.params.length !== expr.args.length) {
    throw new Error("Argument count mismatch");
  }

  // Evaluate arguments, handling linear moves
  const argVals: unknown[] = [];
  for (const arg of expr.args) {
    if (arg.kind === "identifier" && env.has(arg.name)) {
      const argItem = env.get(arg.name)!;
      if (argItem.type === "__deleted__") throw new Error("Unknown identifier");
      if (argItem.moved) throw new Error("Use-after-move");

      const destructor = getLinearDestructor(argItem.type, env);
      if (destructor) {
        assertCanMoveBinding(env, arg.name);
        argItem.moved = true;
        env.set(arg.name, argItem);
        argVals.push(argItem.value);
        continue;
      }
      argVals.push(argItem.value);
    } else {
      argVals.push(evaluateExpression(arg, env));
    }
  }

  return callFunction(func, argVals, env);
}

function callFunction(func: FunctionValue, argVals: unknown[], _env: Env): unknown {
  const callEnv = new Map<string, EnvItem>(func.env);

  // Bind parameters
  for (let i = 0; i < func.params.length; i++) {
    callEnv.set(func.params[i], { value: argVals[i] as EnvItem["value"], mutable: false });
  }

  // Create `this` struct
  const thisStruct: StructValue = {
    fields: func.params.slice(),
    values: argVals.slice() as number[],
  };
  callEnv.set("this", { value: thisStruct as unknown as EnvItem["value"], mutable: false, type: "This" });

  // For now, delegate to existing interpreter for body evaluation
  // This is a bridge - full AST-based execution would parse and execute the body AST
  // Use evalBlock directly to allow return to propagate properly
  const { evalBlock, handleYieldValue } = require("./statements");

  try {
    // evalBlock with allowNonNumericReturn=true to handle struct/function returns
    const result = handleYieldValue(() => evalBlock(func.body, callEnv, true));
    return result;
  } catch (e) {
    if (isReturnValue(e)) return (e as ReturnValue).value;
    throw e;
  }
}

function evaluateMethodCall(
  expr: { kind: "method-call"; receiver: ASTExpr; method: string; args: ASTExpr[] },
  env: Env
): unknown {
  const receiver = evaluateExpression(expr.receiver, env);

  // Check for method in env
  if (env.has(expr.method)) {
    const item = env.get(expr.method)!;
    if (typeof item.value !== "number") {
      const func = item.value as FunctionValue;

      // Determine if receiver is first param
      if (func.params.length === expr.args.length + 1) {
        const argVals = [receiver, ...expr.args.map(a => evaluateExpression(a, env))];
        return callFunction(func, argVals, env);
      }

      if (func.params.length === expr.args.length) {
        const argVals = expr.args.map(a => evaluateExpression(a, env));
        return callFunction(func, argVals, env);
      }

      throw new Error("Argument count mismatch");
    }
  }

  // Check struct instance methods
  if (isStructValue(receiver)) {
    const struct = receiver as StructValue;
    if (struct.methods?.has(expr.method)) {
      const func = struct.methods.get(expr.method)!;
      const argVals = expr.args.map(a => evaluateExpression(a, env));
      return callFunction(func, argVals, env);
    }
  }

  throw new Error("Unknown identifier");
}

function evaluateIndex(
  expr: { kind: "index"; target: ASTExpr; index: ASTExpr },
  env: Env
): number {
  const target = evaluateExpression(expr.target, env);
  const index = evaluateExpression(expr.index, env);

  if (typeof index !== "number") throw new Error("Index must be a number");

  if (isSliceValue(target)) {
    const sv = target as SliceValue;
    if (index < 0 || index >= sv.length) {
      throw new Error(`Index out of bounds: ${index} (length: ${sv.length})`);
    }
    if (index + sv.start >= sv.backing.initializedCount) {
      throw new Error(`Index out of bounds or uninitialized: ${index} (initializedCount: ${sv.backing.initializedCount})`);
    }
    return sv.backing.elements[index + sv.start];
  }

  if (!isArrayValue(target)) throw new Error("Cannot index non-array");
  const arr = target as ArrayValue;

  if (index < 0 || index >= arr.initializedCount) {
    throw new Error(`Index out of bounds or uninitialized: ${index} (initializedCount: ${arr.initializedCount})`);
  }

  return arr.elements[index];
}

function evaluateFieldAccess(
  expr: { kind: "field-access"; object: ASTExpr; field: string },
  env: Env
): unknown {
  const obj = evaluateExpression(expr.object, env);

  if (isStructValue(obj)) {
    const struct = obj as StructValue;
    const idx = struct.fields.indexOf(expr.field);
    if (idx === -1) throw new Error(`Field ${expr.field} not found in struct`);
    return struct.values[idx];
  }

  if (isArrayValue(obj)) {
    const arr = obj as ArrayValue;
    if (expr.field === "length") return arr.length;
    if (expr.field === "init") return arr.initializedCount;
  }

  if (isSliceValue(obj)) {
    const sv = obj as SliceValue;
    if (expr.field === "length") return sv.length;
    if (expr.field === "init") return sv.backing.initializedCount;
  }

  throw new Error(`Cannot access field ${expr.field}`);
}

function evaluateIfExpression(expr: ASTIfExpr, env: Env): unknown {
  const cond = evaluateExpression(expr.condition, env);
  const isTruthy = typeof cond === "number" ? cond !== 0 : Boolean(cond);

  if (isTruthy) {
    return evaluateExpression(expr.thenBranch, env);
  }
  if (expr.elseBranch) {
    return evaluateExpression(expr.elseBranch, env);
  }
  return NaN;
}

function evaluateMatchExpression(expr: ASTMatchExpr, env: Env): unknown {
  const subject = evaluateExpression(expr.subject, env);

  for (const arm of expr.arms) {
    if (arm.pattern.kind === "pattern-wildcard") {
      return evaluateExpression(arm.body, env);
    }
    if (arm.pattern.kind === "pattern-literal") {
      const patternVal = evaluateExpression(arm.pattern.value, env);
      if (patternVal === subject) {
        return evaluateExpression(arm.body, env);
      }
    }
  }

  return NaN;
}

function evaluateBlockExpression(expr: ASTBlockExpr, env: Env): unknown {
  // Create block scope
  const blockEnv = new Map<string, EnvItem>(env);
  cloneTypeAliasMap(env, blockEnv);
  blockShadow.set(blockEnv, new Set());

  const localDeclared = new Set<string>();
  let lastValue: unknown = NaN;

  try {
    for (const stmt of expr.statements) {
      executeStatement(stmt, blockEnv);
      if (stmt.kind === "let-stmt") {
        localDeclared.add(stmt.name);
      }
    }

    if (expr.finalExpr) {
      lastValue = evaluateExpression(expr.finalExpr, blockEnv);
    }
  } catch (e) {
    if (isYieldValue(e)) {
      return (e as YieldValue).value;
    }
    throw e;
  } finally {
    // Release borrows for pointer bindings in this scope
    for (const name of localDeclared) {
      if (!blockEnv.has(name)) continue;
      const item = blockEnv.get(name)!;
      if (isPointerValue(item.value)) {
        const ptr = item.value;
        releaseBorrow(ptr.env, ptr.name, !!ptr.pointeeMutable);
      }
    }
    // Drop linear bindings
    for (const name of localDeclared) {
      dropLinearIfLive(name, blockEnv);
    }
  }

  return lastValue;
}

function evaluateArrayLiteral(
  expr: { kind: "array-literal"; elements: ASTExpr[] },
  env: Env
): ArrayValue {
  const elements = expr.elements.map(e => {
    const v = evaluateExpression(e, env);
    if (typeof v !== "number") throw new Error("Array element must be a number");
    return v as number;
  });

  return {
    type: "Array",
    elementType: "I32",
    elements,
    length: elements.length,
    initializedCount: elements.length,
  };
}

function evaluateStructLiteral(
  expr: { kind: "struct-literal"; typeName: string | null; fields: ASTExpr[] },
  env: Env
): StructValue {
  const values = expr.fields.map(f => evaluateExpression(f, env));

  if (expr.typeName) {
    const def = getStructDef(expr.typeName);
    if (def) {
      return { fields: def.fieldNames, values };
    }
  }

  // Anonymous struct
  return { fields: values.map((_, i) => `_${i}`), values };
}

function evaluateThisField(field: string, env: Env): unknown {
  if (!env.has(field)) throw new Error("Unknown identifier");
  const item = env.get(field)!;
  if (typeof item.value === "number") return item.value;
  return undefined;
}

function evaluateLambda(
  expr: { kind: "lambda"; params: { name: string; typeAnnotation: ASTTypeExpr | null }[]; returnType: ASTTypeExpr | null; body: ASTExpr },
  env: Env
): FunctionValue {
  const params = expr.params.map(p => p.name);
  const body = astExprToSource(expr.body);

  return {
    params,
    body,
    env: new Map(env),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function typeExprToString(typeExpr: ASTTypeExpr): string {
  switch (typeExpr.kind) {
    case "type-ident":
      return typeExpr.name;
    case "type-pointer":
      return `*${typeExpr.mutable ? "mut " : ""}${typeExprToString(typeExpr.pointee)}`;
    case "type-array":
      return `[${typeExprToString(typeExpr.elementType)}; ${typeExpr.init}; ${typeExpr.length}]`;
    case "type-slice":
      return `[${typeExprToString(typeExpr.elementType)}]`;
    case "type-function": {
      const params = typeExpr.params.map(p => typeExprToString(p)).join(", ");
      const ret = typeExprToString(typeExpr.returnType);
      return `(${params}) => ${ret}`;
    }
    case "type-generic": {
      const args = typeExpr.typeArgs.map(a => typeExprToString(a)).join(", ");
      return `${typeExpr.baseName}<${args}>`;
    }
    default: {
      const _exhaustive: never = typeExpr;
      throw new Error(`Unknown type expression kind: ${(_exhaustive as ASTTypeExpr).kind}`);
    }
  }
}

function inferType(expr: ASTExpr, env: Env): string | undefined {
  switch (expr.kind) {
    case "number": return expr.suffix ?? "I32";
    case "boolean": return "Bool";
    case "identifier":
      if (env.has(expr.name)) return env.get(expr.name)!.type;
      return undefined;
    default:
      return undefined;
  }
}

function validateTypeCompatibility(annotated: string, actual: string | undefined, env: Env): void {
  if (!isTypeCompatible(annotated, actual, env)) {
    const resolved = resolveTypeAlias(annotated, env);
    if (resolved.startsWith("*")) throw new Error("Pointer type mismatch");
    if (resolved.startsWith("(")) throw new Error("Function type mismatch");
    throw new Error("Type mismatch");
  }
}

function dropLinearIfLive(name: string, env: Env): void {
  if (!env.has(name)) return;
  const item = env.get(name)!;
  if (item.type === "__deleted__") return;
  if (item.moved) return;
  if (typeof item.value === "number" && Number.isNaN(item.value)) return;

  const destructor = getLinearDestructor(item.type, env);
  if (!destructor) return;

  assertCanMoveBinding(env, name);

  // Call destructor
  if (env.has(destructor)) {
    const destructorItem = env.get(destructor)!;
    if (typeof destructorItem.value !== "number") {
      const func = destructorItem.value as FunctionValue;
      callFunction(func, [item.value], env);
    }
  }

  item.moved = true;
  env.set(name, item);
}

// Convert AST expression back to source for legacy function body evaluation
function astExprToSource(expr: ASTExpr): string {
  // Simplified - for block expressions and complex cases, we need proper serialization
  // This is a bridge function until full AST-based execution is complete
  switch (expr.kind) {
    case "number":
      return expr.suffix ? `${expr.value}${expr.suffix}` : String(expr.value);
    case "boolean":
      return expr.value ? "true" : "false";
    case "identifier":
      return expr.name;
    case "binary-op":
      return `(${astExprToSource(expr.left)} ${expr.op} ${astExprToSource(expr.right)})`;
    case "unary-not":
      return `!${astExprToSource(expr.operand)}`;
    case "unary-minus":
      return `-${astExprToSource(expr.operand)}`;
    case "call": {
      const args = expr.args.map(a => astExprToSource(a)).join(", ");
      return `${astExprToSource(expr.func)}(${args})`;
    }
    case "block-expr": {
      const stmts = expr.statements.map(s => astStmtToSource(s)).join(" ");
      const final = expr.finalExpr ? astExprToSource(expr.finalExpr) : "";
      return `{ ${stmts} ${final} }`;
    }
    case "this":
      return "this";
    case "this-field":
      return `this.${expr.field}`;
    case "field-access":
      return `${astExprToSource(expr.object)}.${expr.field}`;
    case "index":
      return `${astExprToSource(expr.target)}[${astExprToSource(expr.index)}]`;
    case "if-expr": {
      const thenPart = astExprToSource(expr.thenBranch);
      const elsePart = expr.elseBranch ? ` else ${astExprToSource(expr.elseBranch)}` : "";
      return `if (${astExprToSource(expr.condition)}) ${thenPart}${elsePart}`;
    }
    case "array-literal":
      return `[${expr.elements.map(e => astExprToSource(e)).join(", ")}]`;
    case "struct-literal":
      return `{ ${expr.fields.map(f => astExprToSource(f)).join(", ")} }`;
    case "lambda": {
      const params = expr.params.map(p => p.typeAnnotation
        ? `${p.name}: ${typeExprToString(p.typeAnnotation)}`
        : p.name
      ).join(", ");
      return `(${params}) => ${astExprToSource(expr.body)}`;
    }
    case "deref":
      return `*${astExprToSource(expr.operand)}`;
    case "address-of":
      return expr.mutable ? `&mut ${astExprToSource(expr.operand)}` : `&${astExprToSource(expr.operand)}`;
    case "method-call": {
      const args = expr.args.map(a => astExprToSource(a)).join(", ");
      return `${astExprToSource(expr.receiver)}.${expr.method}(${args})`;
    }
    case "match-expr": {
      const arms = expr.arms.map(a => {
        const pat = a.pattern.kind === "pattern-wildcard" ? "_" : String(a.pattern.value);
        return `case ${pat} => ${astExprToSource(a.body)}`;
      }).join("; ");
      return `match (${astExprToSource(expr.subject)}) { ${arms}; }`;
    }
    default:
      return "";
  }
}

function astStmtToSource(stmt: ASTStmt): string {
  switch (stmt.kind) {
    case "let-stmt": {
      const mut = stmt.mutable ? "mut " : "";
      const type = stmt.typeAnnotation ? `: ${typeExprToString(stmt.typeAnnotation)}` : "";
      const init = stmt.initializer ? ` = ${astExprToSource(stmt.initializer)}` : "";
      return `let ${mut}${stmt.name}${type}${init};`;
    }
    case "assign-stmt":
      return `${astExprToSource(stmt.target)} = ${astExprToSource(stmt.value)};`;
    case "compound-assign-stmt":
      return `${astExprToSource(stmt.target)} ${stmt.op}= ${astExprToSource(stmt.value)};`;
    case "expr-stmt":
      return `${astExprToSource(stmt.expr)};`;
    case "return-stmt":
      return stmt.value ? `return ${astExprToSource(stmt.value)};` : "return;";
    case "yield-stmt":
      return `yield ${astExprToSource(stmt.value)};`;
    case "break-stmt":
      return "break;";
    case "continue-stmt":
      return "continue;";
    case "if-stmt": {
      const thenPart = stmtOrBlockToSource(stmt.thenBranch);
      const elsePart = stmt.elseBranch ? ` else ${stmtOrBlockToSource(stmt.elseBranch)}` : "";
      return `if (${astExprToSource(stmt.condition)}) ${thenPart}${elsePart}`;
    }
    case "while-stmt":
      return `while (${astExprToSource(stmt.condition)}) ${stmtOrBlockToSource(stmt.body)}`;
    case "for-stmt": {
      const mut = stmt.mutable ? "mut " : "";
      return `for (let ${mut}${stmt.varName} in ${astExprToSource(stmt.start)}..${astExprToSource(stmt.end)}) ${stmtOrBlockToSource(stmt.body)}`;
    }
    case "fn-stmt": {
      const params = stmt.params.map(p => p.typeAnnotation
        ? `${p.name}: ${typeExprToString(p.typeAnnotation)}`
        : p.name
      ).join(", ");
      const ret = stmt.returnType ? `: ${typeExprToString(stmt.returnType)}` : "";
      return `fn ${stmt.name}(${params})${ret} => ${astExprToSource(stmt.body)}`;
    }
    case "struct-stmt": {
      const fields = stmt.fields.map(f => f.typeAnnotation
        ? `${f.name}: ${typeExprToString(f.typeAnnotation)}`
        : f.name
      ).join(", ");
      const generics = stmt.genericParams.length > 0 ? `<${stmt.genericParams.join(", ")}>` : "";
      return `struct ${stmt.name}${generics} { ${fields} }`;
    }
    case "type-stmt": {
      const destructor = stmt.destructor ? ` then ${stmt.destructor}` : "";
      return `type ${stmt.name} = ${typeExprToString(stmt.aliasOf)}${destructor};`;
    }
    default: {
      const _exhaustive: never = stmt;
      return `/* unknown stmt: ${(_exhaustive as ASTStmt).kind} */`;
    }
  }
}

function stmtOrBlockToSource(stmtOrBlock: ASTStmt | ASTBlockExpr): string {
  if (stmtOrBlock.kind === "block-expr") {
    const stmts = stmtOrBlock.statements.map(s => astStmtToSource(s)).join(" ");
    const final = stmtOrBlock.finalExpr ? astExprToSource(stmtOrBlock.finalExpr) : "";
    return `{ ${stmts} ${final} }`;
  } else {
    return astStmtToSource(stmtOrBlock);
  }
}
