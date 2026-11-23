import {
  ok,
  resultTooLargeAt,
  type Result,
  type TuffError,
} from "./errors.ts";
import { type Expr, type Link } from "./parser.ts";

function apply(op: Link["op"], left: number, right: number): number {
  if (op === "+") {
    return left + right;
  }
  return op === "-" ? left - right : left * right;
}

/**
 * Computes the value of a parsed expression, reporting any value that leaves the safe integer range.
 * @param expr - The expression tree produced by the parser.
 * @returns The computed value, or a ResultTooLarge error.
 */
export function evaluate(expr: Expr): Result<number, TuffError> {
  if (expr.kind === "number") {
    return ok(expr.value);
  }
  if (expr.kind === "negate") {
    const inner = evaluate(expr.operand);
    return inner.ok ? ok(-inner.value) : inner;
  }
  return expr.links.reduce<Result<number, TuffError>>(
    (acc, link) => {
      if (!acc.ok) {
        return acc;
      }
      const right = evaluate(link.operand);
      if (!right.ok) {
        return right;
      }
      const value = apply(link.op, acc.value, right.value);
      return Number.isSafeInteger(value) ? ok(value) : resultTooLargeAt(link.where);
    },
    evaluate(expr.first),
  );
}
