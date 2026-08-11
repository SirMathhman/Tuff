export function evaluate(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;

  // Handle parenthesized expressions: find matching ) and evaluate inside
  if (trimmed.startsWith("(")) {
    const depth = findMatchingParen(trimmed);
    if (depth !== undefined) {
      const inner = trimmed.slice(1, depth);
      const rest = trimmed.slice(depth + 1).trim();
      if (rest === "") return evaluate(inner);
      // Continue with parenthesized result as first operand
      const parenResult = evaluate(inner);
      const remainingTokens = rest.match(/(\d+|\([^\)]*\)|[+\-*/])/g);
      if (remainingTokens && remainingTokens.length >= 2) {
        const op = remainingTokens[0]!;
        const nextVal = evaluate(remainingTokens[1]!);
        return applyOp(parenResult, op, nextVal);
      }
      return parenResult;
    }
  }

  const tokens = trimmed.match(/(\d+|\([^\)]*\)|[+\-*/])/g);
  if (!tokens) return 0;

  const first = tokens[0];
  const firstVal = first?.startsWith("(") ? evaluate(first) : parseFloat(first);

  // Pass 1: handle * and /
  const values: number[] = [firstVal];
  const ops: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i]!;
    const raw = tokens[i + 1]!;
    const val = raw.startsWith("(") ? evaluate(raw) : parseFloat(raw);
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
