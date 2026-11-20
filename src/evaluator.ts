import { NodeKind, Operator, StatementKind, type AssignStatement, type BlockNode, type ChainNode, type Expr, type NameNode } from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import type { NameRefs } from "./resolver.ts";

type OperatorError = TuffErrorKind.DivisionByZero | TuffErrorKind.NumericOverflow;
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

/** The state of one evaluation: the resolver's name bindings and the values of the open blocks. */
interface Env {
  /** The binding of every name use, from the resolver. */
  refs: NameRefs;
  /** Values of the open blocks, outermost first; each block's values are in binding order. */
  frames: number[][];
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
 * Folds the AST to a value. Every name was bound by resolver.ts before this runs.
 *
 * @param expr - The expression to evaluate.
 * @param refs - The binding of every name use, from `resolve`.
 * @returns The computed number, or an arithmetic error at the operator that caused it.
 */
export function evaluate(expr: Expr, refs: NameRefs): Result<number, TuffError> {
  return evaluateIn(expr, { refs, frames: [] });
}

function evaluateIn(expr: Expr, env: Env): Result<number, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal: {
      const checked = finite(expr.value);
      if (!checked.ok) return err({ kind: checked.error, span: expr.span });
      return ok(checked.value);
    }
    case NodeKind.Name:
      return evaluateName(expr, env);
    case NodeKind.Chain:
      return evaluateChain(expr, env);
    case NodeKind.Block:
      return evaluateBlock(expr, env);
  }
}

function evaluateName(name: NameNode, env: Env): Result<number, TuffError> {
  const ref = env.refs.get(name);
  const frame = ref === undefined ? undefined : env.frames[env.frames.length - 1 - ref.depth];
  const value = ref === undefined ? undefined : frame?.[ref.index];
  // Unreachable when the resolver ran first; TypeScript's array indexing still allows undefined here.
  if (value === undefined) return err({ kind: TuffErrorKind.InternalError, span: name.span });
  return ok(value);
}

function evaluateChain(chain: ChainNode, env: Env): Result<number, TuffError> {
  const first = evaluateIn(chain.first, env);
  if (!first.ok) return first;
  let value = first.value;
  for (const step of chain.steps) {
    const right = evaluateIn(step.operand, env);
    if (!right.ok) return right;
    const applied = OPERATORS[step.operator](value, right.value);
    if (!applied.ok) return err({ kind: applied.error, span: step.operatorSpan });
    value = applied.value;
  }
  return ok(value);
}

function evaluateBlock(block: BlockNode, env: Env): Result<number, TuffError> {
  const frame: number[] = [];
  env.frames.push(frame);
  const result = evaluateBlockBody(block, env, frame);
  env.frames.pop();
  return result;
}

function evaluateBlockBody(block: BlockNode, env: Env, frame: number[]): Result<number, TuffError> {
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
  // Unreachable when the resolver ran first; see evaluateName.
  if (ref === undefined || frame === undefined || ref.index >= frame.length) {
    return err({ kind: TuffErrorKind.InternalError, span: statement.target.span });
  }
  frame[ref.index] = value.value;
  return ok(undefined);
}
