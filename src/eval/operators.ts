import { type CompareOp, type Link } from "../ast.ts";

// Each operator is listed once. The Record type makes the compiler reject a missing operator.
// Numbers are safe integers, and bitwise operators treat them as 32-bit values.
const NUMBER_OPERATORS: Record<
  Link["op"],
  (left: number, right: number) => number
> = {
  "+": (left: number, right: number): number => left + right,
  "-": (left: number, right: number): number => left - right,
  "*": (left: number, right: number): number => left * right,
  "/": (left: number, right: number): number => Math.trunc(left / right),
  "|": (left: number, right: number): number => left | right,
  "&": (left: number, right: number): number => left & right,
  "<<": (left: number, right: number): number => left << right,
  ">>": (left: number, right: number): number => left >> right,
};

const INTEGER_OPERATORS: Record<
  Link["op"],
  (left: bigint, right: bigint) => bigint
> = {
  "+": (left, right) => left + right,
  "-": (left, right) => left - right,
  "*": (left, right) => left * right,
  "/": (left, right) => left / right,
  "|": (left, right) => left | right,
  "&": (left, right) => left & right,
  "<<": (left, right) => left << right,
  ">>": (left, right) => left >> right,
};

/**
 * Applies a numeric operator to two safe-integer operands. Division truncates toward zero.
 * @param op - The operator.
 * @param left - The left operand.
 * @param right - The right operand.
 * @returns The result, which the caller checks against the safe integer range.
 */
export function apply(op: Link["op"], left: number, right: number): number {
  return NUMBER_OPERATORS[op](left, right);
}

/**
 * Applies an operator to two sized integer operands with exact arithmetic. The caller checks the range and the divisor.
 * @param op - The operator.
 * @param left - The left operand.
 * @param right - The right operand.
 * @returns The exact result, which the caller checks against its type's range.
 */
export function applyInteger(
  op: Link["op"],
  left: bigint,
  right: bigint,
): bigint {
  return INTEGER_OPERATORS[op](left, right);
}

/**
 * Compares two operands of the same numeric kind with an ordering operator.
 * @param op - The ordering operator: <, <=, >, or >=.
 * @param left - The left operand.
 * @param right - The right operand.
 * @returns The comparison result.
 */
export function numericCompare<T extends number | bigint>(
  op: CompareOp,
  left: T,
  right: T,
): boolean {
  if (op === "<") {
    return left < right;
  }

  if (op === "<=") {
    return left <= right;
  }

  if (op === ">") {
    return left > right;
  }

  return left >= right;
}
