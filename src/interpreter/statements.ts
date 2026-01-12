/* eslint-disable max-lines */

import type { Env, EnvItem } from "./types";
import { interpret } from "./interpret";
import { blockShadow } from "./env";
import {
  ensureUniqueDeclaration,
  findMatchingParen,
  parseIdentifierAt,
  parseMutPrefix,
  sliceTrim,
  splitTopLevel,
  storeEnvItem,
  startsWithGroup,
  inferTypeFromExpr,
  isIntegerTypeName,
  findTopLevelAssignmentIndex,
  setTypeAlias,
  resolveTypeAlias,
  cloneTypeAliasMap,
} from "./shared";
import { isArrayValue } from "./arrays";
import { findSlicesReferencing } from "./pointers";
import type { ArrayValue } from "./types";
import { handleFnStatement } from "./functions";
import { tryHandleControlFlow } from "./controlFlow";
import {
  handleStructStatement,
  tryHandleStructLiteral,
  getStructDef,
} from "./structs";
import {
  tryHandleArrayLiteral,
  tryHandleArrayAssignment,
  createUninitializedArrayFromType,
} from "./arrays";
import {
  tryHandlePointerAssignment,
  handlePointerInitializer,
} from "./pointers";
import { tryHandleThisAssignment, assertAssignable } from "./thisAssign";
import { ReturnValue } from "./returns";
export class YieldValue extends Error {
  public readonly __isYieldValue = true;
  constructor(public value: unknown) {
    super();
    Object.setPrototypeOf(this, YieldValue.prototype);
  }
}

export class BreakException extends Error {
  public readonly __isBreakException = true;
  constructor() {
    super();
    Object.setPrototypeOf(this, BreakException.prototype);
  }
}

export class ContinueException extends Error {
  public readonly __isContinueException = true;
  constructor() {
    super();
    Object.setPrototypeOf(this, ContinueException.prototype);
  }
}

function isControlFlowException(
  e: unknown,
  flag: "__isYieldValue" | "__isBreakException" | "__isContinueException"
): boolean {
  return typeof e === "object" && e !== null && flag in e;
}

function isYieldValue(e: unknown): boolean {
  return isControlFlowException(e, "__isYieldValue");
}
function isBreakException(e: unknown): boolean {
  return isControlFlowException(e, "__isBreakException");
}
function isContinueException(e: unknown): boolean {
  return isControlFlowException(e, "__isContinueException");
}
export { isYieldValue, isBreakException, isContinueException };

export function handleYieldValue(yieldFn: () => unknown): unknown {
  try {
    return yieldFn();
  } catch (e: unknown) {
    if (isYieldValue(e)) return (e as YieldValue).value;
    throw e;
  }
}

function validateTypeCompatibility(
  annotatedType: string | undefined,
  otherType: string | undefined
) {
  if (!annotatedType) return;
  if (isIntegerTypeName(annotatedType)) {
    if (otherType === "Bool")
      throw new Error("Type mismatch: cannot assign Bool to integer type");
    return;
  }
  if (annotatedType === "Bool") {
    if (otherType !== "Bool")
      throw new Error("Type mismatch: cannot assign non-Bool to Bool");
  }
}

function isUnknownNonConcreteType(t?: string): boolean {
  if (!t) return false;
  if (isIntegerTypeName(t)) return false;
  if (t === "Bool") return false;
  if (t.startsWith("[")) return false;
  if (t.startsWith("*")) return false;
  if (t.startsWith("(")) return false;
  return true;
}

function validateAnnotatedTypeCompatibility(
  annotatedType: string,
  initType: string | undefined,
  env?: Env
) {
  // resolve aliases before comparisons
  const resolvedAnnotated = annotatedType ? resolveTypeAlias(annotatedType, env) : annotatedType;
  const resolvedInit = initType ? resolveTypeAlias(initType, env) : initType;

  // pointer types: exact match on resolved inner type
  if (resolvedAnnotated && resolvedAnnotated.startsWith("*")) {
    if (resolvedAnnotated !== resolvedInit) throw new Error("Pointer type mismatch");
    return;
  }

  // function types e.g., (I32, I32) => I32 - require exact match with inferred type
  if (resolvedAnnotated && resolvedAnnotated.startsWith("(") && resolvedAnnotated.includes("=>")) {
    if (resolvedAnnotated !== resolvedInit) {
      throw new Error("Function type mismatch");
    }
    return;
  }

  // If annotated resolves to an unknown non-concrete type, error
  if (isUnknownNonConcreteType(resolvedAnnotated)) {
    throw new Error(`Unknown type: ${annotatedType}`);
  }

  validateTypeCompatibility(annotatedType, initType);
}

interface AnnotationResult {
  annotatedType?: string;
  initializer: string;
}

function extractAnnotationAndInitializer(str: string): AnnotationResult {
  let s = str.trim();
  let annotatedType: string | undefined = undefined;
  if (s.startsWith(":")) {
    const lastEq = findTopLevelAssignmentIndex(s);
    if (lastEq === -1)
      return { annotatedType: s.slice(1).trim(), initializer: "" };
    annotatedType = s.substring(1, lastEq).trim();
    s = s.substring(lastEq + 1).trim();
  }
  if (s.startsWith("=")) s = sliceTrim(s, 1);
  return { annotatedType, initializer: s } as AnnotationResult;
}

// eslint-disable-next-line complexity, max-lines-per-function
export function evalBlock(
  s: string,
  envIn?: Env,
  allowNonNumericReturn = false
): unknown {
  const trimmed = s.trim();
  // If evaluating a brace-delimited block, create a shallow copy of the parent
  // env so inner declarations don't leak but outer variables remain updatable.
  const isBraceBlock =
    trimmed.startsWith("{") &&
    findMatchingParen(trimmed, 0) === trimmed.length - 1;
  const env = isBraceBlock
    ? new Map<string, EnvItem>(envIn ?? new Map<string, EnvItem>())
    : envIn ?? new Map<string, EnvItem>();
  // copy type alias map for block scoping
  if (isBraceBlock) cloneTypeAliasMap(envIn, env);
  // create a shadow set for this evaluation scope
  blockShadow.set(env, new Set<string>());

  const stmtSource = isBraceBlock ? trimmed.slice(1, trimmed.length - 1) : s;
  const rawStmts = splitTopLevel(stmtSource, ";");

  // collect trimmed non-empty statements
  const stmts = rawStmts.map((r) => r.trim()).filter((r) => r !== "");
  if (stmts.length === 0) return NaN;

  // If the final non-empty statement is a declaration, the block does not
  // produce a value and should be treated as an error when used in an
  // expression context.
  const lastStmt = stmts[stmts.length - 1];
  if (lastStmt.startsWith("let ") || lastStmt.startsWith("type ")) {
    throw new Error("Block does not produce a value");
  }

  let last: unknown = NaN;
  const localDeclared = new Set<string>();
  for (let idx = 0; idx < stmts.length; idx++) {
    const stmt = stmts[idx];

    const ctrl = tryHandleControlFlow(idx, stmts, env);
    if (ctrl.handled) {
      last = ctrl.last;
      idx += ctrl.consumed;
      continue;
    }

    if (stmt.startsWith("let ")) {
      last = handleLetStatement(stmt, env, localDeclared);
    } else if (stmt.startsWith("type ")) {
      last = handleTypeStatement(stmt, env, localDeclared);
    } else if (stmt.startsWith("fn ")) {
      last = handleFnStatement(stmt, env, localDeclared);
    } else if (stmt.startsWith("struct ")) {
      const result = handleStructStatement(stmt);
      if (result) {
        // If there's more content after the struct definition, process it
        const remaining = stmt.slice(result.nextPos).trim();
        if (remaining !== "") {
          // Re-process the remaining part as a statement
          if (remaining.startsWith("let ")) {
            last = handleLetStatement(remaining, env, localDeclared);
          } else {
            last = processNonLetStatement(
              remaining,
              env,
              allowNonNumericReturn
            );
          }
        } else {
          last = NaN;
        }
      }
    } else if (stmt.startsWith("return")) {
      const expr = sliceTrim(stmt, 6);
      if (expr === "") {
        throw new ReturnValue(NaN);
      }
      const rv = interpret(expr, env);
      if (typeof rv !== "number" && !allowNonNumericReturn)
        throw new Error("Return must return a number");
      throw new ReturnValue(rv);
    } else if (stmt.startsWith("yield ")) {
      const expr = sliceTrim(stmt, 6);
      const yv = interpret(expr, env);
      if (typeof yv !== "number" && !allowNonNumericReturn)
        throw new Error("Yield must return a number");
      throw new YieldValue(yv);
    } else if (stmt === "break") {
      throw new BreakException();
    } else if (stmt === "continue") {
      throw new ContinueException();
    } else {
      last = processNonLetStatement(stmt, env, allowNonNumericReturn);
    }
  }
  return last;
}

// eslint-disable-next-line max-lines-per-function
function handleLetStatement(
  stmt: string,
  env: Env,
  localDeclared: Set<string>
): number {
  let rest = sliceTrim(stmt, 4);
  // optional `mut` modifier
  const mutRes = parseMutPrefix(rest);
  const mutable = mutRes.mutable;
  rest = mutRes.rest;
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid let declaration");
  const name = nameRes.name;
  ensureUniqueDeclaration(localDeclared, name);

  const rest2 = sliceTrim(rest, nameRes.next);
  const { annotatedType, initializer } = extractAnnotationAndInitializer(rest2);
  if (initializer !== "") {
    // Check if this is a struct or array initialization
    const compositeVal =
      (annotatedType && getStructDef(annotatedType)
        ? tryHandleStructLiteral(initializer, annotatedType, env, interpret)
        : undefined) ||
      (annotatedType && annotatedType.startsWith("[")
        ? tryHandleArrayLiteral(initializer, env, annotatedType, interpret)
        : undefined);

    if (compositeVal) {
      storeEnvItem(env, name, compositeVal, mutable, annotatedType);
      return NaN;
    }

    // Pointer initializer e.g., let y : *I32 = &x;
    if (
      handlePointerInitializer(
        initializer,
        annotatedType || undefined,
        name,
        mutable,
        env
      )
    ) {
      return NaN;
    }

    return handleSimpleInitializer(
      initializer,
      annotatedType,
      name,
      mutable,
      env
    );
  }

  // an uninitialized declaration (no initializer):
  // - if it has a type annotation and no `mut`, it is write-once (not mutable)
  // - if it has `mut`, it is mutable
  // - if it has no annotation, it is mutable

  // Special case: array with init=0 must be mutable
  if (
    annotatedType &&
    createUninitializedArrayFromType(annotatedType, name, mutable, env)
  ) {
    return NaN;
  }

  const item = {
    value: NaN,
    mutable: annotatedType ? mutable : true,
    type: annotatedType,
  } as EnvItem;
  env.set(name, item);
  return NaN;
}

function handleTypeStatement(
  stmt: string,
  env: Env,
  localDeclared: Set<string>
): number {
  // Syntax: type Name = SomeType
  let rest = sliceTrim(stmt, 4);
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid type declaration");
  const name = nameRes.name;
  ensureUniqueDeclaration(localDeclared, name);
  rest = sliceTrim(rest, nameRes.next);
  if (!rest.startsWith("=")) throw new Error("Invalid type declaration");
  const aliasOf = sliceTrim(rest, 1);
  if (!aliasOf) throw new Error("Invalid type declaration");
  // store alias in per-env alias map
  setTypeAlias(env, name, aliasOf);
  return NaN;
}

function handleSimpleInitializer(
  initializer: string,
  annotatedType: string | undefined,
  name: string,
  mutable: boolean,
  env: Env
): number {
  const initType = inferTypeFromExpr(initializer, env);

  // Special-case: annotated as `This` and initializer is `this` -> capture
  // current numeric bindings into a StructValue representing the current
  // environment snapshot.
  if (annotatedType === "This" && initializer.trim() === "this") {
    const fieldNames: string[] = [];
    const fieldValues: number[] = [];
    // include only numeric-valued env items that are not deleted
    for (const [k, v] of env.entries()) {
      if (v.type === "__deleted__") continue;
      if (typeof v.value === "number" && !Number.isNaN(v.value)) {
        fieldNames.push(k);
        fieldValues.push(v.value as number);
      }
    }
    const structVal = { fields: fieldNames, values: fieldValues } as const;
    const item = {
      value: structVal,
      mutable,
      type: annotatedType,
    } as EnvItem;
    env.set(name, item);
    return NaN;
  }

  const val = interpret(initializer, env);

  if (annotatedType)
    validateAnnotatedTypeCompatibility(annotatedType, initType, env);

  const item = {
    value: val as EnvItem["value"],
    mutable,
    type: annotatedType || initType,
  } as EnvItem;
  env.set(name, item);
  return NaN;
}

function ensureIdentifierExists(name: string, env: Env) {
  if (!env.has(name)) throw new Error("Unknown identifier");
}

function computeCompoundResult(
  op: string,
  left: number,
  right: number
): number {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) throw new Error("Division by zero");
      return Math.trunc(left / right);
    default:
      throw new Error("Unsupported compound assignment");
  }
}

function tryHandleCompoundAssignment(
  stmt: string,
  env: Env
): number | undefined {
  const idRes = parseIdentifierAt(stmt, 0);
  if (!idRes) return undefined;
  let rest = sliceTrim(stmt, idRes.next);
  if (rest.length < 2) return undefined;
  const op = rest[0];
  const eq = rest[1];
  if (eq !== "=") return undefined;
  if (op !== "+" && op !== "-" && op !== "*" && op !== "/") return undefined;
  rest = sliceTrim(rest, 2);
  if (rest === "") throw new Error("Invalid assignment");
  ensureIdentifierExists(idRes.name, env);

  const cur = env.get(idRes.name)!;
  if (typeof cur.value !== "number" || Number.isNaN(cur.value))
    throw new Error(
      "Cannot compound-assign uninitialized or non-number variable"
    );
  if (!cur.mutable) throw new Error("Cannot assign to immutable variable");

  const rhsType = inferTypeFromExpr(rest, env);
  validateTypeCompatibility(cur.type, rhsType);

  const rhsValRaw = interpret(rest, env);
  if (typeof rhsValRaw !== "number")
    throw new Error("Compound assignment requires numeric rhs");
  const rhsVal = rhsValRaw as number;
  const newVal = computeCompoundResult(op, cur.value, rhsVal);
  cur.value = newVal;
  env.set(idRes.name, cur);
  return newVal;
}

function tryHandleAssignmentStatement(
  stmt: string,
  env: Env,
  interpretRef: (input: string, env?: Env) => unknown = interpret
): number | undefined {
  // Try pointer assignment first
  const pointerAssignResult = tryHandlePointerAssignment(
    stmt,
    env,
    interpretRef
  );
  if (pointerAssignResult !== undefined) return pointerAssignResult;

  // Try array element assignment
  const arrayAssignResult = tryHandleArrayAssignment(stmt, env, interpretRef);
  if (arrayAssignResult !== undefined) return arrayAssignResult;

  const thisAssign = tryHandleThisAssignment(stmt, env, interpretRef);
  if (thisAssign !== undefined) return thisAssign;

  const idRes = parseIdentifierAt(stmt, 0);
  if (!idRes) return undefined;
  let restAssign = sliceTrim(stmt, idRes.next);
  if (!restAssign.startsWith("=")) return undefined;
  restAssign = sliceTrim(restAssign, 1);
  if (restAssign === "") throw new Error("Invalid assignment");
  ensureIdentifierExists(idRes.name, env);

  const cur = env.get(idRes.name)!;

  // Prevent reassigning an array while slices exist
  if (isArrayValue(cur.value)) {
    const existing = findSlicesReferencing(cur.value as ArrayValue, env);
    if (existing.length > 0)
      throw new Error("Cannot reassign array while slices exist");
  }

  assertAssignable(cur, inferTypeFromExpr(restAssign, env));

  const valRaw = interpretRef(restAssign, env);
  if (typeof valRaw === "number") {
    const val = valRaw as number;
    cur.value = val;
    env.set(idRes.name, cur);
    return val;
  }

  // Allow assigning an array value to a variable
  if (isArrayValue(valRaw)) {
    if (!cur.mutable) throw new Error("Cannot assign to immutable variable");
    cur.value = valRaw;
    env.set(idRes.name, cur);
    return NaN;
  }

  throw new Error("Cannot assign non-number to variable");
}

function processNonLetStatement(
  stmt: string,
  env: Env,
  allowNonNumericReturn = false
): unknown {
  let lastLocal: unknown = NaN;
  let rem = stmt;
  while (rem !== "") {
    rem = rem.trim();
    if (rem === "") break;
    if (startsWithGroup(rem)) {
      const close = findMatchingParen(rem, 0);
      if (close < 0) throw new Error("Unterminated grouping");
      const part = rem.slice(0, close + 1);
      const valPart = part.trim().startsWith("{")
        ? handleYieldValue(() => evalBlock(part, env, allowNonNumericReturn))
        : interpret(part, env);
      if (typeof valPart !== "number") {
        if (!allowNonNumericReturn)
          throw new Error("Expected numeric expression");
        lastLocal = valPart;
      } else {
        lastLocal = valPart as number;
      }
      rem = rem.substring(close + 1);
      rem = rem.trim();
      continue;
    }

    const assignedCompound = tryHandleCompoundAssignment(rem, env);
    if (assignedCompound !== undefined) lastLocal = assignedCompound;
    else {
      const assigned = tryHandleAssignmentStatement(rem, env);
      if (assigned !== undefined) lastLocal = assigned;
      else {
        const val = interpret(rem, env);
        if (typeof val !== "number") {
          if (!allowNonNumericReturn)
            throw new Error("Expected numeric expression");
          lastLocal = val;
        } else lastLocal = val as number;
      }
    }
    rem = "";
  }
  return lastLocal;
}
