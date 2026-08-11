export function evaluate(input: string, scope: Map<string, number> = new Map(), mutable: Set<string> = new Set()): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;

  // Handle let declarations with proper scoping
  const isMut = trimmed.startsWith("let mut ");
  if (isMut || trimmed.startsWith("let ")) {
    const prefix = isMut ? "let mut " : "let ";
    const match = trimmed.match(new RegExp(`^${prefix}(\\w+)\\s*=\\s*(.*)$`));
    if (match) {
      const [, name, expr] = match;
      const childScope = new Map(scope);
      const childMutable = new Set(mutable);
      if (isMut) childMutable.add(name!);
      const eqIndex = trimmed.indexOf("=") + 1;
      const semiIndex = findSemicolon(trimmed, eqIndex);
      if (semiIndex !== -1) {
        const exprStr = trimmed.slice(eqIndex, semiIndex).trim();
        const val = evaluate(exprStr, childScope, childMutable);
        childScope.set(name!, val);
        const rest = trimmed.slice(semiIndex + 1).trim();
        return evaluate(rest, childScope, childMutable);
      }
      const val = evaluate(expr?.trim() ?? "", childScope, childMutable);
      childScope.set(name!, val);
      return 0;
    }
    if (trimmed.endsWith(";")) return 0;
  }

  // Handle assignment expressions: x = expr
  const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/);
  if (assignMatch) {
    const [, name, expr] = assignMatch;
    if (!mutable.has(name!)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    const semiIndex = findSemicolon(trimmed, name!.length + 1);
    if (semiIndex !== -1) {
      const exprStr = trimmed.slice(name!.length + 1, semiIndex).trim();
      const val = evaluate(exprStr, scope, mutable);
      scope.set(name!, val);
      const rest = trimmed.slice(semiIndex + 1).trim();
      if (rest === "") return val;
      return evaluate(rest, scope, mutable);
    }
    const val = evaluate(expr!.trim(), scope, mutable);
    scope.set(name!, val);
    return val;
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
      // If block is a pure declaration and is used as a value (no rest after), throw
      if (open === "{" && inner.trim().startsWith("let ") && inner.trim().endsWith(";") && rest === "") {
        throw new Error(`Block has no value-producing expression: ${trimmed}`);
      }
      if (rest === "") return evaluate(inner, scope, mutable);
      const groupResult = evaluate(inner, scope, mutable);
      const remainingTokens = rest.match(tokenRegex);
      if (remainingTokens && remainingTokens.length >= 2) {
        const op = remainingTokens[0]!;
        const nextVal = resolve(remainingTokens[1]!, scope, mutable);
        return applyOp(groupResult, op, nextVal);
      }
      return groupResult;
    }
  }

  // Handle block expressions: { let x = expr; expr }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    // If block is a pure declaration (let ...; with no trailing expression), throw
    if (inner.startsWith("let ") && inner.endsWith(";")) {
      throw new Error(`Block has no value-producing expression: ${trimmed}`);
    }
    return evaluate(inner, scope, mutable);
  }

  const tokens = trimmed.match(tokenRegex);
  if (!tokens || tokens.length === 0) throw new Error(`Invalid expression: ${input}`);

  const first = tokens[0];
  const firstVal = resolve(first, scope, mutable);

  // Pass 1: handle * and /
  const values: number[] = [firstVal];
  const ops: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i];
    const raw = tokens[i + 1];
    if (op === undefined || raw === undefined) break;
    const val = resolve(raw, scope, mutable);
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

function resolve(token: string, scope: Map<string, number>, mutable: Set<string>): number {
  if (token.startsWith("(") || token.startsWith("{")) {
    return evaluate(token, scope, mutable);
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
