/**
 * Assignment statement handlers - extracted from statements.ts
 */
import { Env, envGet, envSet, envHas } from "../env";
import {
  isPlainObject,
  isPointer,
  isArrayInstance,
  hasValue,
  hasMutable,
  hasUninitialized,
  hasAnnotation,
  hasLiteralAnnotation,
  hasParsedAnnotation,
  unwrapBindingValue,
  throwUseOfUninitialized,
} from "../types";
import { parseArrayAnnotation, validateAnnotation } from "../interpret_helpers";
import {
  computeAssignmentValue,
  assignToPlaceholder,
  assignValueToVariable,
  doIndexAssignment,
} from "./helpers";

/** Extracted assignment parts */
export interface AssignmentParts {
  isDeref: boolean;
  name: string;
  op: string | undefined;
  rhs: string;
  isThisField?: boolean;
  indexExpr?: string;
}

/** Type for RHS evaluation callback functions */
type EvaluateRhsCallback = (expr: string, e: Env) => unknown;

function getPointerFromExisting(existing: unknown): unknown | undefined {
  if (
    isPlainObject(existing) &&
    hasValue(existing) &&
    existing.value !== undefined &&
    isPointer(existing.value)
  )
    return existing.value;
  if (isPlainObject(existing) && isPointer(existing)) return existing;
  return undefined;
}

function materializePlaceholderArray(
  name: string,
  existingObj: unknown,
  localEnv: Env
): unknown {
  if (
    !isPlainObject(existingObj) ||
    !hasUninitialized(existingObj) ||
    !existingObj.uninitialized
  )
    return existingObj;
  if (!hasAnnotation(existingObj) || typeof existingObj.annotation !== "string")
    throw new Error("assignment to undeclared variable");
  const arrAnn = parseArrayAnnotation(String(existingObj.annotation));
  if (!arrAnn) throw new Error("assignment to non-array variable");
  if (!hasMutable(existingObj) || !existingObj.mutable)
    throw new Error("assignment to immutable variable");
  const arrInst = {
    isArray: true,
    elements: new Array(arrAnn.length),
    length: arrAnn.length,
    initializedCount: 0,
    elemType: arrAnn.elemType,
  };
  envSet(localEnv, name, {
    mutable: true,
    value: arrInst,
    annotation: existingObj.annotation,
  });
  return envGet(localEnv, name);
}

function extractMutableArrayInstance(existingObj: unknown) {
  if (
    !(
      isPlainObject(existingObj) &&
      hasValue(existingObj) &&
      existingObj.value !== undefined &&
      hasMutable(existingObj) &&
      existingObj.mutable
    )
  )
    throw new Error("assignment to immutable or non-array variable");
  const arr = existingObj.value;
  if (!isArrayInstance(arr)) throw new Error("assignment target is not array");
  return arr;
}

function requireExistingAndEvalRhs(
  name: string,
  rhs: string,
  localEnv: Env,
  evaluateRhsLocal: EvaluateRhsCallback
): { existing: unknown; rhsOperand: unknown } {
  if (!envHas(localEnv, name))
    throw new Error("assignment to undeclared variable");
  const existing = envGet(localEnv, name);
  const rhsOperand = evaluateRhsLocal(rhs, localEnv);
  return { existing, rhsOperand };
}

/**
 * Shared boilerplate for assignments that target a local binding.
 * (Kept here to avoid duplication and keep CPD happy.)
 */
export function handleVariableOrDerefAssignment(
  isDeref: boolean,
  name: string,
  op: string | undefined,
  rhs: string,
  localEnv: Env,
  evaluateRhsLocal: EvaluateRhsCallback
): void {
  const { existing, rhsOperand } = requireExistingAndEvalRhs(
    name,
    rhs,
    localEnv,
    evaluateRhsLocal
  );

  if (isDeref) {
    const ptr = unwrapBindingValue(existing);
    handleDerefAssignment(ptr, op, rhsOperand, localEnv);
  } else {
    handleRegularAssignment(name, op, rhsOperand, existing, localEnv);
  }
}

/**
 * Handle this.field assignment
 */
export function handleThisFieldAssignment(args: {
  name: string;
  op: string | undefined;
  rhs: string;
  localEnv: Env;
  evaluateRhsLocal: EvaluateRhsCallback;
}): void {
  const { name, op, rhs, localEnv, evaluateRhsLocal } = args;
  const { existing, rhsOperand } = requireExistingAndEvalRhs(
    name,
    rhs,
    localEnv,
    evaluateRhsLocal
  );
  const newVal = computeAssignmentValue(op, existing, rhsOperand);
  assignValueToVariable(name, existing, newVal, localEnv);
}

/**
 * Handle index assignment (arr[i] = v or arr[i] op= v)
 */
export function handleIndexAssignment(
  name: string,
  indexExpr: string,
  op: string | undefined,
  rhs: string,
  localEnv: Env,
  evaluateReturningOperand: EvaluateRhsCallback,
  evaluateRhsLocal: EvaluateRhsCallback,
  convertOperandToNumber: (op: unknown) => number
): boolean {
  const idxVal = convertOperandToNumber(
    evaluateReturningOperand(indexExpr, localEnv)
  );

  if (!envHas(localEnv, name))
    throw new Error("assignment to undeclared variable");
  let existing = envGet(localEnv, name);

  // Support indexing into pointer-to-slice variables (p[0] = ...)
  const maybePtr = getPointerFromExisting(existing);

  if (maybePtr) {
    handlePointerIndexAssignment(
      maybePtr,
      idxVal,
      op,
      rhs,
      localEnv,
      evaluateRhsLocal
    );
    return true;
  }

  existing = materializePlaceholderArray(name, existing, localEnv);
  const arrInst = extractMutableArrayInstance(existing);

  const rhsOperand2 = evaluateRhsLocal(rhs, localEnv);
  doIndexAssignment(arrInst, idxVal, rhsOperand2, op);

  // persist
  envSet(localEnv, name, existing);
  return true;
}

/**
 * Handle pointer index assignment (p[i] = v)
 */
function handlePointerIndexAssignment(
  maybePtr: unknown,
  idxVal: number,
  op: string | undefined,
  rhs: string,
  localEnv: Env,
  evaluateRhsLocal: EvaluateRhsCallback
): void {
  const { ptrName, targetBinding, arrInst } = resolveArrayPointerTarget(
    maybePtr,
    localEnv
  );
  const rhsOperand2 = evaluateRhsLocal(rhs, localEnv);

  doIndexAssignment(arrInst, idxVal, rhsOperand2, op);

  persistArrayChange(ptrName, targetBinding, arrInst, localEnv);
}

function resolveArrayPointerTarget(maybePtr: unknown, localEnv: Env) {
  if (!isPointer(maybePtr)) throw new Error("internal pointer error");
  const ptrName = maybePtr.ptrName;
  if (typeof ptrName !== "string") throw new Error("invalid pointer target");
  if (!envHas(localEnv, ptrName))
    throw new Error(`unknown identifier ${ptrName}`);
  const targetBinding = envGet(localEnv, ptrName);
  if (
    isPlainObject(targetBinding) &&
    hasUninitialized(targetBinding) &&
    targetBinding.uninitialized
  )
    throwUseOfUninitialized(ptrName);
  const targetVal = unwrapBindingValue(targetBinding);

  if (!isArrayInstance(targetVal))
    throw new Error("assignment to non-array variable");

  // require target be mutable to write via pointer
  if (
    !(
      isPlainObject(targetBinding) &&
      hasMutable(targetBinding) &&
      targetBinding.mutable
    )
  )
    throw new Error("assignment to immutable variable");

  return { ptrName, targetBinding, arrInst: targetVal };
}

function persistArrayChange(
  ptrName: string,
  targetBinding: unknown,
  arrInst: unknown,
  localEnv: Env
) {
  if (
    isPlainObject(targetBinding) &&
    hasValue(targetBinding) &&
    targetBinding.value !== undefined &&
    hasMutable(targetBinding) &&
    targetBinding.mutable
  ) {
    Reflect.set(targetBinding, "value", arrInst);
    envSet(localEnv, ptrName, targetBinding);
  } else {
    envSet(localEnv, ptrName, arrInst);
  }
}

/**
 * Handle deref assignment (*p = v or *p op= v)
 */
export function handleDerefAssignment(
  ptr: unknown,
  op: string | undefined,
  rhsOperand: unknown,
  localEnv: Env
): void {
  if (!isPointer(ptr))
    throw new Error("internal error: deref assignment without pointer");
  const targetName = ptr.ptrName;
  if (!envHas(localEnv, targetName))
    throw new Error(`unknown identifier ${targetName}`);
  const targetExisting = envGet(localEnv, targetName);

  const newVal = computeAssignmentValue(op, targetExisting, rhsOperand);

  validateAndAssignDeref(targetName, targetExisting, newVal, localEnv);
}

function validateAndAssignDeref(
  targetName: string,
  targetExisting: unknown,
  newVal: unknown,
  localEnv: Env
) {
  // For deref assignment to a placeholder, validate annotation
  if (isPlainObject(targetExisting) && hasUninitialized(targetExisting)) {
    handlePlaceholderDerefAssignment(
      targetName,
      targetExisting,
      newVal,
      localEnv
    );
    return;
  }

  if (assignIfMutableBinding(targetName, targetExisting, newVal, localEnv))
    return;

  // fallback: set value directly
  envSet(localEnv, targetName, newVal);
}

function handlePlaceholderDerefAssignment(
  targetName: string,
  targetExisting: unknown,
  newVal: unknown,
  localEnv: Env
) {
  if (!isPlainObject(targetExisting) || !hasUninitialized(targetExisting))
    throw new Error("internal error: expected placeholder binding");

  if (
    hasLiteralAnnotation(targetExisting) &&
    targetExisting.literalAnnotation &&
    !targetExisting.uninitialized &&
    (!hasMutable(targetExisting) || !targetExisting.mutable)
  )
    throw new Error("cannot reassign annotated literal");
  if (
    hasParsedAnnotation(targetExisting) &&
    targetExisting.parsedAnnotation &&
    targetExisting.uninitialized
  ) {
    validateAnnotation(targetExisting.parsedAnnotation, newVal);
  } else if (
    hasAnnotation(targetExisting) &&
    typeof targetExisting.annotation === "string"
  ) {
    validateAnnotation(targetExisting.annotation, newVal);
  }
  // Use helpers to avoid direct casts and ensure consistent behavior
  assignToPlaceholder(targetName, targetExisting, newVal, localEnv);
}

function assignIfMutableBinding(
  targetName: string,
  targetExisting: unknown,
  newVal: unknown,
  localEnv: Env
) {
  if (
    isPlainObject(targetExisting) &&
    hasValue(targetExisting) &&
    targetExisting.value !== undefined &&
    hasMutable(targetExisting) &&
    targetExisting.mutable
  ) {
    assignValueToVariable(targetName, targetExisting, newVal, localEnv);
    return true;
  }
  return false;
}

/**
 * Handle regular assignment (x = v or x op= v)
 */
export function handleRegularAssignment(
  name: string,
  op: string | undefined,
  rhsOperand: unknown,
  existing: unknown,
  localEnv: Env
): void {
  const newVal = computeAssignmentValue(op, existing, rhsOperand);

  if (isPlainObject(existing) && hasUninitialized(existing)) {
    // Placeholder for declaration-only let
    assignToPlaceholder(name, existing, newVal, localEnv);
  } else {
    assignValueToVariable(name, existing, newVal, localEnv);
  }
}
