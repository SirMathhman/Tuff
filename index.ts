interface TuffError {
  what: string;
  where: number;
  why: string;
  fix: string;
}

interface Success<T> {
  ok: true;
  value: T;
}

interface Failure<E> {
  ok: false;
  error: E;
}

type Result<T, E> = Success<T> | Failure<E>;

enum Operator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
}

enum EntryKind {
  Operator = "operator",
  Group = "group",
}

interface OperatorEntry {
  kind: EntryKind.Operator;
  operator: Operator;
}

// An open parenthesis, remembering the sign written directly before it.
interface GroupEntry {
  kind: EntryKind.Group;
  sign: number;
}

type StackEntry = OperatorEntry | GroupEntry;

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isSpace(c: string): boolean {
  return c.length === 1 && c.trim() === "";
}

function toOperator(c: string): Operator | null {
  if (c === "+") return Operator.Add;
  if (c === "-") return Operator.Subtract;
  if (c === "*") return Operator.Multiply;
  return null;
}

function skipSpaces(source: string, pos: number): number {
  let i = pos;
  while (isSpace(source.charAt(i))) i++;
  return i;
}

function describe(c: string): string {
  if (c === "") return "the end of the input";
  if (isSpace(c)) return "whitespace";
  return `'${c}'`;
}

function fail(
  what: string,
  where: number,
  why: string,
  fix: string,
): Failure<TuffError> {
  return { ok: false, error: { what, where, why, fix } };
}

function expectedNumber(source: string, where: number): Failure<TuffError> {
  return fail(
    `Expected a number or '(' but found ${describe(source.charAt(where))}`,
    where,
    "Every '+', '-', or '*' must be followed by an integer or a parenthesized expression, and an expression must start with one.",
    "Put an integer or '(' at this position, or remove the operator before it.",
  );
}

function expectedOperator(
  source: string,
  where: number,
  grouped: boolean,
): Failure<TuffError> {
  const found = describe(source.charAt(where));
  if (grouped) {
    return fail(
      `Expected '+', '-', '*', or ')' but found ${found}`,
      where,
      "Two terms can only be combined with '+', '-', or '*', and a '(' must be closed with ')'; any other character cannot follow a number.",
      "Insert '+', '-', '*', or ')' here, or remove the extra character.",
    );
  }
  return fail(
    `Expected '+', '-', or '*' but found ${found}`,
    where,
    "Two numbers can only be combined with '+', '-', or '*'; any other character cannot follow a number.",
    "Insert '+', '-', or '*' between the numbers, or remove the extra character.",
  );
}

function expectedClose(source: string, where: number): Failure<TuffError> {
  return fail(
    `Expected ')' but found ${describe(source.charAt(where))}`,
    where,
    "Every '(' must be closed by a matching ')'.",
    "Add a ')' at the end of the parenthesized expression.",
  );
}

function precedence(op: Operator): number {
  return op === Operator.Multiply ? 2 : 1;
}

function apply(left: number, op: Operator, right: number): number {
  if (op === Operator.Add) return left + right;
  if (op === Operator.Subtract) return left - right;
  return left * right;
}

// Pops the newest operator and applies it to the two newest values. The grammar
// guarantees both operands are present.
function applyTop(values: number[], ops: StackEntry[]): void {
  const entry = ops.pop();
  if (entry?.kind !== EntryKind.Operator) return;
  const right = values.pop() ?? 0;
  const left = values.pop() ?? 0;
  values.push(apply(left, entry.operator, right));
}

// Closes the innermost group: applies its operators, then scales the result by
// the sign written before the "(".
function closeGroup(values: number[], ops: StackEntry[]): void {
  for (
    let top = ops[ops.length - 1];
    top?.kind === EntryKind.Operator;
    top = ops[ops.length - 1]
  ) {
    applyTop(values, ops);
  }
  const group = ops.pop();
  if (group?.kind !== EntryKind.Group) return;
  values.push(group.sign * (values.pop() ?? 0));
}

// Shunting-yard evaluation with explicit stacks, so nesting depth is not limited
// by the JavaScript call stack. Offsets in errors refer to the unmodified source.
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const values: number[] = [];
  const ops: StackEntry[] = [];
  let depth = 0; // number of open parentheses
  let pos = 0;
  let expectOperand = true;

  for (;;) {
    if (expectOperand) {
      pos = skipSpaces(tuffSource, pos);
      let sign = 1;
      let c = tuffSource.charAt(pos);
      if (c === "+" || c === "-") {
        if (c === "-") sign = -1;
        pos++;
        c = tuffSource.charAt(pos);
      }
      if (c === "(") {
        ops.push({ kind: EntryKind.Group, sign });
        depth++;
        pos++;
        continue;
      }
      const start = pos;
      while (isDigit(tuffSource.charAt(pos))) pos++;
      if (pos === start) return expectedNumber(tuffSource, pos);
      values.push(sign * parseInt(tuffSource.slice(start, pos), 10));
      expectOperand = false;
      continue;
    }

    pos = skipSpaces(tuffSource, pos);
    const grouped = depth > 0;
    if (pos === tuffSource.length) {
      if (grouped) return expectedClose(tuffSource, pos);
      break;
    }
    const c = tuffSource.charAt(pos);
    if (grouped && c === ")") {
      closeGroup(values, ops);
      depth--;
      pos++;
      continue;
    }
    const op = toOperator(c);
    if (op === null) return expectedOperator(tuffSource, pos, grouped);

    // Left-associative: apply pending operators that bind at least as tightly.
    for (
      let top = ops[ops.length - 1];
      top?.kind === EntryKind.Operator &&
      precedence(top.operator) >= precedence(op);
      top = ops[ops.length - 1]
    ) {
      applyTop(values, ops);
    }
    ops.push({ kind: EntryKind.Operator, operator: op });
    pos++;
    expectOperand = true;
  }

  while (ops.length > 0) applyTop(values, ops);
  return { ok: true, value: values.pop() ?? 0 };
}
