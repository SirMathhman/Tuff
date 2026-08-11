export function evaluate(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;

  // Handle grouped expressions: ( ) or { }
  if (trimmed.startsWith("(") || trimmed.startsWith("{")) {
    const open = trimmed[0] as "(" | "{";
    const close = open === "(" ? ")" : "}";
    const depth = findMatchingBracket(trimmed, open, close);
    if (depth !== undefined) {
      const inner = trimmed.slice(1, depth);
      const rest = trimmed.slice(depth + 1).trim();
      if (rest === "") return evaluate(inner);
      const groupResult = evaluate(inner);
      const remainingTokens = rest.match(tokenRegex);
      if (remainingTokens && remainingTokens.length >= 2) {
        const op = remainingTokens[0]!;
        const nextVal = resolve(remainingTokens[1]!);
        return applyOp(groupResult, op, nextVal);
      }
      return groupResult;
    }
  }

  const tokens = trimmed.match(tokenRegex);
  if (!tokens) return 0;

  const first = tokens[0];
  const firstVal = resolve(first);

  // Pass 1: handle * and /
  const values: number[] = [firstVal];
  const ops: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i]!;
    const raw = tokens[i + 1]!;
    const val = resolve(raw);
    const last = values[values.length - 1] ?? 0;
    if (op === "*") {
      values[values.length - 1] = last * val;
    } else if (op === "/") {
      values[values.length - 1] = last / val;
    } else {
      ops.push(op);
      values.push(val);
    }
    i += 2;
  }

  // Pass 2: handle + and -
  let result = values[0] ?? 0;
  for (let j = 0; j < ops.length; j++) {
    const next = values[j + 1] ?? 0;
    if (ops[j] === "+") result += next;
    else if (ops[j] === "-") result -= next;
  }

  return result;
}

// Regex that matches numbers, parenthesized/braced groups, and operators
const tokenRegex = /(\d+|\([^()]*\)|\{[^{}]*\}|[+\-*/])/g;

function resolve(token: string): number {
  if (token.startsWith("(") || token.startsWith("{")) {
    return evaluate(token);
  }
  return parseFloat(token);
}

function findMatchingBracket(input: string, open: string, close: string): number | undefined {
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === open) depth++;
    else if (input[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

function findMatchingParen(input: string): number | undefined {
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "(") depth++;
    else if (input[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return undefined;
}

function applyOp(a: number, op: string, b: number): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  return b;
}
