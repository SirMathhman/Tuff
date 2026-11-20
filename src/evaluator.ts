import {
  NodeKind,
  Operator,
  StatementKind,
  type AssignStatement,
  type AssignThroughStatement,
  type BlockNode,
  type BorrowNode,
  type ChainNode,
  type DerefNode,
  type IfNode,
  type MatchNode,
  type Expr,
  type NameNode,
} from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import type { Frame, NameRefs } from "./scope.ts";
import type { Span } from "./span.ts";
import { isReference, type Value } from "./value.ts";

type OperatorError =
  | TuffErrorKind.DivisionByZero
  | TuffErrorKind.NumericOverflow
  | TuffErrorKind.BooleanOperand
  | TuffErrorKind.ReferenceAsValue;
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

/** The state of one evaluation: the resolver's name bindings and the values of the open blocks. */
interface Env {
  /** The binding of every name use, from the resolver. */
  refs: NameRefs;
  /** Values of the open blocks, outermost first; each block's values are in binding order. */
  frames: Frame<Value>[];
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
 * @returns The result, or an error if an operand is a boolean or a reference, or the arithmetic fails.
 */
function applyOperator(operator: Operator, a: Value, b: Value): Result<number, OperatorError> {
  if (typeof a === "number" && typeof b === "number") return OPERATORS[operator](a, b);
  if (isReference(a) || isReference(b)) return err(TuffErrorKind.ReferenceAsValue);
  return err(TuffErrorKind.BooleanOperand);
}

/**
 * Finds the source span of an expression, for errors that point at its value.
 *
 * @param expr - The expression.
 * @returns The span of the expression's leading token. A block without a final expression has no value, so it gets an empty span.
 */
function spanOf(expr: Expr): Span {
  switch (expr.kind) {
    case NodeKind.Literal:
    case NodeKind.Boolean:
    case NodeKind.Name:
    case NodeKind.Borrow:
    case NodeKind.Deref:
    case NodeKind.If:
    case NodeKind.Match:
      return expr.span;
    case NodeKind.Chain:
      return spanOf(expr.first);
    case NodeKind.Block:
      return expr.result === undefined ? { start: 0, end: 0 } : spanOf(expr.result);
  }
}

/**
 * Whether a value would outlive the block that holds the slot it is stored into.
 *
 * @param value - The value being stored.
 * @param env - The current evaluation state.
 * @param destIndex - The position in `env.frames` of the block receiving the value.
 * @returns True if the value is a reference to a block that is not open at or outside the destination.
 */
function outlives(value: Value, env: Env, destIndex: number): boolean {
  if (!isReference(value)) return false;
  const targetIndex = env.frames.indexOf(value.target);
  return targetIndex === -1 || targetIndex > destIndex;
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
  if (isReference(result.value)) return err({ kind: TuffErrorKind.ReferenceEscapes, span: spanOf(expr) });
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
    case NodeKind.Borrow:
      return evaluateBorrow(expr, env);
    case NodeKind.Deref:
      return evaluateDeref(expr, env);
    case NodeKind.Chain:
      return evaluateChain(expr, env);
    case NodeKind.If:
      return evaluateIf(expr, env);
    case NodeKind.Match:
      return evaluateMatch(expr, env);
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

function evaluateBorrow(borrow: BorrowNode, env: Env): Result<Value, TuffError> {
  const ref = env.refs.get(borrow.target);
  const frame = ref === undefined ? undefined : env.frames[env.frames.length - 1 - ref.depth];
  const bound = ref === undefined || frame === undefined ? undefined : frame[ref.index];
  // Unreachable when the resolver ran first; see evaluateName.
  if (ref === undefined || frame === undefined || bound === undefined) {
    return err({ kind: TuffErrorKind.InternalError, span: borrow.span });
  }
  return ok({ target: frame, index: ref.index, mutable: borrow.mutable });
}

function evaluateDeref(deref: DerefNode, env: Env): Result<Value, TuffError> {
  const pointer = evaluateIn(deref.operand, env);
  if (!pointer.ok) return pointer;
  if (!isReference(pointer.value)) return err({ kind: TuffErrorKind.NotAReference, span: deref.span });
  const value = pointer.value.target[pointer.value.index];
  // Unreachable: a live reference always points at a bound slot.
  if (value === undefined) return err({ kind: TuffErrorKind.InternalError, span: deref.span });
  return ok(value);
}

/**
 * Evaluates both branches, reports an error from either, and returns the chosen branch's value.
 *
 * @param node - The conditional.
 * @param env - The current evaluation state.
 * @returns The selected branch's value, or an error if the condition is not a boolean or the branch fails.
 */
function evaluateIf(node: IfNode, env: Env): Result<Value, TuffError> {
  const condition = evaluateIn(node.condition, env);
  if (!condition.ok) return condition;
  if (typeof condition.value !== "boolean") {
    return err({ kind: TuffErrorKind.NotABoolean, span: spanOf(node.condition) });
  }
  const thenResult = evaluateBranch(node.thenBranch, env, condition.value);
  const elseResult = evaluateBranch(node.elseBranch, env, !condition.value);
  if (!thenResult.ok) return thenResult;
  if (!elseResult.ok) return elseResult;
  return condition.value ? thenResult : elseResult;
}

/**
 * Evaluates one branch. If the branch is not the chosen one, the writes it made are undone.
 *
 * @param branch - The branch to evaluate.
 * @param env - The current evaluation state.
 * @param chosen - Whether the condition selected this branch.
 * @returns The branch's value, or its error.
 */
function evaluateBranch(branch: Expr, env: Env, chosen: boolean): Result<Value, TuffError> {
  const snapshot = env.frames.map((frame) => [...frame]);
  const result = evaluateIn(branch, env);
  if (!chosen) restoreFrames(env.frames, snapshot);
  return result;
}

/**
 * Restores every open block's values to a snapshot taken earlier, in place.
 *
 * @param frames - The open blocks' values, outermost first.
 * @param snapshot - Copies of the same blocks' values, taken earlier.
 */
function restoreFrames(frames: Frame<Value>[], snapshot: Frame<Value>[]): void {
  for (const [index, frame] of frames.entries()) {
    const saved = snapshot[index];
    if (saved === undefined) continue;
    frame.length = 0;
    frame.push(...saved);
  }
}

/**
 * Evaluates every arm, then returns the value of the first arm whose pattern equals the scrutinee.
 * The arms that are not selected have their writes undone.
 *
 * @param node - The match.
 * @param env - The current evaluation state.
 * @returns The selected arm's value, or an error: a pattern of the wrong kind, a failing arm, or no matching arm.
 */
function evaluateMatch(node: MatchNode, env: Env): Result<Value, TuffError> {
  const scrutinee = evaluateIn(node.scrutinee, env);
  if (!scrutinee.ok) return scrutinee;
  for (const arm of node.arms) {
    if (arm.pattern !== undefined && typeof arm.pattern.value !== typeof scrutinee.value) {
      return err({ kind: TuffErrorKind.TypeMismatch, span: arm.patternSpan });
    }
  }
  const matched = node.arms.findIndex((arm) => arm.pattern === undefined || arm.pattern.value === scrutinee.value);
  const results = node.arms.map((arm, index) => evaluateBranch(arm.body, env, index === matched));
  for (const result of results) {
    if (!result.ok) return result;
  }
  if (matched === -1) return err({ kind: TuffErrorKind.NoMatchingArm, span: node.span });
  const chosen = results[matched];
  // Unreachable: matched indexes an arm, and every arm produced a result.
  if (chosen === undefined) return err({ kind: TuffErrorKind.InternalError, span: node.span });
  return chosen;
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
  const frame: Frame<Value> = [];
  env.frames.push(frame);
  const result = evaluateBlockBody(block, env, frame);
  env.frames.pop();
  if (!result.ok) return result;
  if (!isReference(result.value)) return result;
  // The block's own frame is popped, so a reference to it, or to anything deeper, is not in env.frames.
  if (env.frames.includes(result.value.target)) return result;
  return err({ kind: TuffErrorKind.ReferenceEscapes, span: spanOf(block) });
}

function evaluateBlockBody(block: BlockNode, env: Env, frame: Frame<Value>): Result<Value, TuffError> {
  for (const statement of block.statements) {
    if (statement.kind === StatementKind.Let) {
      const value = evaluateIn(statement.value, env);
      if (!value.ok) return value;
      frame.push(value.value);
      continue;
    }
    const assigned =
      statement.kind === StatementKind.AssignThrough
        ? evaluateAssignThrough(statement, env)
        : evaluateAssign(statement, env);
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
  if (outlives(value.value, env, env.frames.indexOf(frame))) {
    return err({ kind: TuffErrorKind.ReferenceEscapes, span: spanOf(statement.value) });
  }
  frame[ref.index] = value.value;
  return ok(undefined);
}

function evaluateAssignThrough(statement: AssignThroughStatement, env: Env): Result<undefined, TuffError> {
  const value = evaluateIn(statement.value, env);
  if (!value.ok) return value;
  const pointer = evaluateIn(statement.target, env);
  if (!pointer.ok) return pointer;
  if (!isReference(pointer.value)) return err({ kind: TuffErrorKind.NotAReference, span: statement.span });
  const { target, index, mutable } = pointer.value;
  if (!mutable) return err({ kind: TuffErrorKind.ImmutableAssignment, span: statement.span });
  const previous = target[index];
  const destIndex = env.frames.indexOf(target);
  // Unreachable: a live reference points into a block that is still open.
  if (previous === undefined || destIndex === -1) {
    return err({ kind: TuffErrorKind.InternalError, span: statement.span });
  }
  if (typeof previous !== typeof value.value) {
    return err({ kind: TuffErrorKind.TypeMismatch, span: statement.span });
  }
  if (outlives(value.value, env, destIndex)) {
    return err({ kind: TuffErrorKind.ReferenceEscapes, span: spanOf(statement.value) });
  }
  target[index] = value.value;
  return ok(undefined);
}
