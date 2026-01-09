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
  let maybePtr: unknown | undefined = undefined;
  if (
    isPlainObject(existing) &&
    hasValue(existing) &&
    existing.value !== undefined &&
    isPointer(existing.value)
  )
    maybePtr = existing.value;
  else if (isPlainObject(existing) && isPointer(existing)) maybePtr = existing;

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

  // If placeholder declared-only with array annotation, materialize into a mutable wrapper
  if (
    isPlainObject(existing) &&
    hasUninitialized(existing) &&
    existing.uninitialized
  ) {
    if (!hasAnnotation(existing) || typeof existing.annotation !== "string")
      throw new Error("assignment to undeclared variable");
    const arrAnn = parseArrayAnnotation(String(existing.annotation));
    if (!arrAnn) throw new Error("assignment to non-array variable");
    if (!hasMutable(existing) || !existing.mutable)
      throw new Error("assignment to immutable variable");
    const arrInst = {
      isArray: true,
      elements: new Array(arrAnn.length),
      length: arrAnn.length,
      initializedCount: 0,
      elemType: arrAnn.elemType,
    };
    // store as mutable wrapper
    envSet(localEnv, name, {
      mutable: true,
      value: arrInst,
      annotation: existing.annotation,
    });
    existing = envGet(localEnv, name);
  }

  // Determine mutable wrapper
  if (
    !(
      isPlainObject(existing) &&
      hasValue(existing) &&
      existing.value !== undefined &&
      hasMutable(existing) &&
      existing.mutable
    )
  )
    throw new Error("assignment to immutable or non-array variable");

  const arrInst = existing.value;
  if (!isArrayInstance(arrInst))
    throw new Error("assignment target is not array");

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

  const arrInst = targetVal;
  const rhsOperand2 = evaluateRhsLocal(rhs, localEnv);

  doIndexAssignment(arrInst, idxVal, rhsOperand2, op);

  // persist change back into target binding
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

  // For deref assignment to a placeholder, validate annotation
  if (isPlainObject(targetExisting) && hasUninitialized(targetExisting)) {
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
  } else if (
    isPlainObject(targetExisting) &&
    hasValue(targetExisting) &&
    targetExisting.value !== undefined &&
    hasMutable(targetExisting) &&
    targetExisting.mutable
  ) {
    assignValueToVariable(targetName, targetExisting, newVal, localEnv);
  } else {
    envSet(localEnv, targetName, newVal);
  }
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
