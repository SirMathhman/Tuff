import {
  ok,
  immutableAssignmentAt,
  resultTooLargeAt,
  undefinedNameAt,
  type Result,
  type TuffError,
} from "./errors.ts";
import { type AssignStatement, type Expr, type Link, type Statement } from "./ast.ts";

interface Cell {
  value: number;
}

interface Scope {
  name: string;
  cell: Cell;
  mutable: boolean;
  parent?: Scope;
}

type EvalRule = (expr: Expr, scope: Scope | undefined) => Result<number, TuffError>;

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

function assign(
  statement: AssignStatement,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Scope | undefined, TuffError> {
  const target = lookup(statement.name, scope);

  if (target === undefined) {
    return undefinedNameAt(statement.where);
  }

  if (!target.mutable) {
    return immutableAssignmentAt(statement.where);
  }

  const value = evaluateRule(statement.value, scope);

  if (!value.ok) {
    return value;
  }

  target.cell.value = value.value;

  return ok(scope);
}

function runStatements(
  statements: Statement[],
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Scope | undefined, TuffError> {
  return statements.reduce<Result<Scope | undefined, TuffError>>(
    (acc, statement) => {
      if (!acc.ok) {
        return acc;
      }

      if (statement.kind === "assign") {
        return assign(statement, acc.value, evaluateRule);
      }

      if (statement.kind === "scope") {
        const inner = runStatements(statement.statements, acc.value, evaluateRule);

        return inner.ok ? ok(acc.value) : inner;
      }

      const value = evaluateRule(statement.value, acc.value);

      if (!value.ok) {
        return value;
      }

      return ok({
        name: statement.name,
        cell: { value: value.value },
        mutable: statement.mutable,
        parent: acc.value,
      });
    },
    ok(scope),
  );
}

function evaluateBlock(
  statements: Statement[],
  result: Expr,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<number, TuffError> {
  const inner = runStatements(statements, scope, evaluateRule);

  if (!inner.ok) {
    return inner;
  }

  return evaluateRule(result, inner.value);
}

/**
 * Computes the value of a parsed expression, reporting undeclared names, invalid assignments, and values that leave the safe integer range.
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

    return found === undefined ? undefinedNameAt(expr.where) : ok(found.cell.value);
  }

  if (expr.kind === "block") {
    return evaluateBlock(expr.statements, expr.result, scope, evaluate);
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
