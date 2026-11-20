import { NodeKind, type BorrowNode, type Expr, type NameNode } from "./ast.ts";
import { evaluateIf, evaluateMatch } from "./eval/branch.ts";
import { evaluateBlock } from "./eval/block.ts";
import { evaluateChain, evaluateDeref, finite } from "./eval/chain.ts";
import type { Env } from "./eval/env.ts";
import { spanOf } from "./eval/span-of.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import type { NameRefs } from "./scope.ts";
import { isReference, type Value } from "./value.ts";

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

/**
 * Dispatches one expression to its evaluator. The only entry point of the evaluation recursion;
 * helpers in `eval/` receive it as a parameter.
 *
 * @param expr - The expression.
 * @param env - The current evaluation state.
 * @returns The expression's value, or its error.
 */
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
      return evaluateDeref(expr, env, evaluateIn);
    case NodeKind.Chain:
      return evaluateChain(expr, env, evaluateIn);
    case NodeKind.If:
      return evaluateIf(expr, env, evaluateIn);
    case NodeKind.Match:
      return evaluateMatch(expr, env, evaluateIn);
    case NodeKind.Block:
      return evaluateBlock(expr, env, evaluateIn);
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
