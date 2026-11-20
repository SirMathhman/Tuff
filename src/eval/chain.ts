import { Operator, type ChainNode, type DerefNode } from "../ast.ts";
import { TuffErrorKind, type TuffError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import { isReference, type Value } from "../value.ts";
import type { Evaluate } from "./branch.ts";
import type { Env } from "./env.ts";

type OperatorError =
  | TuffErrorKind.DivisionByZero
  | TuffErrorKind.NumericOverflow
  | TuffErrorKind.BooleanOperand
  | TuffErrorKind.ReferenceAsValue;
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

/**
 * Checks that a number is finite.
 *
 * @param n - The number to check.
 * @returns The number, or a `NumericOverflow` error if it is `Infinity` or `NaN`.
 */
export function finite(n: number): Result<number, TuffErrorKind.NumericOverflow> {
  return Number.isFinite(n) ? ok(n) : err(TuffErrorKind.NumericOverflow);
}

const OPERATORS: Record<Operator, BinaryOp> = {
  [Operator.Add]: (a, b) => finite(a + b),
  [Operator.Subtract]: (a, b) => finite(a - b),
  [Operator.Multiply]: (a, b) => finite(a * b),
  [Operator.Divide]: (a, b) => (b === 0 ? err(TuffErrorKind.DivisionByZero) : ok(Math.trunc(a / b))),
};

/**
 * Applies an arithmetic operator. Both operands must be numbers.
 *
 * @param operator - The operator to apply.
 * @param a - The left operand.
 * @param b - The right operand.
 * @returns The result, or an error if an operand is a boolean or a reference, or the arithmetic fails.
 */
function applyOperator(operator: Operator, a: Value, b: Value): Result<number, OperatorError> {
  if (typeof a === "number" && typeof b === "number") return OPERATORS[operator](a, b);
  if (isReference(a) || isReference(b)) return err(TuffErrorKind.ReferenceAsValue);
  return err(TuffErrorKind.BooleanOperand);
}

/**
 * Evaluates a left-to-right chain of operators.
 *
 * @param chain - The chain.
 * @param env - The current evaluation state.
 * @param evaluate - Evaluates each operand.
 * @returns The chain's value, or the first error from an operand or an operator.
 */
export function evaluateChain(chain: ChainNode, env: Env, evaluate: Evaluate): Result<Value, TuffError> {
  const first = evaluate(chain.first, env);
  if (!first.ok) return first;
  let value = first.value;
  for (const step of chain.steps) {
    const right = evaluate(step.operand, env);
    if (!right.ok) return right;
    const applied = applyOperator(step.operator, value, right.value);
    if (!applied.ok) return err({ kind: applied.error, span: step.operatorSpan });
    value = applied.value;
  }
  return ok(value);
}

/**
 * Reads the value a reference points to.
 *
 * @param deref - The dereference.
 * @param env - The current evaluation state.
 * @param evaluate - Evaluates the operand, which must yield a reference.
 * @returns The value the reference points to, or `NotAReference` if the operand is not a reference.
 */
export function evaluateDeref(deref: DerefNode, env: Env, evaluate: Evaluate): Result<Value, TuffError> {
  const pointer = evaluate(deref.operand, env);
  if (!pointer.ok) return pointer;
  if (!isReference(pointer.value)) return err({ kind: TuffErrorKind.NotAReference, span: deref.span });
  const value = pointer.value.target[pointer.value.index];
  // Unreachable: a live reference always points at a bound slot.
  if (value === undefined) return err({ kind: TuffErrorKind.InternalError, span: deref.span });
  return ok(value);
}
