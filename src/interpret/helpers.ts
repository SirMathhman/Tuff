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
} from "../types";

/**
 * Compute the new value for compound assignment
 */
export function computeAssignmentValue(
  op: string | undefined,
  existing: unknown,
  rhsOperand: unknown
): unknown {
  let newVal: unknown = rhsOperand;
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
 * Assign a value to a variable, handling mutable wrappers
 */
export function assignValueToVariable(
  name: string,
  existing: unknown,
  newVal: unknown,
  localEnv: Env
): void {
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
 * Assign a value to a placeholder variable (declared-only let)
 */
export function assignToPlaceholder(
  name: string,
  existing: unknown,
  newVal: unknown,
  localEnv: Env
): void {
  if (!isPlainObject(existing))
    throw new Error("internal error: placeholder is not an object");
  if (
    hasLiteralAnnotation(existing) &&
    existing.literalAnnotation &&
    (!hasUninitialized(existing) || !existing.uninitialized) &&
    (!hasMutable(existing) || !existing.mutable)
  )
    throw new Error("cannot reassign annotated literal");
  // Run annotation-specific validations and checks on the placeholder before assignment.
  (function validatePlaceholder(existingObj: unknown, value: unknown) {
    if (
      hasParsedAnnotation(existingObj) &&
      hasUninitialized(existingObj) &&
      existingObj.uninitialized
    ) {
      // If the parsed annotation represents a slice (e.g., `*[T]`), ensure the
      // placeholder is mutable before allowing assignment; otherwise validate
      // the parsed annotation normally.
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
  })(existing, newVal);

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
 * Perform index assignment into an array instance
 */
export function doIndexAssignment(
  arrInst: { elements: unknown[]; initializedCount: number; length: number },
  idxVal: number,
  rhsOperand: unknown,
  op: string | undefined
): void {
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
