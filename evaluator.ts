import {
  ok,
  resultTooLargeAt,
  undefinedNameAt,
  type Result,
  type TuffError,
} from "./errors.ts";
import { type Binding, type Expr, type Link } from "./parser.ts";

interface Scope {
  name: string;
  value: number;
  parent?: Scope;
}

function apply(op: Link["op"], left: number, right: number): number {
  if (op === "+") {
    return left + right;
  }

  return op === "-" ? left - right : left * right;
}

function lookup(name: string, scope: Scope | undefined): Scope | undefined {
  let current = scope;

  while (current !== undefined && current.name !== name) {
    current = current.parent;
  }

  return current;
}

function evaluateBlock(
  bindings: Binding[],
  result: Expr,
  scope: Scope | undefined,
): Result<number, TuffError> {
  const inner = bindings.reduce<Result<Scope | undefined, TuffError>>(
    (acc, binding) => {
      if (!acc.ok) {
        return acc;
      }

      const value = evaluate(binding.value, acc.value);

      if (!value.ok) {
        return value;
      }

      return ok({ name: binding.name, value: value.value, parent: acc.value });
    },
    ok(scope),
  );

  if (!inner.ok) {
    return inner;
  }

  return evaluate(result, inner.value);
}

/**
 * Computes the value of a parsed expression, reporting names that are not declared and values that leave the safe integer range.
 * @param expr - The expression tree produced by the parser.
 * @param scope - The let bindings visible to the expression, innermost first.
 * @returns The computed value, or a structured error.
 */
export function evaluate(expr: Expr, scope?: Scope): Result<number, TuffError> {
  if (expr.kind === "number") {
    return ok(expr.value);
  }

  if (expr.kind === "negate") {
    const inner = evaluate(expr.operand, scope);

    return inner.ok ? ok(-inner.value) : inner;
  }

  if (expr.kind === "reference") {
    const found = lookup(expr.name, scope);

    return found === undefined ? undefinedNameAt(expr.where) : ok(found.value);
  }

  if (expr.kind === "block") {
    return evaluateBlock(expr.bindings, expr.result, scope);
  }

  return expr.links.reduce<Result<number, TuffError>>(
    (acc, link) => {
      if (!acc.ok) {
        return acc;
      }

      const right = evaluate(link.operand, scope);

      if (!right.ok) {
        return right;
      }

      const value = apply(link.op, acc.value, right.value);

      return Number.isSafeInteger(value) ? ok(value) : resultTooLargeAt(link.where);
    },
    evaluate(expr.first, scope),
  );
}
