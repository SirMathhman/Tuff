import type { Env, EnvItem } from "./types";
import { interpret } from "./interpret";
import { blockShadow } from "./env";
import {
  ensureUniqueDeclaration,
  findMatchingParen,
  isIdentifierName,
  parseIdentifierAt,
  parseMutPrefix,
  sliceTrim,
  splitTopLevel,
  storeEnvItem,
} from "./shared";
import { splitNumberAndSuffix } from "./numbers";
import { handleFnStatement } from "./functions";
import { tryHandleControlFlow } from "./controlFlow";
import {
  handleStructStatement,
  tryHandleStructLiteral,
  getStructDef,
} from "./structs";
import { tryHandleArrayLiteral, tryHandleArrayAssignment, parseArrayType } from "./arrays";

// Exception thrown by yield statements to break out of blocks early
export class YieldValue extends Error {
  public readonly __isYieldValue = true;
  constructor(public value: number) {
    super();
    Object.setPrototypeOf(this, YieldValue.prototype);
  }
}

// Exception thrown by break statements to exit loops
export class BreakException extends Error {
  public readonly __isBreakException = true;
  constructor() {
    super();
    Object.setPrototypeOf(this, BreakException.prototype);
  }
}

// Exception thrown by continue statements to skip to next loop iteration
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

export function handleYieldValue(yieldFn: () => number): number {
  try {
    return yieldFn();
  } catch (e: unknown) {
    if (isYieldValue(e)) {
      return (e as YieldValue).value;
    }
    throw e;
  }
}

function startsWithGroup(s: string): boolean {
  return s[0] === "(" || s[0] === "{";
}

function containsOperator(s: string): boolean {
  return (
    s.includes("+") || s.includes("-") || s.includes("*") || s.includes("/")
  );
}

function isIntegerTypeName(typeName: string): boolean {
  const first = typeName[0];
  return "IiUu".includes(first);
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

function validateAnnotatedTypeCompatibility(
  annotatedType: string,
  initType: string | undefined
) {
  validateTypeCompatibility(annotatedType, initType);
}

function inferTypeFromExpr(
  expr: string,
  env?: Env
): "Bool" | "Number" | undefined {
  const s = expr.trim();
  if (s === "true" || s === "false") return "Bool";
  // identifier
  if (isIdentifierName(s)) {
    if (env && env.has(s))
      return env.get(s)!.type as "Bool" | "Number" | undefined;
    return undefined;
  }
  // numeric literal start
  const { numStr } = splitNumberAndSuffix(s);
  if (numStr !== "") return "Number";
  // parenthesized or binary expression assume Number
  if (startsWithGroup(s)) return "Number";
  if (containsOperator(s)) return "Number";
  return undefined;
}

interface AnnotationResult {
  annotatedType?: string;
  initializer: string;
}

function extractAnnotationAndInitializer(str: string): AnnotationResult {
  let s = str.trim();
  let annotatedType: string | undefined = undefined;
  if (s.startsWith(":")) {
    const eq = s.indexOf("=");
    if (eq === -1) return { annotatedType: s.slice(1).trim(), initializer: "" };
    annotatedType = s.substring(1, eq).trim();
    s = s.substring(eq + 1).trim();
  }
  if (s.startsWith("=")) s = sliceTrim(s, 1);
  return { annotatedType, initializer: s } as AnnotationResult;
}

// eslint-disable-next-line complexity, max-lines-per-function
export function evalBlock(s: string, envIn?: Env): number {
  const trimmed = s.trim();
  // If this eval is for a brace-delimited block (e.g., "{ ... }"), create
  // a shallow copy of the parent environment so that declarations in the
  // inner block don't leak to the outer scope, but assignments to existing
  // outer variables still update the same EnvItem objects by reference.
  const isBraceBlock =
    trimmed.startsWith("{") &&
    findMatchingParen(trimmed, 0) === trimmed.length - 1;
  const env = isBraceBlock
    ? new Map<string, EnvItem>(envIn ?? new Map<string, EnvItem>())
    : envIn ?? new Map<string, EnvItem>();
  // create a shadow set for this evaluation scope
  blockShadow.set(env, new Set<string>());
  const rawStmts = splitTopLevel(s, ";");

  // collect trimmed non-empty statements
  const stmts = rawStmts.map((r) => r.trim()).filter((r) => r !== "");
  if (stmts.length === 0) return NaN;

  // If the final non-empty statement is a declaration, the block does not
  // produce a value and should be treated as an error when used in an
  // expression context.
  const lastStmt = stmts[stmts.length - 1];
  if (lastStmt.startsWith("let ")) {
    throw new Error("Block does not produce a value");
  }

  let last = NaN;
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
            last = processNonLetStatement(remaining, env);
          }
        } else {
          last = NaN;
        }
      }
    } else if (stmt.startsWith("yield ")) {
      const expr = sliceTrim(stmt, 6);
      last = interpret(expr, env);
      throw new YieldValue(last);
    } else if (stmt === "break") {
      throw new BreakException();
    } else if (stmt === "continue") {
      throw new ContinueException();
    } else {
      last = processNonLetStatement(stmt, env);
    }
  }
  return last;
}

function handleUninitializedArrayDeclaration(
  annotatedType: string,
  name: string,
  mutable: boolean,
  env: Env
): boolean {
  if (!annotatedType.startsWith("[")) return false;
  
  const { elementType, initializedCount, length } = parseArrayType(annotatedType);
  if (initializedCount !== 0) {
    throw new Error(
      `Array declaration without initializer must have init=0, got ${annotatedType}`
    );
  }
  if (!mutable) {
    throw new Error(
      `Array with init=0 must be mutable (use 'let mut')`
    );
  }
  const arrayVal: EnvItem["value"] = {
    type: "Array",
    elementType,
    elements: new Array(length).fill(0),
    length,
    initializedCount: 0,
  };
  env.set(name, { value: arrayVal, mutable, type: annotatedType });
  return true;
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

    const initType = inferTypeFromExpr(initializer, env);
    const val = interpret(initializer, env);

    if (annotatedType)
      validateAnnotatedTypeCompatibility(annotatedType, initType);

    const item = {
      value: val,
      mutable,
      type: annotatedType || initType,
    } as EnvItem;
    env.set(name, item);
    return val;
  }

  // an uninitialized declaration (no initializer):
  // - if it has a type annotation and no `mut`, it is write-once (not mutable)
  // - if it has `mut`, it is mutable
  // - if it has no annotation, it is mutable
  
  // Special case: array with init=0 must be mutable
  if (annotatedType && handleUninitializedArrayDeclaration(annotatedType, name, mutable, env)) {
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

  const rhsVal = interpret(rest, env);
  const newVal = computeCompoundResult(op, cur.value, rhsVal);
  cur.value = newVal;
  env.set(idRes.name, cur);
  return newVal;
}

function tryHandleAssignmentStatement(
  stmt: string,
  env: Env
): number | undefined {
  // Try array element assignment first
  const arrayAssignResult = tryHandleArrayAssignment(stmt, env, interpret);
  if (arrayAssignResult !== undefined) return arrayAssignResult;
  
  const idRes = parseIdentifierAt(stmt, 0);
  if (!idRes) return undefined;
  let restAssign = sliceTrim(stmt, idRes.next);
  if (!restAssign.startsWith("=")) return undefined;
  restAssign = sliceTrim(restAssign, 1);
  if (restAssign === "") throw new Error("Invalid assignment");
  ensureIdentifierExists(idRes.name, env);
  const cur = env.get(idRes.name)!;
  // allow assignment if variable is mutable OR if it is uninitialized
  if (!cur.mutable && typeof cur.value === "number" && !Number.isNaN(cur.value))
    throw new Error("Cannot assign to immutable variable");

  const rhsType = inferTypeFromExpr(restAssign, env);
  if (cur.type) {
    if (isIntegerTypeName(cur.type)) {
      if (rhsType === "Bool")
        throw new Error("Type mismatch: cannot assign Bool to integer type");
    }
    if (cur.type === "Bool") {
      if (rhsType !== "Bool")
        throw new Error("Type mismatch: cannot assign non-Bool to Bool");
    }
  }

  const val = interpret(restAssign, env);
  cur.value = val;
  env.set(idRes.name, cur);
  return val;
}

function processNonLetStatement(stmt: string, env: Env): number {
  let lastLocal = NaN;
  let rem = stmt;
  while (rem !== "") {
    rem = rem.trim();
    if (rem === "") break;
    if (startsWithGroup(rem)) {
      const close = findMatchingParen(rem, 0);
      if (close < 0) throw new Error("Unterminated grouping");
      const part = rem.slice(0, close + 1);
      lastLocal = interpret(part, env);
      rem = rem.substring(close + 1);
      rem = rem.trim();
      continue;
    }

    const assignedCompound = tryHandleCompoundAssignment(rem, env);
    if (assignedCompound !== undefined) lastLocal = assignedCompound;
    else {
      const assigned = tryHandleAssignmentStatement(rem, env);
      if (assigned !== undefined) lastLocal = assigned;
      else lastLocal = interpret(rem, env);
    }
    rem = "";
  }
  return lastLocal;
}
