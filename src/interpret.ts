import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Boolean literal support
  if (trimmed === "true") return ok(1);

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

function tokenToString(t: Token): string {
  if (t.type === "num") return String(t.value);
  return t.value;
}

function tokenize(expr: string): Result<Token[], string> {
  // Regex-based tokenizer using matchAll to simplify control flow
  const tokens: Token[] = [];
  const tokenRe = /(?:\d+\.\d*|\d*\.\d+|\d+)|[()+\-*/]/g;

  for (const m of expr.matchAll(tokenRe)) {
    const s = m[0];
    if (s === "+" || s === "-" || s === "*" || s === "/") {
      tokens.push({ type: "op", value: s });
      continue;
    }
    if (s === "(" || s === ")") {
      tokens.push({ type: "paren", value: s });
      continue;
    }
    // number
    const num = Number(s);
    if (!Number.isFinite(num)) return err("Invalid number in expression");
    tokens.push({ type: "num", value: num });
  }

  // Sanity check: ensure entire input consists of valid tokens
  const cleaned = expr.replace(/\s+/g, "");
  const reconstructed = tokens.map((t) => tokenToString(t)).join("");
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

function popOp(
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[]
): { type: "op"; value: string } | undefined {
  const p = ops.pop();
  if (!p || p.type !== "op") return undefined;
  return p;
}

function peekOpValue(
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[]
): string | undefined {
  const last = ops[ops.length - 1];
  if (!last || last.type !== "op") return undefined;
  return last.value;
}

function popWhileHigherPrecedence(
  currentOpValue: string,
  ops: ({ type: "op"; value: string } | { type: "paren"; value: string })[],
  output: (Token | { type: "op"; value: "u-" })[],
  precedence: (op: string) => number,
  isLeftAssoc: (op: string) => boolean
) {
  while (true) {
    const topOp = peekOpValue(ops);
    if (!topOp) break;
    const p1 = precedence(currentOpValue);
    const p2 = precedence(topOp);
    if (
      (isLeftAssoc(currentOpValue) && p1 <= p2) ||
      (!isLeftAssoc(currentOpValue) && p1 < p2)
    ) {
      const popped = popOp(ops);
      if (!popped) break;
      output.push(popped);
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
    if (top.type === "op") {
      output.push(top);
    } else {
      return err("Mismatched parentheses in expression");
    }
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

  function precedence(op: string): number {
    if (op === "+" || op === "-") return 1;
    if (op === "u-") return 3;
    return 2;
  }
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
    if (top.type === "op") {
      output.push(top);
    } else {
      return err("Mismatched parentheses in expression");
    }
  }
  return ok(output);
}

function evalRPN(
  rpn: (Token | { type: "op"; value: "u-" })[]
): Result<number, string> {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === "num") {
      stack.push(t.value);
      continue;
    }
    // t.type === 'op'
    const op = t.value;
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
        if (b === 0) return err("Division by zero");
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
