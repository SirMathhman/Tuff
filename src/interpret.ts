import { Result, ok, err } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Conditional expression: if (cond) thenExpr else elseExpr
  if (trimmed.startsWith("if")) {
    const parsed = parseIfElse(trimmed);
    if (parsed) {
      const condRes = interpret(parsed.cond);
      if (!condRes.ok) return err(condRes.error);
      const condTruthy = condRes.value !== 0;
      let branch: string;
      if (condTruthy) {
        branch = parsed.thenExpr;
      } else {
        branch = parsed.elseExpr;
      }
      return interpret(branch);
    }
  }

  // Preprocess parenthesized inline if-expressions (e.g., (if ...))
  let processed = trimmed;
  const replaced = replaceParenthesizedIfs(processed);
  if (!replaced.ok) return err(replaced.error);
  processed = replaced.value;

  // Boolean literal support
  if (processed === "true") return ok(1);
  if (processed === "false") return ok(0);

  // Direct numeric string
  const n = Number(processed);
  if (Number.isFinite(n)) {
    return ok(n);
  }

  // Allow expressions consisting of digits, operators, dots, parentheses, whitespace, logical operators, and booleans
  if (/^[0-9+\-*/().\s|&a-z]+$/i.test(processed)) {
    const r = evaluateExpression(processed);
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
  const tokenRe = /(?:\d+\.\d*|\d*\.\d+|\d+|true|false|\|\||&&)|[()+\-*/]/gi;

  for (const m of expr.matchAll(tokenRe)) {
    const s = m[0];
    const lower = s.toLowerCase();
    if (lower === "true" || lower === "false") {
      let val = 0;
      if (lower === "true") {
        val = 1;
      } else {
        val = 0;
      }
      tokens.push({ type: "num", value: val });
      continue;
    }
    if (
      s === "+" ||
      s === "-" ||
      s === "*" ||
      s === "/" ||
      s === "||" ||
      s === "&&"
    ) {
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
  const normalized = cleaned.replace(/true/gi, "1").replace(/false/gi, "0");
  const reconstructed = tokens.map((t) => tokenToString(t)).join("");
  if (normalized !== reconstructed) {
    return err("Invalid character in expression");
  }
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
    if (op === "||") return 0;
    if (op === "&&") return 1;
    if (op === "+" || op === "-") return 2;
    if (op === "*" || op === "/") return 3;
    if (op === "u-") return 4;
    return 0;
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
    const opRes = applyBinaryOp(op, a, b);
    if (!opRes.ok) return err(opRes.error);
    stack.push(opRes.value);
  }
  if (stack.length !== 1) return err("Invalid expression");
  return ok(stack[0]);
}

function applyBinaryOp(
  op: string,
  a: number,
  b: number
): Result<number, string> {
  if (op === "+") {
    return ok(a + b);
  }
  if (op === "-") {
    return ok(a - b);
  }
  if (op === "*") {
    return ok(a * b);
  }
  if (op === "/") {
    if (b === 0) return err("Division by zero");
    return ok(a / b);
  }
  if (op === "&&") {
    if (a !== 0 && b !== 0) {
      return ok(1);
    }
    return ok(0);
  }
  if (op === "||") {
    if (a !== 0 || b !== 0) {
      return ok(1);
    }
    return ok(0);
  }
  return err("Unknown operator");
}

function evaluateExpression(expr: string): Result<number, string> {
  const tokensRes = tokenize(expr);
  if (!tokensRes.ok) return err(tokensRes.error);
  const rpnRes = toRPN(tokensRes.value);
  if (!rpnRes.ok) return err(rpnRes.error);
  const evalRes = evalRPN(rpnRes.value);
  return evalRes;
}

function findMatchingParen(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findElseAtDepthZero(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && input.startsWith("else", i)) {
      return i;
    }
  }
  return -1;
}

function parseIfElse(
  input: string
): { cond: string; thenExpr: string; elseExpr: string } | undefined {
  // Expecting: if (cond) thenExpr else elseExpr
  if (!input.startsWith("if")) return undefined;
  let i = 2; // after 'if'
  while (i < input.length && /\s/.test(input[i])) i++;
  if (input[i] !== "(") return undefined;
  const j = findMatchingParen(input, i);
  if (j === -1) return undefined;
  const cond = input.slice(i + 1, j).trim();
  let pos = j + 1;
  while (pos < input.length && /\s/.test(input[pos])) pos++;

  const elseIdx = findElseAtDepthZero(input, pos);
  if (elseIdx === -1) return undefined;

  const thenExpr = input.slice(pos, elseIdx).trim();
  const elseExpr = input.slice(elseIdx + 4).trim();
  if (thenExpr.length === 0 || elseExpr.length === 0) return undefined;
  return { cond, thenExpr, elseExpr };
}

function replaceParenthesizedIfs(input: string): Result<string, string> {
  let out = input;
  let idx = out.indexOf("(if");
  while (idx !== -1) {
    const matchIdx = findMatchingParen(out, idx);
    if (matchIdx === -1) return err("Unmatched parentheses in inline if");
    const inner = out.slice(idx + 1, matchIdx).trim(); // starts with 'if'
    const parsed = parseIfElse(inner);
    if (!parsed) return err("Invalid inline if");
    const condRes = interpret(parsed.cond);
    if (!condRes.ok) return err(condRes.error);
    const condTruthy = condRes.value !== 0;
    let branchExpr: string;
    if (condTruthy) {
      branchExpr = parsed.thenExpr;
    } else {
      branchExpr = parsed.elseExpr;
    }
    const branchRes = interpret(branchExpr);
    if (!branchRes.ok) return err(branchRes.error);
    out = out.slice(0, idx) + String(branchRes.value) + out.slice(matchIdx + 1);
    idx = out.indexOf("(if");
  }
  return ok(out);
}
