import { applyBinaryOp } from "../eval";
import {
  validateAnnotation,
  cloneArrayInstance,
  parseSliceAnnotation,
} from "../interpret_helpers";
import { Env, envSet } from "../env";
import {
  isPlainObject,
  hasValue,
  hasMutable,
  hasUninitialized,
  hasAnnotation,
  hasLiteralAnnotation,
  hasParsedAnnotation,
  isArrayInstance,
  setValue,
  setUninitialized,
  type RuntimeValue,
} from "../types";

function validatePlaceholderBeforeAssignment(
  existingObj: RuntimeValue,
  value: RuntimeValue
) {
  if (
    hasParsedAnnotation(existingObj) &&
    hasUninitialized(existingObj) &&
    existingObj.uninitialized
  ) {
    if (
      existingObj.parsedAnnotation &&
      typeof existingObj.parsedAnnotation === "string" &&
      parseSliceAnnotation(existingObj.parsedAnnotation) &&
      (!hasMutable(existingObj) || !existingObj.mutable)
    ) {
      throw new Error("assignment to immutable variable");
    }

    validateAnnotation(existingObj.parsedAnnotation, value);
    return;
  }

  if (
    hasAnnotation(existingObj) &&
    typeof existingObj.annotation === "string"
  ) {
    const annotation = existingObj.annotation;
    const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
    if (typeOnly || /^\s*bool\s*$/i.test(annotation)) {
      validateAnnotation(annotation, value);
    }
  }
}

/**
 * Compute the new value for compound assignment
 */
export function computeAssignmentValue(
  op: string | undefined,
  existing: RuntimeValue,
  rhsOperand: RuntimeValue
): RuntimeValue {
  let newVal: RuntimeValue = rhsOperand;
  if (op) {
    const cur =
      isPlainObject(existing) &&
      hasValue(existing) &&
      existing.value !== undefined
        ? existing.value
        : existing;
    newVal = applyBinaryOp(op, cur, rhsOperand);
  }
  return newVal;
}

/**
 * Context for assignValueToVariable
 */
export interface AssignValueToVariableContext {
  name: string;
  existing: RuntimeValue;
  newVal: RuntimeValue;
  localEnv: Env;
}

/**
 * Assign a value to a variable, handling mutable wrappers
 */
export function assignValueToVariable(ctx: AssignValueToVariableContext): void {
  const { name, existing, newVal, localEnv } = ctx;
  if (
    isPlainObject(existing) &&
    hasValue(existing) &&
    existing.value !== undefined &&
    hasMutable(existing) &&
    existing.mutable
  ) {
    // Mutable wrapper: update its .value using Object.defineProperty helper
    setValue(existing, newVal);
    envSet(localEnv, name, existing);
  } else {
    // Normal binding: replace it (clone arrays)
    if (isArrayInstance(newVal))
      envSet(localEnv, name, cloneArrayInstance(newVal));
    else envSet(localEnv, name, newVal);
  }
}

/**
 * Context for assignToPlaceholder
 */
export interface AssignToPlaceholderContext {
  name: string;
  existing: RuntimeValue;
  newVal: RuntimeValue;
  localEnv: Env;
}

/**
 * Assign a value to a placeholder variable (declared-only let)
 */
export function assignToPlaceholder(ctx: AssignToPlaceholderContext): void {
  const { name, existing, newVal, localEnv } = ctx;
  if (!isPlainObject(existing))
    throw new Error("internal error: placeholder is not an object");
  if (
    hasLiteralAnnotation(existing) &&
    existing.literalAnnotation &&
    (!hasUninitialized(existing) || !existing.uninitialized) &&
    (!hasMutable(existing) || !existing.mutable)
  )
    throw new Error("cannot reassign annotated literal");
  validatePlaceholderBeforeAssignment(existing, newVal);

  // Use setter helpers to avoid 'as' type assertions
  if (hasValue(existing)) {
    setValue(
      existing,
      isArrayInstance(newVal) ? cloneArrayInstance(newVal) : newVal
    );
  }
  if (hasUninitialized(existing)) {
    setUninitialized(existing, false);
  }
  envSet(localEnv, name, existing);
}

/**
 * Array instance interface for index assignment
 */
export interface ArrayInstanceForAssignment {
  elements: RuntimeValue[];
  initializedCount: number;
  length: number;
}

/**
 * Context for doIndexAssignment
 */
export interface DoIndexAssignmentContext {
  arrInst: ArrayInstanceForAssignment;
  idxVal: number;
  rhsOperand: RuntimeValue;
  op: string | undefined;
}

/**
 * Perform index assignment into an array instance
 */
export function doIndexAssignment(ctx: DoIndexAssignmentContext): void {
  const { arrInst, idxVal, rhsOperand, op } = ctx;
  if (op) {
    if (idxVal >= arrInst.initializedCount)
      throw new Error("use of uninitialized array element");
    const cur = arrInst.elements[idxVal];
    const newElem = computeAssignmentValue(op, cur, rhsOperand);
    arrInst.elements[idxVal] = newElem;
  } else {
    arrInst.elements[idxVal] = rhsOperand;
  }
  arrInst.initializedCount = Math.max(arrInst.initializedCount, idxVal + 1);
}
