import { NodeKind, type BlockNode, type ChainNode, type Expr } from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import { createScope, lookup, type Scope } from "./scope.ts";

/**
 * Checks that every name is bound in scope. Computes no values.
 *
 * @param expr - The expression to check.
 * @param scope - The names bound by enclosing blocks, or `undefined` at the top level.
 * @returns `ok(undefined)` if every name resolves, otherwise an `UnknownName` error at the first unbound name.
 */
export function resolve(expr: Expr, scope: Scope<boolean> | undefined): Result<undefined, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal:
      return ok(undefined);
    case NodeKind.Name:
      if (lookup(scope, expr.name) === undefined) {
        return err({ kind: TuffErrorKind.UnknownName, span: expr.span });
      }
      return ok(undefined);
    case NodeKind.Chain:
      return resolveChain(expr, scope);
    case NodeKind.Block:
      return resolveBlock(expr, scope);
  }
}

function resolveChain(chain: ChainNode, scope: Scope<boolean> | undefined): Result<undefined, TuffError> {
  const first = resolve(chain.first, scope);
  if (!first.ok) return first;
  for (const step of chain.steps) {
    const operand = resolve(step.operand, scope);
    if (!operand.ok) return operand;
  }
  return ok(undefined);
}

function resolveBlock(block: BlockNode, scope: Scope<boolean> | undefined): Result<undefined, TuffError> {
  const inner = createScope<boolean>(scope);
  for (const binding of block.bindings) {
    const value = resolve(binding.value, inner);
    if (!value.ok) return value;
    inner.locals.set(binding.name, true);
  }
  return resolve(block.result, inner);
}
