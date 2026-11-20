import { StatementKind, type AssignStatement, type AssignThroughStatement, type BlockNode } from "../ast.ts";
import { TuffErrorKind, type TuffError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { Frame } from "../scope.ts";
import { isReference, type Value } from "../value.ts";
import { evaluateIfStatement, type Evaluate } from "./branch.ts";
import type { Env } from "./env.ts";
import { spanOf } from "./span-of.ts";

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
 * Evaluates a block: opens its frame, runs its statements and final expression, then closes the frame.
 *
 * @param block - The block.
 * @param env - The current evaluation state.
 * @param evaluate - Evaluates sub-expressions.
 * @returns The block's value, or an error from a statement or from a reference that would escape the block.
 */
export function evaluateBlock(block: BlockNode, env: Env, evaluate: Evaluate): Result<Value, TuffError> {
  const frame: Frame<Value> = [];
  env.frames.push(frame);
  const result = evaluateBlockBody(block, env, frame, evaluate);
  env.frames.pop();
  if (!result.ok) return result;
  if (!isReference(result.value)) return result;
  // The block's own frame is popped, so a reference to it, or to anything deeper, is not in env.frames.
  if (env.frames.includes(result.value.target)) return result;
  return err({ kind: TuffErrorKind.ReferenceEscapes, span: spanOf(block) });
}

function evaluateBlockBody(
  block: BlockNode,
  env: Env,
  frame: Frame<Value>,
  evaluate: Evaluate,
): Result<Value, TuffError> {
  for (const statement of block.statements) {
    if (statement.kind === StatementKind.Let) {
      const value = evaluate(statement.value, env);
      if (!value.ok) return value;
      frame.push(value.value);
      continue;
    }
    if (statement.kind === StatementKind.Block) {
      const ran = evaluate(statement.block, env);
      if (!ran.ok) return ran;
      continue;
    }
    if (statement.kind === StatementKind.If) {
      const ran = evaluateIfStatement(statement, env, evaluate);
      if (!ran.ok) return ran;
      continue;
    }
    const assigned =
      statement.kind === StatementKind.AssignThrough
        ? evaluateAssignThrough(statement, env, evaluate)
        : evaluateAssign(statement, env, evaluate);
    if (!assigned.ok) return assigned;
  }
  if (block.result === undefined) return ok(0);
  return evaluate(block.result, env);
}

function evaluateAssign(statement: AssignStatement, env: Env, evaluate: Evaluate): Result<undefined, TuffError> {
  const value = evaluate(statement.value, env);
  if (!value.ok) return value;
  const ref = env.refs.get(statement.target);
  const frame = ref === undefined ? undefined : env.frames[env.frames.length - 1 - ref.depth];
  const previous = ref === undefined || frame === undefined ? undefined : frame[ref.index];
  // Unreachable when the resolver ran first; see the name lookups in evaluator.ts.
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

function evaluateAssignThrough(
  statement: AssignThroughStatement,
  env: Env,
  evaluate: Evaluate,
): Result<undefined, TuffError> {
  const value = evaluate(statement.value, env);
  if (!value.ok) return value;
  const pointer = evaluate(statement.target, env);
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
