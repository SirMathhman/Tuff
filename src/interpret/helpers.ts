import { applyBinaryOp } from "../eval";
import { validateAnnotation } from "../interpret_helpers";
import { Env, envSet } from "../env";
import { isPlainObject } from "../types";

/**
 * Compute the new value for compound assignment
 */
export function computeAssignmentValue(
  op: string | null,
  existing: unknown,
  rhsOperand: unknown
): unknown {
  let newVal: unknown = rhsOperand;
  if (op) {
    const cur =
      isPlainObject(existing) &&
      Object.prototype.hasOwnProperty.call(existing, "value") &&
      (existing as { value?: unknown }).value !== undefined
        ? (existing as { value?: unknown }).value
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
    Object.prototype.hasOwnProperty.call(existing, "value") &&
    (existing as { value?: unknown }).value !== undefined &&
    (existing as { mutable?: unknown }).mutable
  ) {
    // Mutable wrapper: update its .value
    (existing as { value?: unknown }).value = newVal;
    envSet(localEnv, name, existing);
  } else {
    // Normal binding: replace it
    envSet(localEnv, name, newVal);
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
    (existing as { literalAnnotation?: unknown }).literalAnnotation &&
    !(existing as { uninitialized?: unknown }).uninitialized &&
    !(existing as { mutable?: unknown }).mutable
  )
    throw new Error("cannot reassign annotated literal");
  if (
    (existing as { parsedAnnotation?: unknown }).parsedAnnotation &&
    (existing as { uninitialized?: unknown }).uninitialized
  ) {
    validateAnnotation(
      (existing as { parsedAnnotation?: unknown }).parsedAnnotation,
      newVal
    );
  } else if (typeof (existing as { annotation?: unknown }).annotation === "string") {
    const annotation = (existing as { annotation: string }).annotation;
    const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
    if (typeOnly || /^\s*bool\s*$/i.test(annotation)) {
      validateAnnotation(annotation, newVal);
    }
  }
  (existing as { value?: unknown }).value = newVal;
  (existing as { uninitialized?: unknown }).uninitialized = false;
  envSet(localEnv, name, existing);
}
