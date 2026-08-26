import type { TuffError } from "./errors.ts";
import { tupleElementsEqual } from "./util.ts";

/**
 * The static type of a number value.
 */
interface NumberType {
  kind: "number";
}

/**
 * The static type of a boolean value.
 */
interface BooleanType {
  kind: "boolean";
}

/**
 * The static type of a tuple value: an ordered list of element types.
 */
interface TupleType {
  kind: "tuple";
  elements: TuffType[];
}

/**
 * The static type of a reference value: a pointer to a value of the
 * given type.
 */
interface RefType {
  kind: "ref";
  pointsTo: TuffType;
}

/**
 * The static type of a value: a number, a boolean, a tuple of types, or
 * a reference.
 */
export type TuffType = NumberType | BooleanType | TupleType | RefType;

/**
 * A successful type-check result.
 */
export interface CheckOk {
  ok: true;
}

/**
 * A failed type-check result.
 */
export interface CheckErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of a type check: success or a structured error.
 */
export type CheckResult = CheckOk | CheckErr;

/**
 * A determined expression type.
 */
export interface ExprType {
  ok: true;
  type: TuffType;
}

/**
 * The type of an expression, or the error that made it undeterminable.
 */
export type ExprTypeResult = ExprType | CheckErr;

/**
 * Static type information for a declared variable.
 */
export interface TypeInfo {
  type: TuffType;
  mutable: boolean;
}

/**
 * Whether two static types are identical.
 *
 * @param a - The first type.
 * @param b - The second type.
 * @returns True when the types match exactly.
 */
export function sameType(a: TuffType, b: TuffType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tuple" && b.kind === "tuple") {
    return tupleElementsEqual(a.elements, b.elements, sameType);
  }
  if (a.kind === "ref" && b.kind === "ref") {
    return sameType(a.pointsTo, b.pointsTo);
  }
  return true;
}

/**
 * Render a static type as a short human-readable name for error messages.
 *
 * @param type - The type to describe.
 * @returns A name such as `number`, `boolean`, or `tuple`.
 */
export function describeType(type: TuffType): string {
  return type.kind;
}

/**
 * Build an operand type mismatch failure.
 *
 * @param position - Zero-based offset of the offending operand.
 * @param expected - The type name the operand was required to have.
 * @param actual - The type name the operand actually had.
 * @returns The failed check result.
 */
export function mismatch(
  position: number,
  expected: string,
  actual: string,
): CheckErr {
  return {
    ok: false,
    error: { type: "OperandTypeMismatch", position, expected, actual },
  };
}
