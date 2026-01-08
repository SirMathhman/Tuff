import { applyBinaryOp } from "../eval";
import { validateAnnotation } from "../interpret_helpers";
import { Env, envSet } from "../env";

/**
 * Compute the new value for compound assignment
 */
export function computeAssignmentValue(
  op: string | null,
  existing: any,
  rhsOperand: any
): any {
  let newVal = rhsOperand;
  if (op) {
    const cur =
      existing && (existing as any).value !== undefined
        ? (existing as any).value
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
  existing: any,
  newVal: any,
  localEnv: Env
): void {
  if (
    existing &&
    (existing as any).value !== undefined &&
    (existing as any).mutable
  ) {
    // Mutable wrapper: update its .value
    (existing as any).value = newVal;
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
  existing: any,
  newVal: any,
  localEnv: Env
): void {
  if (
    (existing as any).literalAnnotation &&
    !(existing as any).uninitialized &&
    !(existing as any).mutable
  )
    throw new Error("cannot reassign annotated literal");
  if ((existing as any).parsedAnnotation && (existing as any).uninitialized) {
    validateAnnotation((existing as any).parsedAnnotation, newVal);
  } else if ((existing as any).annotation) {
    const annotation = (existing as any).annotation as string;
    const typeOnly = annotation.match(/^\s*([uUiI])\s*(\d+)\s*$/);
    if (typeOnly || /^\s*bool\s*$/i.test(annotation)) {
      validateAnnotation(annotation, newVal);
    }
  }
  (existing as any).value = newVal;
  (existing as any).uninitialized = false;
  envSet(localEnv, name, existing);
}
