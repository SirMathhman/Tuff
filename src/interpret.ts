import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric string
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Allow simple arithmetic expressions consisting of digits, operators, dots, parentheses and whitespace
  if (/^[0-9+\-*/().\s]+$/.test(trimmed)) {
    const r = evaluateExpression(trimmed);
    if (r.ok) return ok(r.value);
    return err(r.error);
  }

  return err("interpret: input is not a number or valid expression");
}

// --- Expression evaluator (supports +, -, *, /, parentheses, decimals, unary minus)

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "paren"; value: string };

function tokenize(expr: string): Result<Token[], string> {
  // Regex-based tokenizer: reduces branching and complexity
  const tokens: Token[] = [];
  const tokenRe = /\s+|(?:\d+\.\d*|\d*\.\d+|\d+)|[()+\-*/]/g;
  let m: RegExpExecArray | undefined;
  while ((m = tokenRe.exec(expr) || undefined)) {
    const s = m[0];
    if (/^\s+$/.test(s)) continue;
    if (s === "+" || s === "-" || s === "*" || s === "/") {
      tokens.push({ type: "op", value: s });
      continue;
    }
    if (s === "(" || s === ")") {
      tokens.push({ type: "paren", value: s });
      continue;
    }
    const num = Number(s);
    if (!Number.isFinite(num)) return err("Invalid number in expression");
    tokens.push({ type: "num", value: num });
  }
  // Sanity check: ensure entire input consists of valid tokens
  const cleaned = expr.replace(/\s+/g, "");
  let reconstructed = "";
  for (const tk of tokens)
    reconstructed +=
      tk.type === "num" ? String((tk as any).value) : (tk as any).value;
  if (cleaned !== reconstructed) return err("Invalid character in expression");
  return ok(tokens);
}

function markUnaryMinus(
  tokens: Token[]
): (Token | { type: "op"; value: "u-" })[] {
  const out: (Token | { type: "op"; value: "u-" })[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "op" && t.value === "-") {
      const prev = tokens[i - 1];
      const isUnary =
        !prev ||
        prev.type === "op" ||
        (prev.type === "paren" && prev.value === "(");
      if (isUnary) {
        out.push({ type: "op", value: "u-" });
        continue;
      }
    }
    out.push(t);
  }
  return out;
}

function popWhileHigherPrecedence(
  currentOpValue: string,
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[],
  output: (Token | { type: "op"; value: "u-" })[],
  precedence: (op: string) => number,
  isLeftAssoc: (op: string) => boolean
) {
  while (ops.length > 0 && ops[ops.length - 1].type === "op") {
    const topOp = (ops[ops.length - 1] as { type: "op"; value: string }).value;
    const p1 = precedence(currentOpValue);
    const p2 = precedence(topOp);
    if (
      (isLeftAssoc(currentOpValue) && p1 <= p2) ||
      (!isLeftAssoc(currentOpValue) && p1 < p2)
    ) {
      output.push(ops.pop() as { type: "op"; value: any });
    } else break;
  }
}

function popUntilLeftParen(
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[],
  output: (Token | { type: "op"; value: "u-" })[]
): Result<void, string> {
  let found = false;
  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === "paren" && top.value === "(") {
      found = true;
      break;
    }
    output.push(top as { type: "op"; value: string });
  }
  if (!found) return err("Mismatched parentheses in expression");
  return ok(undefined);
}

function toRPN(
  tokens: Token[]
): Result<(Token | { type: "op"; value: "u-" })[], string> {
  const tks = markUnaryMinus(tokens);
  const output: (Token | { type: "op"; value: "u-" })[] = [];
  const ops: (
    | { type: "op"; value: string }
    | { type: "paren"; value: string }
  )[] = [];

  const precedence = (op: string) =>
    op === "+" || op === "-" ? 1 : op === "u-" ? 3 : 2;
  const isLeftAssoc = (op: string) => op !== "u-";

  for (const t of tks) {
    if (t.type === "num") {
      output.push(t);
      continue;
    }
    if (t.type === "op") {
      popWhileHigherPrecedence(t.value, ops, output, precedence, isLeftAssoc);
      ops.push(t);
      continue;
    }
    if (t.type === "paren") {
      if (t.value === "(") {
        ops.push(t);
      } else {
        const res = popUntilLeftParen(ops, output);
        if (!res.ok) return err(res.error);
      }
      continue;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === "paren")
      return err("Mismatched parentheses in expression");
    output.push(top as { type: "op"; value: string });
  }

  return ok(output);
}

function evalRPN(
  rpn: (Token | { type: "op"; value: "u-" })[]
): Result<number, string> {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === "num") {
      stack.push(t.value as number);
      continue;
    }
    const op = t.value as string;
    if (op === "u-") {
      const a = stack.pop();
      if (a === undefined) return err("Invalid expression");
      stack.push(-a);
      continue;
    }
    // binary
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined) return err("Invalid expression");
    switch (op) {
      case "+":
        stack.push(a + b);
        break;
      case "-":
        stack.push(a - b);
        break;
      case "*":
        stack.push(a * b);
        break;
      case "/":
        stack.push(a / b);
        break;
      default:
        return err("Unknown operator");
    }
  }
  if (stack.length !== 1) return err("Invalid expression");
  return ok(stack[0]);
}

function evaluateExpression(expr: string): Result<number, string> {
  const tokensRes = tokenize(expr);
  if (!tokensRes.ok) return err(tokensRes.error);
  const rpnRes = toRPN(tokensRes.value);
  if (!rpnRes.ok) return err(rpnRes.error);
  const evalRes = evalRPN(rpnRes.value);
  return evalRes;
}
