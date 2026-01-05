export function interpret(input: string): number {
  const trimmed = input.trim();

  // Direct numeric string
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return n;
  }

  // Allow simple arithmetic expressions consisting of digits, operators, dots, parentheses and whitespace
  if (/^[0-9+\-*/().\s]+$/.test(trimmed)) {
    try {
      const result = evaluateExpression(trimmed);
      if (Number.isFinite(result)) {
        return result;
      }
    } catch (e) {
      // fall through to throw below
    }
  }

  throw new Error("interpret: input is not a number or valid expression");
}

// --- Expression evaluator (supports +, -, *, /, parentheses, decimals, unary minus)

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: string }
  | { type: "paren"; value: string };

function tokenize(expr: string): Token[] {
  // Regex-based tokenizer: reduces branching and complexity
  const tokens: Token[] = [];
  const tokenRe = /\s+|(?:\d+\.\d*|\d*\.\d+|\d+)|[()+\-*/]/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(expr)) !== null) {
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
    if (!Number.isFinite(num)) throw new Error("Invalid number in expression");
    tokens.push({ type: "num", value: num });
  }
  // Sanity check: ensure entire input consists of valid tokens
  const cleaned = expr.replace(/\s+/g, "");
  let reconstructed = "";
  for (const tk of tokens)
    reconstructed +=
      tk.type === "num" ? String((tk as any).value) : (tk as any).value;
  if (cleaned !== reconstructed)
    throw new Error("Invalid character in expression");
  return tokens;
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

function popWhileHigherPrecedence(currentOpValue: string, ops: ({ type: 'op'; value: string } | { type: 'paren'; value: string })[], output: (Token | { type: 'op'; value: 'u-' })[], precedence: (op: string) => number, isLeftAssoc: (op: string) => boolean) {
  while (ops.length > 0 && ops[ops.length - 1].type === 'op') {
    const topOp = (ops[ops.length - 1] as { type: 'op'; value: string }).value;
    const p1 = precedence(currentOpValue);
    const p2 = precedence(topOp);
    if ((isLeftAssoc(currentOpValue) && p1 <= p2) || (!isLeftAssoc(currentOpValue) && p1 < p2)) {
      output.push(ops.pop() as { type: 'op'; value: any });
    } else break;
  }
}

function popUntilLeftParen(ops: ({ type: 'op'; value: string } | { type: 'paren'; value: string })[], output: (Token | { type: 'op'; value: 'u-' })[]) {
  let found = false;
  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === 'paren' && top.value === '(') {
      found = true;
      break;
    }
    output.push(top as { type: 'op'; value: string });
  }
  if (!found) throw new Error('Mismatched parentheses in expression');
}

function toRPN(tokens: Token[]): (Token | { type: 'op'; value: 'u-' })[] {
  const tks = markUnaryMinus(tokens);
  const output: (Token | { type: 'op'; value: 'u-' })[] = [];
  const ops: ({ type: 'op'; value: string } | { type: 'paren'; value: string })[] = [];

  const precedence = (op: string) => (op === '+' || op === '-') ? 1 : (op === 'u-' ? 3 : 2);
  const isLeftAssoc = (op: string) => op !== 'u-';

  for (const t of tks) {
    if (t.type === 'num') {
      output.push(t);
      continue;
    }
    if (t.type === 'op') {
      popWhileHigherPrecedence(t.value, ops, output, precedence, isLeftAssoc);
      ops.push(t);
      continue;
    }
    if (t.type === 'paren') {
      if (t.value === '(') {
        ops.push(t);
      } else {
        popUntilLeftParen(ops, output);
      }
      continue;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === 'paren') throw new Error('Mismatched parentheses in expression');
    output.push(top as { type: 'op'; value: string });
  }

  return output;
}

function evalRPN(rpn: (Token | { type: "op"; value: "u-" })[]): number {
  const stack: number[] = [];
  for (const t of rpn) {
    if (t.type === "num") {
      stack.push(t.value as number);
      continue;
    }
    const op = t.value as string;
    if (op === "u-") {
      const a = stack.pop();
      if (a === undefined) throw new Error("Invalid expression");
      stack.push(-a);
      continue;
    }
    // binary
    const b = stack.pop();
    const a = stack.pop();
    if (a === undefined || b === undefined)
      throw new Error("Invalid expression");
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
        throw new Error("Unknown operator");
    }
  }
  if (stack.length !== 1) throw new Error("Invalid expression");
  return stack[0];
}

function evaluateExpression(expr: string): number {
  const tokens = tokenize(expr);
  const rpn = toRPN(tokens);
  return evalRPN(rpn);
}
