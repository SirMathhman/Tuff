import {
  ok,
  bitwiseOutOfRangeAt,
  type Err,
  divisionByZeroAt,
  immutableAssignmentAt,
  indexOutOfRangeAt,
  MAX_U64,
  referenceEscapesAt,
  resultTooLargeAt,
  typeMismatchAt,
  u64OutOfRangeAt,
  undefinedNameAt,
  useAfterMoveAt,
  type ErrorWhere,
  type Result,
  type TuffError,
} from "../errors.ts";
import { type AssignStatement, type CompareOp, type Expr, type Link, type LogicalOp, type Statement } from "../ast.ts";
import { type Cell, type Reference, type Scope, type Value, isReference, escapes, isVisible, typeName, sameType, asNumber, asBoolean, asU64 } from "./values.ts";
import { apply, applyU64, numericCompare } from "./operators.ts";

type EvalRule = (expr: Expr, scope: Scope | undefined) => Result<Value, TuffError>;

function isInt32(value: number): boolean {
  return value >= -2147483648 && value <= 2147483647;
}

// Bitwise operators work on 32-bit signed integers; a shift amount must be from 0 to 31.
function bitwiseProblem(op: Link["op"], left: number, right: number, where: ErrorWhere): Err<TuffError> | undefined {
  if (op === "<<" || op === ">>") {
    if (!isInt32(left)) {
      return bitwiseOutOfRangeAt(where, left, "a 32-bit signed integer");
    }

    return right < 0 || right > 31 ? bitwiseOutOfRangeAt(where, right, "a shift from 0 to 31") : undefined;
  }

  if (op === "|" || op === "&") {
    if (!isInt32(left) || !isInt32(right)) {
      return bitwiseOutOfRangeAt(where, isInt32(left) ? right : left, "a 32-bit signed integer");
    }
  }

  return undefined;
}

// Both operands are U64. Division truncates toward zero, and a shift amount is from 0 to 31.
function combineU64(link: Link, left: Value, right: Value): Result<Value, TuffError> {
  const a = asU64(left, link.where);

  if (!a.ok) {
    return a;
  }

  const b = asU64(right, link.where);

  if (!b.ok) {
    return b;
  }

  if (link.op === "/" && b.value === 0n) {
    return divisionByZeroAt(link.where, "A U64");
  }

  if ((link.op === "<<" || link.op === ">>") && b.value > 31n) {
    return bitwiseOutOfRangeAt(link.where, Number(b.value), "a shift from 0 to 31");
  }

  const value = applyU64(link.op, a.value, b.value);

  return value >= 0n && value <= MAX_U64 ? ok(value) : u64OutOfRangeAt(link.where, value);
}

function lookup(name: string, scope: Scope | undefined): Scope | undefined {
  let current = scope;

  while (current !== undefined && current.name !== name) {
    current = current.parent;
  }

  return current;
}

// The cell of a name that is declared and not moved.
function findCell(name: string, where: ErrorWhere, scope: Scope | undefined): Result<Cell, TuffError> {
  const found = lookup(name, scope);

  if (found === undefined) {
    return undefinedNameAt(where);
  }

  if (found.cell.moved) {
    return useAfterMoveAt(where);
  }

  return ok(found.cell);
}

// Using a whole array by name moves it: a second use is an error until the name is assigned again.
function readWhole(name: string, where: ErrorWhere, scope: Scope | undefined): Result<Value, TuffError> {
  const cell = findCell(name, where, scope);

  if (!cell.ok) {
    return cell;
  }

  if (Array.isArray(cell.value.value)) {
    cell.value.moved = true;
  }

  return ok(cell.value.value);
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

  if (!sameType(target.cell.value, value.value)) {
    return typeMismatchAt(statement.where, typeName(target.cell.value), typeName(value.value));
  }

  if (escapes(value.value, target)) {
    return referenceEscapesAt(statement.where);
  }

  target.cell.value = value.value;
  target.cell.moved = false;

  return ok(scope);
}

// The position of an element: a number inside an array of the given length.
function resolveSlot(index: Expr, length: number, where: ErrorWhere, scope: Scope | undefined, evaluateRule: EvalRule): Result<number, TuffError> {
  const position = evaluateRule(index, scope);

  if (!position.ok) {
    return position;
  }

  const slot = asNumber(position.value, where);

  if (!slot.ok) {
    return slot;
  }

  if (slot.value < 0 || slot.value >= length) {
    return indexOutOfRangeAt(where, slot.value, length);
  }

  return ok(slot.value);
}

function assignElement(
  name: string,
  index: Expr,
  value: Expr,
  where: ErrorWhere,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Scope | undefined, TuffError> {
  const target = lookup(name, scope);

  if (target === undefined) {
    return undefinedNameAt(where);
  }

  if (!target.mutable) {
    return immutableAssignmentAt(where);
  }

  if (target.cell.moved) {
    return useAfterMoveAt(where);
  }

  const array = target.cell.value;

  if (!Array.isArray(array)) {
    return typeMismatchAt(where, "an array", typeName(array));
  }

  const slot = resolveSlot(index, array.length, where, scope, evaluateRule);

  if (!slot.ok) {
    return slot;
  }

  const replacement = evaluateRule(value, scope);

  if (!replacement.ok) {
    return replacement;
  }

  const current = array[slot.value];

  if (current !== undefined && !sameType(current, replacement.value)) {
    return typeMismatchAt(where, typeName(current), typeName(replacement.value));
  }

  if (escapes(replacement.value, target)) {
    return referenceEscapesAt(where);
  }

  array[slot.value] = replacement.value;

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

      if (statement.kind === "derefAssign") {
        return assignThroughReference(statement.name, statement.value, statement.where, acc.value, evaluateRule);
      }

      if (statement.kind === "element") {
        return assignElement(statement.name, statement.index, statement.value, statement.where, acc.value, evaluateRule);
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

      if (escapes(value.value, acc.value)) {
        return referenceEscapesAt(statement.where);
      }

      return ok({
        name: statement.name,
        cell: { value: value.value, moved: false },
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

function compare(op: CompareOp, left: Value, right: Value, where: ErrorWhere): Result<Value, TuffError> {
  if (typeof left === "object" || typeof right === "object") {
    return typeMismatchAt(where, "a number, boolean, or string", "an array or a reference");
  }

  if (op === "==" || op === "!=") {
    if (typeof left !== typeof right) {
      return typeMismatchAt(where, typeName(left), typeName(right));
    }

    const equal = left === right;

    return ok(op === "==" ? equal : !equal);
  }

  if (typeof left === "bigint" || typeof right === "bigint") {
    const u64Left = asU64(left, where);

    if (!u64Left.ok) {
      return u64Left;
    }

    const u64Right = asU64(right, where);

    if (!u64Right.ok) {
      return u64Right;
    }

    return ok(numericCompare(op, u64Left.value, u64Right.value));
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

      if (typeof acc.value === "bigint" || typeof right.value === "bigint") {
        return combineU64(link, acc.value, right.value);
      }

      const left = asNumber(acc.value, link.where);

      if (!left.ok) {
        return left;
      }

      const rightNumber = asNumber(right.value, link.where);

      if (!rightNumber.ok) {
        return rightNumber;
      }

      if (link.op === "/" && rightNumber.value === 0) {
        return divisionByZeroAt(link.where, "A number");
      }

      const bitwise = bitwiseProblem(link.op, left.value, rightNumber.value, link.where);

      if (bitwise !== undefined) {
        return bitwise;
      }

      const value = apply(link.op, left.value, rightNumber.value);

      return Number.isSafeInteger(value) ? ok(value) : resultTooLargeAt(link.where);
    },
    evaluateRule(first, scope),
  );
}

// Each element must have the type of the first element, so an array has one element type.
function evaluateArray(elements: Expr[], where: ErrorWhere, scope: Scope | undefined, evaluateRule: EvalRule): Result<Value[], TuffError> {
  return elements.reduce<Result<Value[], TuffError>>(
    (acc, element) => {
      if (!acc.ok) {
        return acc;
      }

      const value = evaluateRule(element, scope);

      if (!value.ok) {
        return value;
      }

      if (escapes(value.value, scope)) {
        return referenceEscapesAt(where);
      }

      const first = acc.value[0];

      if (first !== undefined && !sameType(first, value.value)) {
        return typeMismatchAt(where, typeName(first), typeName(value.value));
      }

      return ok([...acc.value, value.value]);
    },
    ok([]),
  );
}

// Indexing does not move the array. A nested array is copied on read, so the copy can be changed independently.
function evaluateIndex(target: Expr, index: Expr, where: ErrorWhere, scope: Scope | undefined, evaluateRule: EvalRule): Result<Value, TuffError> {
  const container = target.kind === "reference" ? readWithoutMoving(target.name, target.where, scope) : evaluateRule(target, scope);

  if (!container.ok) {
    return container;
  }

  if (!Array.isArray(container.value)) {
    return typeMismatchAt(where, "an array", typeName(container.value));
  }

  const slot = resolveSlot(index, container.value.length, where, scope, evaluateRule);

  if (!slot.ok) {
    return slot;
  }

  const element = container.value[slot.value];

  return ok(Array.isArray(element) ? [...element] : element ?? 0);
}

function readWithoutMoving(name: string, where: ErrorWhere, scope: Scope | undefined): Result<Value, TuffError> {
  const cell = findCell(name, where, scope);

  return cell.ok ? ok(cell.value.value) : cell;
}

function evaluateRef(name: string, mutable: boolean, where: ErrorWhere, scope: Scope | undefined): Result<Value, TuffError> {
  const found = lookup(name, scope);

  if (found === undefined) {
    return undefinedNameAt(where);
  }

  if (mutable && !found.mutable) {
    return immutableAssignmentAt({ index: where.index, text: name });
  }

  return ok({ target: found, mutable });
}

function evaluateDeref(operand: Expr, where: ErrorWhere, scope: Scope | undefined, evaluateRule: EvalRule): Result<Value, TuffError> {
  const inner = evaluateRule(operand, scope);

  if (!inner.ok) {
    return inner;
  }

  if (!isReference(inner.value)) {
    return typeMismatchAt(where, "a reference", typeName(inner.value));
  }

  const target = inner.value.target;

  if (target.cell.moved) {
    return useAfterMoveAt({ index: where.index, text: target.name });
  }

  const value = target.cell.value;

  return ok(Array.isArray(value) ? [...value] : value);
}

// *name = value; writes through a mutable reference held by name.
function assignThroughReference(
  name: string,
  value: Expr,
  where: ErrorWhere,
  scope: Scope | undefined,
  evaluateRule: EvalRule,
): Result<Scope | undefined, TuffError> {
  const holder = lookup(name, scope);

  if (holder === undefined) {
    return undefinedNameAt(where);
  }

  if (!isReference(holder.cell.value)) {
    return typeMismatchAt(where, "a reference", typeName(holder.cell.value));
  }

  const reference = holder.cell.value;

  if (!reference.mutable) {
    return immutableAssignmentAt({ index: where.index, text: name });
  }

  const replacement = evaluateRule(value, scope);

  if (!replacement.ok) {
    return replacement;
  }

  const target = reference.target;

  if (!sameType(target.cell.value, replacement.value)) {
    return typeMismatchAt(where, typeName(target.cell.value), typeName(replacement.value));
  }

  if (escapes(replacement.value, target)) {
    return referenceEscapesAt(where);
  }

  target.cell.value = replacement.value;
  target.cell.moved = false;

  return ok(scope);
}

/**
 * Computes the value of a parsed expression, reporting undeclared names, invalid assignments, type mismatches, bad indexes, moved arrays, and values that leave the safe integer range.
 * @param expr - The expression tree produced by the parser.
 * @param scope - The let bindings visible to the expression, innermost first.
 * @returns The computed value, a number, boolean, string, or array, or a structured error.
 */
export function evaluate(expr: Expr, scope?: Scope): Result<Value, TuffError> {
  if (expr.kind === "number" || expr.kind === "u64" || expr.kind === "boolean" || expr.kind === "string") {
    return ok(expr.value);
  }

  if (expr.kind === "negate") {
    return evaluateNegate(expr.operand, expr.where, scope, evaluate);
  }

  if (expr.kind === "reference") {
    return readWhole(expr.name, expr.where, scope);
  }

  if (expr.kind === "ref") {
    return evaluateRef(expr.name, expr.mutable, expr.where, scope);
  }

  if (expr.kind === "deref") {
    return evaluateDeref(expr.operand, expr.where, scope, evaluate);
  }

  if (expr.kind === "array") {
    const elements = evaluateArray(expr.elements, expr.where, scope, evaluate);

    return elements.ok ? ok(elements.value) : elements;
  }

  if (expr.kind === "index") {
    return evaluateIndex(expr.target, expr.index, expr.where, scope, evaluate);
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
