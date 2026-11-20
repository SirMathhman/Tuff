import type { Expr, IfNode, IfStatement, MatchNode } from "../ast.ts";
import { TuffErrorKind, type TuffError } from "../errors.ts";
import { err, ok, type Result } from "../result.ts";
import type { Frame } from "../scope.ts";
import { isReference, type Value } from "../value.ts";
import type { Env } from "./env.ts";
import { spanOf } from "./span-of.ts";

/**
 * Evaluates an expression. Passed in as a parameter so this module never imports the evaluator.
 */
export type Evaluate = (expr: Expr, env: Env) => Result<Value, TuffError>;

/**
 * Evaluates both branches, reports an error from either, and returns the chosen branch's value.
 *
 * @param node - The conditional.
 * @param env - The current evaluation state.
 * @param evaluate - Evaluates a sub-expression.
 * @returns The selected branch's value, or an error if the condition is not a boolean or a branch fails.
 */
export function evaluateIf(node: IfNode, env: Env, evaluate: Evaluate): Result<Value, TuffError> {
  const condition = evaluate(node.condition, env);
  if (!condition.ok) return condition;
  if (typeof condition.value !== "boolean") {
    return err({ kind: TuffErrorKind.NotABoolean, span: spanOf(node.condition) });
  }
  const thenResult = evaluateBranch(node.thenBranch, env, condition.value, evaluate);
  const elseResult = evaluateBranch(node.elseBranch, env, !condition.value, evaluate);
  if (!thenResult.ok) return thenResult;
  if (!elseResult.ok) return elseResult;
  return condition.value ? thenResult : elseResult;
}

/**
 * Runs an `if` statement: both branches run, the condition selects which one's writes are kept, and no value is produced.
 *
 * @param node - The `if` statement.
 * @param env - The current evaluation state.
 * @param evaluate - Evaluates a sub-expression.
 * @returns Nothing on success, or the first error from the condition or a branch.
 */
export function evaluateIfStatement(node: IfStatement, env: Env, evaluate: Evaluate): Result<undefined, TuffError> {
  const condition = evaluate(node.condition, env);
  if (!condition.ok) return condition;
  if (typeof condition.value !== "boolean") {
    return err({ kind: TuffErrorKind.NotABoolean, span: spanOf(node.condition) });
  }
  const thenResult = evaluateBranch(node.thenBlock, env, condition.value, evaluate);
  const elseResult = evaluateBranch(node.elseBlock, env, !condition.value, evaluate);
  if (!thenResult.ok) return thenResult;
  if (!elseResult.ok) return elseResult;
  return ok(undefined);
}

/**
 * Evaluates every arm, then returns the value of the first arm whose pattern equals the scrutinee.
 * The arms that are not selected have their writes undone.
 *
 * @param node - The match.
 * @param env - The current evaluation state.
 * @param evaluate - Evaluates a sub-expression.
 * @returns The selected arm's value, or an error: a pattern of the wrong kind, a failing arm, or no matching arm.
 */
export function evaluateMatch(node: MatchNode, env: Env, evaluate: Evaluate): Result<Value, TuffError> {
  const scrutinee = evaluate(node.scrutinee, env);
  if (!scrutinee.ok) return scrutinee;
  if (isReference(scrutinee.value)) {
    return err({ kind: TuffErrorKind.ReferenceAsValue, span: spanOf(node.scrutinee) });
  }
  for (const arm of node.arms) {
    if (arm.pattern === undefined) continue;
    if (typeof arm.pattern.value === "number" && !Number.isFinite(arm.pattern.value)) {
      return err({ kind: TuffErrorKind.NumericOverflow, span: arm.patternSpan });
    }
    if (typeof arm.pattern.value !== typeof scrutinee.value) {
      return err({ kind: TuffErrorKind.TypeMismatch, span: arm.patternSpan });
    }
  }
  const matched = node.arms.findIndex((arm) => arm.pattern === undefined || arm.pattern.value === scrutinee.value);
  const results = node.arms.map((arm, index) => evaluateBranch(arm.body, env, index === matched, evaluate));
  for (const result of results) {
    if (!result.ok) return result;
  }
  if (matched === -1) return err({ kind: TuffErrorKind.NoMatchingArm, span: node.span });
  const chosen = results[matched];
  // Unreachable: matched indexes an arm, and every arm produced a result.
  if (chosen === undefined) return err({ kind: TuffErrorKind.InternalError, span: node.span });
  return chosen;
}

/**
 * Evaluates one branch. If the branch is not the chosen one, the writes it made are undone.
 *
 * @param branch - The branch to evaluate.
 * @param env - The current evaluation state.
 * @param chosen - Whether the condition selected this branch.
 * @param evaluate - Evaluates the branch.
 * @returns The branch's value, or its error.
 */
function evaluateBranch(branch: Expr, env: Env, chosen: boolean, evaluate: Evaluate): Result<Value, TuffError> {
  const snapshot = env.frames.map((frame) => [...frame]);
  const result = evaluate(branch, env);
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
