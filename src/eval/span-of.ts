import { NodeKind, type Expr } from "../ast.ts";
import type { Span } from "../span.ts";

/**
 * Finds the source span of an expression, for errors that point at its value.
 *
 * @param expr - The expression.
 * @returns The span of the expression's leading token. A block without a final expression has no value, so it gets an empty span.
 */
export function spanOf(expr: Expr): Span {
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
