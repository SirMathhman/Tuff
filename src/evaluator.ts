import {
  NodeKind,
  Operator,
  StatementKind,
  type AssignStatement,
  type BlockNode,
  type ChainNode,
  type Expr,
  type NameNode,
} from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import type { NameRefs } from "./scope.ts";

/** A runtime value: a number, or a boolean. */
type Value = number | boolean;

type OperatorError = TuffErrorKind.DivisionByZero | TuffErrorKind.NumericOverflow | TuffErrorKind.BooleanOperand;
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

/** The state of one evaluation: the resolver's name bindings and the values of the open blocks. */
interface Env {
  /** The binding of every name use, from the resolver. */
  refs: NameRefs;
  /** Values of the open blocks, outermost first; each block's values are in binding order. */
  frames: Value[][];
}

function finite(n: number): Result<number, TuffErrorKind.NumericOverflow> {
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
 * @returns The result, or an error if an operand is a boolean or the arithmetic fails.
 */
function applyOperator(operator: Operator, a: Value, b: Value): Result<number, OperatorError> {
  if (typeof a !== "number" || typeof b !== "number") return err(TuffErrorKind.BooleanOperand);
  return OPERATORS[operator](a, b);
}

/**
 * Folds the AST to a value. Every name was bound by resolver.ts before this runs.
 *
 * @param expr - The expression to evaluate.
 * @param refs - The binding of every name use, from `resolve`.
 * @returns The computed number (a boolean result is 1 for `true` and 0 for `false`), or an error at the operator that caused it.
 */
export function evaluate(expr: Expr, refs: NameRefs): Result<number, TuffError> {
  const result = evaluateIn(expr, { refs, frames: [] });
  if (!result.ok) return result;
  if (typeof result.value === "number") return ok(result.value);
  return ok(result.value ? 1 : 0);
}

function evaluateIn(expr: Expr, env: Env): Result<Value, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal: {
      const checked = finite(expr.value);
      if (!checked.ok) return err({ kind: checked.error, span: expr.span });
      return ok(checked.value);
    }
    case NodeKind.Boolean:
      return ok(expr.value);
    case NodeKind.Name:
      return evaluateName(expr, env);
    case NodeKind.Chain:
      return evaluateChain(expr, env);
    case NodeKind.Block:
      return evaluateBlock(expr, env);
  }
}

function evaluateName(name: NameNode, env: Env): Result<Value, TuffError> {
  const ref = env.refs.get(name);
  const frame = ref === undefined ? undefined : env.frames[env.frames.length - 1 - ref.depth];
  const value = ref === undefined ? undefined : frame?.[ref.index];
  // Unreachable when the resolver ran first; TypeScript's array indexing still allows undefined here.
  if (value === undefined) return err({ kind: TuffErrorKind.InternalError, span: name.span });
  return ok(value);
}

function evaluateChain(chain: ChainNode, env: Env): Result<Value, TuffError> {
  const first = evaluateIn(chain.first, env);
  if (!first.ok) return first;
  let value = first.value;
  for (const step of chain.steps) {
    const right = evaluateIn(step.operand, env);
    if (!right.ok) return right;
    const applied = applyOperator(step.operator, value, right.value);
    if (!applied.ok) return err({ kind: applied.error, span: step.operatorSpan });
    value = applied.value;
  }
  return ok(value);
}

function evaluateBlock(block: BlockNode, env: Env): Result<Value, TuffError> {
  const frame: Value[] = [];
  env.frames.push(frame);
  const result = evaluateBlockBody(block, env, frame);
  env.frames.pop();
  return result;
}

function evaluateBlockBody(block: BlockNode, env: Env, frame: Value[]): Result<Value, TuffError> {
  for (const statement of block.statements) {
    if (statement.kind === StatementKind.Let) {
      const value = evaluateIn(statement.value, env);
      if (!value.ok) return value;
      frame.push(value.value);
      continue;
    }
    const assigned = evaluateAssign(statement, env);
    if (!assigned.ok) return assigned;
  }
  if (block.result === undefined) return ok(0);
  return evaluateIn(block.result, env);
}

function evaluateAssign(statement: AssignStatement, env: Env): Result<undefined, TuffError> {
  const value = evaluateIn(statement.value, env);
  if (!value.ok) return value;
  const ref = env.refs.get(statement.target);
  const frame = ref === undefined ? undefined : env.frames[env.frames.length - 1 - ref.depth];
  const previous = ref === undefined || frame === undefined ? undefined : frame[ref.index];
  // Unreachable when the resolver ran first; see evaluateName.
  if (ref === undefined || frame === undefined || previous === undefined) {
    return err({ kind: TuffErrorKind.InternalError, span: statement.target.span });
  }
  if (typeof previous !== typeof value.value) {
    return err({ kind: TuffErrorKind.TypeMismatch, span: statement.target.span });
  }
  frame[ref.index] = value.value;
  return ok(undefined);
}
