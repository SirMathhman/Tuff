/**
 * Assignment statement handlers - extracted from statements.ts
 */
import { Env, envGet, envSet, envHas } from "../runtime/env";
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
  type RuntimeValue,
} from "../runtime/types";
import {
  parseArrayAnnotation,
  validateAnnotation,
} from "../interpreter_helpers";
import {
  computeAssignmentValue,
  assignToPlaceholder,
  assignValueToVariable,
  doIndexAssignment,
} from "./helpers";
import { makeArrayInstance } from "./arrays";

/** Extracted assignment parts */
export interface ThisFieldTarget {
  fieldName: string;
}

export interface IndexedTarget {
  indexExpr: string;
}

export interface AssignmentTarget {
  thisField?: ThisFieldTarget;
  indexed?: IndexedTarget;
}

export interface AssignmentFlags {
  isDeref: boolean;
  isDeclOnly: boolean;
}

export interface AssignmentParts {
  flags: AssignmentFlags;
  name: string;
  op: string | undefined;
  rhs: string;
  target?: AssignmentTarget;
}

/** Type for RHS evaluation callback functions */
type EvaluateRhsCallback = (expr: string, e: Env) => RuntimeValue;

/** Result from requireExistingAndEvalRhs */
interface RequireExistingResult {
  existing: RuntimeValue;
  rhsOperand: RuntimeValue;
}

/** Context for assignment operations */
interface AssignmentContext {
  name: string;
  op: string | undefined;
  rhs: string;
  localEnv: Env;
  evaluateRhsLocal: EvaluateRhsCallback;
}

/** Context for index assignment operations */
interface IndexAssignmentCallbacks {
  evaluateReturningOperand: EvaluateRhsCallback;
  evaluateRhsLocal: EvaluateRhsCallback;
  convertOperandToNumber: (op: RuntimeValue) => number;
}

interface IndexAssignmentRhs {
  op: string | undefined;
  rhs: string;
}

interface IndexAssignmentContext {
  name: string;
  indexExpr: string;
  rhsInfo: IndexAssignmentRhs;
  localEnv: Env;
  callbacks: IndexAssignmentCallbacks;
}

/** Context for deref assignment operations */
interface DerefAssignmentContext {
  ptr: RuntimeValue;
  op: string | undefined;
  rhsOperand: RuntimeValue;
  localEnv: Env;
}

/** Context for pointer index assignment */
interface PointerEnvAndCallback {
  localEnv: Env;
  evaluateRhsLocal: EvaluateRhsCallback;
}

interface PointerIndexContext {
  maybePtr: RuntimeValue;
  idxVal: number;
  op: string | undefined;
  rhs: string;
  envAndCallback: PointerEnvAndCallback;
}

/** Context for validating and assigning deref */
interface DerefValidationContext {
  targetName: string;
  targetExisting: RuntimeValue;
  newVal: RuntimeValue;
  localEnv: Env;
}

/** Context for persisting array changes */
interface PersistArrayContext {
  ptrName: string;
  targetBinding: RuntimeValue;
  arrInst: RuntimeValue;
  localEnv: Env;
}

/** Context for regular assignment operations */
interface RegularAssignmentContext {
  name: string;
  op: string | undefined;
  rhsOperand: RuntimeValue;
  existing: RuntimeValue;
  localEnv: Env;
}

function getPointerFromExisting(
  existing: RuntimeValue
): RuntimeValue | undefined {
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
  existingObj: RuntimeValue,
  localEnv: Env
): RuntimeValue {
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
  const arrInst = makeArrayInstance(arrAnn);
  envSet(localEnv, name, {
    mutable: true,
    value: arrInst,
    annotation: existingObj.annotation,
  });
  return envGet(localEnv, name);
}

function extractMutableArrayInstance(existingObj: RuntimeValue) {
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
  ctx: Pick<AssignmentContext, "name" | "rhs" | "localEnv" | "evaluateRhsLocal">
): RequireExistingResult {
  if (!envHas(ctx.localEnv, ctx.name))
    throw new Error("assignment to undeclared variable");
  const existing = envGet(ctx.localEnv, ctx.name);
  const rhsOperand = ctx.evaluateRhsLocal(ctx.rhs, ctx.localEnv);
  return { existing, rhsOperand };
}

/**
 * Shared boilerplate for assignments that target a local binding.
 * (Kept here to avoid duplication and keep CPD happy.)
 */
export function handleVariableOrDerefAssignment(
  isDeref: boolean,
  ctx: AssignmentContext
): void {
  const { existing, rhsOperand } = requireExistingAndEvalRhs(ctx);

  if (isDeref) {
    const ptr = unwrapBindingValue(existing);
    handleDerefAssignment({
      ptr,
      op: ctx.op,
      rhsOperand,
      localEnv: ctx.localEnv,
    });
  } else {
    handleRegularAssignment({
      name: ctx.name,
      op: ctx.op,
      rhsOperand,
      existing,
      localEnv: ctx.localEnv,
    });
  }
}

/**
 * Arguments for handleThisFieldAssignment
 */
export interface HandleThisFieldAssignmentArgs {
  name: string;
  op: string | undefined;
  rhs: string;
  localEnv: Env;
  evaluateRhsLocal: EvaluateRhsCallback;
}

/**
 * Handle this.field assignment
 */
export function handleThisFieldAssignment(
  args: HandleThisFieldAssignmentArgs
): void {
  const { name, op, rhs, localEnv, evaluateRhsLocal } = args;
  const { existing, rhsOperand } = requireExistingAndEvalRhs({
    name,
    rhs,
    localEnv,
    evaluateRhsLocal,
  });
  const newVal = computeAssignmentValue(op, existing, rhsOperand);
  assignValueToVariable({ name, existing, newVal, localEnv });
}

/**
 * Handle index assignment (arr[i] = v or arr[i] op= v)
 */
export function handleIndexAssignment(ctx: IndexAssignmentContext): boolean {
  const { name, indexExpr, rhsInfo, localEnv, callbacks } = ctx;
  const { op, rhs } = rhsInfo;

  const idxVal = callbacks.convertOperandToNumber(
    callbacks.evaluateReturningOperand(indexExpr, localEnv)
  );

  if (!envHas(localEnv, name))
    throw new Error("assignment to undeclared variable");
  let existing = envGet(localEnv, name);

  // Support indexing into pointer-to-slice variables (p[0] = ...)
  const maybePtr = getPointerFromExisting(existing);

  if (maybePtr) {
    handlePointerIndexAssignment({
      maybePtr,
      idxVal,
      op,
      rhs,
      envAndCallback: {
        localEnv,
        evaluateRhsLocal: callbacks.evaluateRhsLocal,
      },
    });
    return true;
  }

  existing = materializePlaceholderArray(name, existing, localEnv);
  const arrInst = extractMutableArrayInstance(existing);

  const rhsOperand2 = callbacks.evaluateRhsLocal(rhs, localEnv);
  doIndexAssignment({ arrInst, idxVal, rhsOperand: rhsOperand2, op });

  // persist
  envSet(localEnv, name, existing);
  return true;
}

/**
 * Handle pointer index assignment (p[i] = v)
 */
function handlePointerIndexAssignment(ctx: PointerIndexContext): void {
  const { maybePtr, idxVal, op, rhs, envAndCallback } = ctx;
  const { localEnv, evaluateRhsLocal } = envAndCallback;

  const { ptrName, targetBinding, arrInst } = resolveArrayPointerTarget(
    maybePtr,
    localEnv
  );
  const rhsOperand2 = evaluateRhsLocal(rhs, localEnv);

  doIndexAssignment({ arrInst, idxVal, rhsOperand: rhsOperand2, op });

  persistArrayChange({ ptrName, targetBinding, arrInst, localEnv });
}

function resolveArrayPointerTarget(maybePtr: RuntimeValue, localEnv: Env) {
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

function persistArrayChange(ctx: PersistArrayContext) {
  const { ptrName, targetBinding, arrInst, localEnv } = ctx;

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
export function handleDerefAssignment(ctx: DerefAssignmentContext): void {
  const { ptr, op, rhsOperand, localEnv } = ctx;

  if (!isPointer(ptr))
    throw new Error("internal error: deref assignment without pointer");
  const targetName = ptr.ptrName;
  if (!envHas(localEnv, targetName))
    throw new Error(`unknown identifier ${targetName}`);
  const targetExisting = envGet(localEnv, targetName);

  const newVal = computeAssignmentValue(op, targetExisting, rhsOperand);

  validateAndAssignDeref({ targetName, targetExisting, newVal, localEnv });
}

function validateAndAssignDeref(ctx: DerefValidationContext) {
  const { targetName, targetExisting, newVal, localEnv } = ctx;

  // For deref assignment to a placeholder, validate annotation
  if (isPlainObject(targetExisting) && hasUninitialized(targetExisting)) {
    handlePlaceholderDerefAssignment(ctx);
    return;
  }

  if (assignIfMutableBinding(ctx)) return;

  // fallback: set value directly
  envSet(localEnv, targetName, newVal);
}

function handlePlaceholderDerefAssignment(ctx: DerefValidationContext) {
  const { targetName, targetExisting, newVal, localEnv } = ctx;

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
  assignToPlaceholder({
    name: targetName,
    existing: targetExisting,
    newVal,
    localEnv,
  });
}

function assignIfMutableBinding(ctx: DerefValidationContext) {
  const { targetName, targetExisting, newVal, localEnv } = ctx;

  if (
    isPlainObject(targetExisting) &&
    hasValue(targetExisting) &&
    targetExisting.value !== undefined &&
    hasMutable(targetExisting) &&
    targetExisting.mutable
  ) {
    assignValueToVariable({
      name: targetName,
      existing: targetExisting,
      newVal,
      localEnv,
    });
    return true;
  }
  return false;
}

/**
 * Handle regular assignment (x = v or x op= v)
 */
export function handleRegularAssignment(ctx: RegularAssignmentContext): void {
  const { name, op, rhsOperand, existing, localEnv } = ctx;

  const newVal = computeAssignmentValue(op, existing, rhsOperand);

  if (isPlainObject(existing) && hasUninitialized(existing)) {
    // Placeholder for declaration-only let
    assignToPlaceholder({ name, existing, newVal, localEnv });
  } else {
    assignValueToVariable({ name, existing, newVal, localEnv });
  }
}
