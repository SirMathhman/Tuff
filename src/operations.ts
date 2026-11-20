import { booleanOperand, booleanSign, divisionByZero } from "./errors";
import type { Failure, TuffError } from "./errors";
import { Operator } from "./scanner";
import { EntryKind } from "./types";
import type { StackEntry, Value } from "./types";

/**
 * Reports whether an operator is a comparison.
 *
 * @param op - the operator to test.
 * @returns true for `<`, `>`, `<=`, `>=`, `==`, and `!=`.
 */
export function isComparison(op: Operator): boolean {
  return (
    op !== Operator.Add &&
    op !== Operator.Subtract &&
    op !== Operator.Multiply &&
    op !== Operator.Divide
  );
}

/**
 * Gives the binding strength of an operator. Comparisons bind loosest, then `+`
 * and `-`, then `*`.
 *
 * @param op - the operator.
 * @returns a larger number for an operator that binds more tightly.
 */
export function precedence(op: Operator): number {
  if (op === Operator.Multiply || op === Operator.Divide) return 2;
  return isComparison(op) ? 0 : 1;
}

function apply(left: number, op: Operator, right: number): Value {
  if (op === Operator.Add) return left + right;
  if (op === Operator.Subtract) return left - right;
  if (op === Operator.Multiply) return left * right;
  if (op === Operator.Divide) return Math.trunc(left / right);
  if (op === Operator.LessThan) return left < right;
  if (op === Operator.LessEqual) return left <= right;
  if (op === Operator.GreaterThan) return left > right;
  if (op === Operator.GreaterEqual) return left >= right;
  if (op === Operator.Equal) return left === right;
  return left !== right;
}

/**
 * Handles a value error. In an unchosen branch the error is not reported, and the
 * fallback stands in for the value; otherwise the failure is returned.
 *
 * @param lenient - whether the operation is in an unchosen branch.
 * @param failure - the value error that would be reported.
 * @param fallback - the value used in place of the error when lenient.
 * @returns the fallback when lenient, or the failure.
 */
export function valueError<T extends Value | undefined>(
  lenient: boolean,
  failure: Failure<TuffError>,
  fallback: T,
): Failure<TuffError> | T {
  return lenient ? fallback : failure;
}

/**
 * Applies a sign to a value. Only numbers take a sign, so a negative sign on a boolean
 * is an error, even in an unchosen branch.
 *
 * @param value - the value to sign.
 * @param sign - 1 or -1.
 * @param where - the offset of the value.
 * @returns the signed value, or a failure for a negative sign on a boolean.
 */
export function applySign(
  value: Value,
  sign: number,
  where: number,
): Failure<TuffError> | Value {
  if (sign === 1) return value;
  if (typeof value === "boolean") return booleanSign(where);
  return sign * value;
}

/**
 * Pops the newest operator and applies it to the two newest values. A boolean
 * operand is a failure, even in an unchosen branch.
 *
 * @param values - the value stack.
 * @param ops - the operator stack.
 * @returns a failure for a boolean operand or a zero divisor, or undefined.
 */
export function applyTop(
  values: Value[],
  ops: StackEntry[],
): Failure<TuffError> | undefined {
  const entry = ops.pop();
  if (entry?.kind !== EntryKind.Operator) return undefined;
  const right = values.pop() ?? 0;
  const left = values.pop() ?? 0;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return booleanOperand(entry.where, entry.operator);
  }
  if (entry.operator === Operator.Divide && right === 0) {
    return divisionByZero(entry.where);
  }
  values.push(apply(left, entry.operator, right));
  return undefined;
}

/**
 * Applies every pending operator at the top of the operator stack.
 *
 * @param values - the value stack.
 * @param ops - the operator stack.
 * @returns a failure for a boolean operand, or undefined.
 */
export function reduceOperators(
  values: Value[],
  ops: StackEntry[],
): Failure<TuffError> | undefined {
  for (
    let top = ops[ops.length - 1];
    top?.kind === EntryKind.Operator;
    top = ops[ops.length - 1]
  ) {
    const failure = applyTop(values, ops);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

/**
 * Closes the innermost group: applies its operators, then scales the result by
 * the sign written before its opening bracket.
 *
 * @param values - the value stack.
 * @param ops - the operator stack.
 * @returns a failure for a negative sign on a boolean, or undefined.
 */
export function closeGroup(
  values: Value[],
  ops: StackEntry[],
): Failure<TuffError> | undefined {
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const group = ops.pop();
  if (group?.kind !== EntryKind.Group) return undefined;
  const signed = applySign(values.pop() ?? 0, group.sign, group.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  return undefined;
}
