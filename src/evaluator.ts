import {
  ok,
  immutableAssignmentAt,
  resultTooLargeAt,
  typeMismatchAt,
  undefinedNameAt,
  type ErrorWhere,
  type Result,
  type TuffError,
} from "./errors.ts";
import { type AssignStatement, type CompareOp, type Expr, type Link, type LogicalOp, type Statement } from "./ast.ts";

type Value = number | boolean;

interface Cell {
  value: Value;
}

interface Scope {
  name: string;
  cell: Cell;
  mutable: boolean;
  parent?: Scope;
}

type EvalRule = (expr: Expr, scope: Scope | undefined) => Result<Value, TuffError>;

function typeName(value: Value): string {
  return typeof value === "number" ? "a number" : "a boolean";
}

function asNumber(value: Value, where: ErrorWhere): Result<number, TuffError> {
  if (typeof value === "number") {
    return ok(value);
  }

  return typeMismatchAt(where, "a number", typeName(value));
}

function asBoolean(value: Value, where: ErrorWhere): Result<boolean, TuffError> {
  if (typeof value === "boolean") {
    return ok(value);
  }

  return typeMismatchAt(where, "a boolean", typeName(value));
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

  if (typeof value.value !== typeof target.cell.value) {
    return typeMismatchAt(statement.where, typeName(target.cell.value), typeName(value.value));
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

      if (statement.kind === "branch") {
        const condition = evaluateRule(statement.condition, acc.value);

        if (!condition.ok) {
          return condition;
        }

        if (typeof condition.value !== "boolean") {
          return typeMismatchAt(statement.where, "a boolean condition", typeName(condition.value));
        }

        const chosen = runStatements(condition.value ? statement.then : statement.otherwise, acc.value, evaluateRule);

        return chosen.ok ? ok(acc.value) : chosen;
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
): Result<Value, TuffError> {
  const inner = runStatements(statements, scope, evaluateRule);

  if (!inner.ok) {
    return inner;
  }

  return evaluateRule(result, inner.value);
}

function evaluateUnary(
  operand: Expr,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
  apply: (value: Value) => Result<Value, TuffError>,
): Result<Value, TuffError> {
  const inner = evaluateRule(operand, scope);

  if (!inner.ok) {
    return inner;
  }

  return apply(inner.value);
}

function evaluateNegate(operand: Expr, where: ErrorWhere, scope: Scope | undefined, evaluateRule: EvalRule): Result<Value, TuffError> {
  return evaluateUnary(operand, scope, evaluateRule, (value) => {
    const number = asNumber(value, where);

    return number.ok ? ok(-number.value) : number;
  });
}

function evaluateReference(name: string, where: ErrorWhere, scope: Scope | undefined): Result<Value, TuffError> {
  const found = lookup(name, scope);

  return found === undefined ? undefinedNameAt(where) : ok(found.cell.value);
}

function evaluateIf(
  condition: Expr,
  then: Expr,
  otherwise: Expr,
  where: ErrorWhere,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Value, TuffError> {
  const test = evaluateRule(condition, scope);

  if (!test.ok) {
    return test;
  }

  if (typeof test.value !== "boolean") {
    return typeMismatchAt(where, "a boolean condition", typeName(test.value));
  }

  return evaluateRule(test.value ? then : otherwise, scope);
}

function evaluateNot(operand: Expr, where: ErrorWhere, scope: Scope | undefined, evaluateRule: EvalRule): Result<Value, TuffError> {
  return evaluateUnary(operand, scope, evaluateRule, (value) => {
    const boolean = asBoolean(value, where);

    return boolean.ok ? ok(!boolean.value) : boolean;
  });
}

function evaluateLogical(
  op: LogicalOp,
  left: Expr,
  right: Expr,
  where: ErrorWhere,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Value, TuffError> {
  const leftValue = evaluateRule(left, scope);

  if (!leftValue.ok) {
    return leftValue;
  }

  const leftBoolean = asBoolean(leftValue.value, where);

  if (!leftBoolean.ok) {
    return leftBoolean;
  }

  const decided = op === "&&" ? !leftBoolean.value : leftBoolean.value;

  if (decided) {
    return ok(leftBoolean.value);
  }

  const rightValue = evaluateRule(right, scope);

  if (!rightValue.ok) {
    return rightValue;
  }

  return asBoolean(rightValue.value, where);
}

function numericCompare(op: CompareOp, left: number, right: number): boolean {
  if (op === "<") {
    return left < right;
  }

  if (op === "<=") {
    return left <= right;
  }

  if (op === ">") {
    return left > right;
  }

  return left >= right;
}

function compare(op: CompareOp, left: Value, right: Value, where: ErrorWhere): Result<Value, TuffError> {
  if (op === "==" || op === "!=") {
    if (typeof left !== typeof right) {
      return typeMismatchAt(where, typeName(left), typeName(right));
    }

    const equal = left === right;

    return ok(op === "==" ? equal : !equal);
  }

  const a = asNumber(left, where);

  if (!a.ok) {
    return a;
  }

  const b = asNumber(right, where);

  if (!b.ok) {
    return b;
  }

  return ok(numericCompare(op, a.value, b.value));
}

function evaluatePair(left: Expr, right: Expr, scope: Scope | undefined, evaluateRule: EvalRule): Result<[Value, Value], TuffError> {
  const leftValue = evaluateRule(left, scope);

  if (!leftValue.ok) {
    return leftValue;
  }

  const rightValue = evaluateRule(right, scope);

  if (!rightValue.ok) {
    return rightValue;
  }

  return ok([leftValue.value, rightValue.value]);
}

function evaluateCompare(
  op: CompareOp,
  left: Expr,
  right: Expr,
  where: ErrorWhere,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Value, TuffError> {
  const pair = evaluatePair(left, right, scope, evaluateRule);

  if (!pair.ok) {
    return pair;
  }

  return compare(op, pair.value[0], pair.value[1], where);
}

function evaluateChain(first: Expr, links: Link[], scope: Scope | undefined, evaluateRule: EvalRule): Result<Value, TuffError> {
  return links.reduce<Result<Value, TuffError>>(
    (acc, link) => {
      if (!acc.ok) {
        return acc;
      }

      const right = evaluateRule(link.operand, scope);

      if (!right.ok) {
        return right;
      }

      const left = asNumber(acc.value, link.where);

      if (!left.ok) {
        return left;
      }

      const rightNumber = asNumber(right.value, link.where);

      if (!rightNumber.ok) {
        return rightNumber;
      }

      const value = apply(link.op, left.value, rightNumber.value);

      return Number.isSafeInteger(value) ? ok(value) : resultTooLargeAt(link.where);
    },
    evaluateRule(first, scope),
  );
}

/**
 * Computes the value of a parsed expression, reporting undeclared names, invalid assignments, type mismatches, and values that leave the safe integer range.
 * @param expr - The expression tree produced by the parser.
 * @param scope - The let bindings visible to the expression, innermost first.
 * @returns The computed value, a number or a boolean, or a structured error.
 */
export function evaluate(expr: Expr, scope?: Scope): Result<Value, TuffError> {
  if (expr.kind === "number" || expr.kind === "boolean") {
    return ok(expr.value);
  }

  if (expr.kind === "negate") {
    return evaluateNegate(expr.operand, expr.where, scope, evaluate);
  }

  if (expr.kind === "reference") {
    return evaluateReference(expr.name, expr.where, scope);
  }

  if (expr.kind === "if") {
    return evaluateIf(expr.condition, expr.then, expr.otherwise, expr.where, scope, evaluate);
  }

  if (expr.kind === "not") {
    return evaluateNot(expr.operand, expr.where, scope, evaluate);
  }

  if (expr.kind === "logical") {
    return evaluateLogical(expr.op, expr.left, expr.right, expr.where, scope, evaluate);
  }

  if (expr.kind === "compare") {
    return evaluateCompare(expr.op, expr.left, expr.right, expr.where, scope, evaluate);
  }

  if (expr.kind === "block") {
    return evaluateBlock(expr.statements, expr.result, scope, evaluate);
  }

  return evaluateChain(expr.first, expr.links, scope, evaluate);
}
