import { NodeKind, Operator, type BlockNode, type ChainNode, type Expr } from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";
import { createScope, lookup, type Scope } from "./scope.ts";

type OperatorError = TuffErrorKind.DivisionByZero | TuffErrorKind.NumericOverflow;
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

function finite(n: number): Result<number, TuffErrorKind.NumericOverflow> {
  return Number.isFinite(n) ? ok(n) : err(TuffErrorKind.NumericOverflow);
}

const OPERATORS: Record<Operator, BinaryOp> = {
  [Operator.Add]: (a, b) => finite(a + b),
  [Operator.Subtract]: (a, b) => finite(a - b),
  [Operator.Multiply]: (a, b) => finite(a * b),
  [Operator.Divide]: (a, b) => (b === 0 ? err(TuffErrorKind.DivisionByZero) : ok(Math.trunc(a / b))),
};

/** Folds the AST to a value. Name errors are reported by resolver.ts before this runs. */
export function evaluate(expr: Expr, scope: Scope<number> | undefined): Result<number, TuffError> {
  switch (expr.kind) {
    case NodeKind.Literal:
      return ok(expr.value);
    case NodeKind.Name: {
      const value = lookup(scope, expr.name);
      // Unreachable after resolve(); kept so the type stays total without a host exception.
      if (value === undefined) return err({ kind: TuffErrorKind.UnknownName, span: expr.span });
      return ok(value);
    }
    case NodeKind.Chain:
      return evaluateChain(expr, scope);
    case NodeKind.Block:
      return evaluateBlock(expr, scope);
  }
}

function evaluateChain(chain: ChainNode, scope: Scope<number> | undefined): Result<number, TuffError> {
  const first = evaluate(chain.first, scope);
  if (!first.ok) return first;
  let value = first.value;
  for (const step of chain.steps) {
    const right = evaluate(step.operand, scope);
    if (!right.ok) return right;
    const applied = OPERATORS[step.operator](value, right.value);
    if (!applied.ok) return err({ kind: applied.error, span: step.operatorSpan });
    value = applied.value;
  }
  return ok(value);
}

function evaluateBlock(block: BlockNode, scope: Scope<number> | undefined): Result<number, TuffError> {
  const inner = createScope<number>(scope);
  for (const binding of block.bindings) {
    const value = evaluate(binding.value, inner);
    if (!value.ok) return value;
    inner.locals.set(binding.name, value.value);
  }
  return evaluate(block.result, inner);
}
