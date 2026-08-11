export function evaluate(input: string, scope: Map<string, number> = new Map()): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;

  // Handle let declarations with proper scoping
  if (trimmed.startsWith("let ")) {
    const match = trimmed.match(/^let\s+(\w+)\s*=\s*(.*)$/);
    if (match) {
      const [, name, expr] = match;
      const childScope = new Map(scope);
      // Find the semicolon that separates the assignment from the rest
      // Need to respect braces and parentheses
      const eqIndex = trimmed.indexOf("=") + 1;
      const semiIndex = findSemicolon(trimmed, eqIndex);
      if (semiIndex !== -1) {
        const exprStr = trimmed.slice(eqIndex, semiIndex).trim();
        const val = evaluate(exprStr, childScope);
        childScope.set(name!, val);
        const rest = trimmed.slice(semiIndex + 1).trim();
        return evaluate(rest, childScope);
      }
      // No semicolon: just evaluate the expression
      const val = evaluate(expr?.trim() ?? "", childScope);
      childScope.set(name!, val);
      return 0;
    }
    if (trimmed.endsWith(";")) return 0;
  }

  // Handle variable references
  if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
    if (!scope.has(trimmed)) {
      throw new Error(`Undefined variable: ${trimmed}`);
    }
    return scope.get(trimmed)!;
  }

  // Handle grouped expressions: ( ) or { }
  if (trimmed.startsWith("(") || trimmed.startsWith("{")) {
    const open = trimmed[0] as "(" | "{";
    const close = open === "(" ? ")" : "}";
    const depth = findMatchingBracket(trimmed, open, close);
    if (depth !== undefined) {
      const inner = trimmed.slice(1, depth);
      const rest = trimmed.slice(depth + 1).trim();
      if (rest === "") return evaluate(inner, scope);
      const groupResult = evaluate(inner, scope);
      const remainingTokens = rest.match(tokenRegex);
      if (remainingTokens && remainingTokens.length >= 2) {
        const op = remainingTokens[0]!;
        const nextVal = resolve(remainingTokens[1]!, scope);
        return applyOp(groupResult, op, nextVal);
      }
      return groupResult;
    }
  }

  // Handle block expressions: { let x = expr; expr }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return evaluate(trimmed.slice(1, -1), scope);
  }

  const tokens = trimmed.match(tokenRegex);
  if (!tokens || tokens.length === 0) throw new Error(`Invalid expression: ${input}`);

  const first = tokens[0];
  const firstVal = resolve(first, scope);

  // Pass 1: handle * and /
  const values: number[] = [firstVal];
  const ops: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i];
    const raw = tokens[i + 1];
    if (op === undefined || raw === undefined) break;
    const val = resolve(raw, scope);
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

const tokenRegex = /(\d+|\([^()]*\)|\{[^{}]*\}|[a-zA-Z_]\w*|[+\-*/])/g;

function resolve(token: string, scope: Map<string, number>): number {
  if (token.startsWith("(") || token.startsWith("{")) {
    return evaluate(token, scope);
  }
  if (/^[a-zA-Z_]\w*$/.test(token)) {
    if (!scope.has(token)) {
      throw new Error(`Undefined variable: ${token}`);
    }
    return scope.get(token)!;
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

function applyOp(a: number, op: string, b: number): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  return b;
}

function findSemicolon(input: string, start: number): number {
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === "(" || input[i] === "{") depth++;
    else if (input[i] === ")" || input[i] === "}") depth--;
    else if (input[i] === ";" && depth === 0) return i;
  }
  return -1;
}
