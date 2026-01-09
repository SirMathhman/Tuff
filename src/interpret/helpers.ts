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
    // Mutable wrapper: update its .value
    // eslint-disable-next-line no-restricted-syntax
    (existing as { value: unknown }).value = newVal;
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
  if (
    hasParsedAnnotation(existing) &&
    hasUninitialized(existing) &&
    existing.uninitialized
  ) {
    validateAnnotation(existing.parsedAnnotation, newVal);
  } else if (
    hasAnnotation(existing) &&
    typeof existing.annotation === "string"
  ) {
    const annotation = existing.annotation;
    const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
    if (typeOnly || /^\s*bool\s*$/i.test(annotation)) {
      validateAnnotation(annotation, newVal);
    }
  }

  // Special-case: if a placeholder had a slice annotation and is uninitialized,
  // require it to be mutable before assigning to it.
  if (
    hasParsedAnnotation(existing) &&
    existing.parsedAnnotation &&
    typeof existing.parsedAnnotation === "string" &&
    parseSliceAnnotation(existing.parsedAnnotation) &&
    hasUninitialized(existing) &&
    existing.uninitialized &&
    (!hasMutable(existing) || !existing.mutable)
  )
    throw new Error("assignment to immutable variable");

  // eslint-disable-next-line no-restricted-syntax
  (existing as { value: unknown }).value = isArrayInstance(newVal)
    ? cloneArrayInstance(newVal)
    : newVal;
  // eslint-disable-next-line no-restricted-syntax
  (existing as { uninitialized: boolean }).uninitialized = false;
  envSet(localEnv, name, existing);
}
