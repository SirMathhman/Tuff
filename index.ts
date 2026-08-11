type TypedValue = { type: "number" | "boolean"; value: number };

function toTypedValue(val: number, type: "number" | "boolean" = "number"): TypedValue {
  return { type, value: val };
}

function toNumber(tv: TypedValue): number {
  return tv.value;
}

export function evaluate(input: string, scope: Map<string, TypedValue> = new Map(), mutable: Set<string> = new Set()): number {
  return toNumber(evaluateTyped(input, scope, mutable));
}

function evaluateTyped(input: string, scope: Map<string, TypedValue>, mutable: Set<string>): TypedValue {
  const trimmed = input.trim();
  if (trimmed === "") return toTypedValue(0);

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
        const val = evaluateTyped(exprStr, childScope, childMutable);
        childScope.set(name!, val);
        const rest = trimmed.slice(semiIndex + 1).trim();
        return evaluateTyped(rest, childScope, childMutable);
      }
      const val = evaluateTyped(expr?.trim() ?? "", childScope, childMutable);
      childScope.set(name!, val);
      return toTypedValue(0);
    }
    if (trimmed.endsWith(";")) return toTypedValue(0);
  }

  // Handle if/else expressions: if (condition) value1 else value2
  if (trimmed.startsWith("if ")) {
    const tokens = tokenizeIfElse(trimmed);
    if (tokens) {
      const { condition, thenExpr, elseExpr } = tokens;
      const condVal = evaluateTyped(condition, scope, mutable);
      return condVal.value
        ? evaluateTyped(thenExpr, scope, mutable)
        : evaluateTyped(elseExpr, scope, mutable);
    }
  }

  // Handle assignment expressions: x = expr (but not == or !=)
  const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)$/);
  if (assignMatch) {
    const [, name, expr] = assignMatch;
    if (!mutable.has(name!)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    const semiIndex = findSemicolon(trimmed, name!.length + 1);
    if (semiIndex !== -1) {
      const exprStr = trimmed.slice(name!.length + 1, semiIndex).trim();
      const val = evaluateTyped(exprStr, scope, mutable);
      assignVariable(name!, val, scope);
      const rest = trimmed.slice(semiIndex + 1).trim();
      if (rest === "") return val;
      return evaluateTyped(rest, scope, mutable);
    }
    const val = evaluateTyped(expr!.trim(), scope, mutable);
    assignVariable(name!, val, scope);
    return val;
  }

  // Handle variable references
  if (/^[a-zA-Z_]\w*$/.test(trimmed)) {
    if (trimmed === "true") return toTypedValue(1, "boolean");
    if (trimmed === "false") return toTypedValue(0, "boolean");
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
      // If block is a pure declaration or assignment (no trailing expression), throw
      if (open === "{" && rest === "") {
        const innerTrimmed = inner.trim();
        const isPureDeclaration = innerTrimmed.startsWith("let ") && innerTrimmed.endsWith(";");
        const isPureAssignment = /^[a-zA-Z_]\w*\s*=/.test(innerTrimmed) && innerTrimmed.endsWith(";");
        if (isPureDeclaration || isPureAssignment) {
          throw new Error(`Block has no value-producing expression: ${trimmed}`);
        }
      }
      if (rest === "") return evaluateTyped(inner, scope, mutable);
      const groupResult = evaluateTyped(inner, scope, mutable);
      const remainingTokens = rest.match(tokenRegex);
      if (remainingTokens && remainingTokens.length >= 2) {
        const op = remainingTokens[0]!;
        const nextVal = resolveTyped(remainingTokens[1]!, scope, mutable);
        return applyTypedOp(groupResult, op, nextVal);
      }
      return groupResult;
    }
  }

  // Handle block expressions: { let x = expr; expr }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return evaluateTyped(trimmed.slice(1, -1), scope, mutable);
  }

  const tokens = trimmed.match(tokenRegex);
  if (!tokens || tokens.length === 0) throw new Error(`Invalid expression: ${input}`);

  const first = tokens[0];
  const firstVal = resolveTyped(first, scope, mutable);

  // Pass 1: handle * and /
  const values: TypedValue[] = [firstVal];
  const ops: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const op = tokens[i];
    const raw = tokens[i + 1];
    if (op === undefined || raw === undefined) break;
    const val = resolveTyped(raw, scope, mutable);
    const last = values[values.length - 1]!;
    if (op === "*") {
      values[values.length - 1] = toTypedValue(last.value * val.value);
    } else if (op === "/") {
      values[values.length - 1] = toTypedValue(last.value / val.value);
    } else if (op === "&&") {
      values[values.length - 1] = toTypedValue(last.value && val.value, "boolean");
    } else if (op === "||") {
      values[values.length - 1] = toTypedValue(last.value || val.value, "boolean");
    } else if (op === "==") {
      values[values.length - 1] = toTypedValue((last.type === val.type && last.value === val.value) ? 1 : 0, "boolean");
    } else if (op === "!=") {
      values[values.length - 1] = toTypedValue((last.type !== val.type || last.value !== val.value) ? 1 : 0, "boolean");
    } else if (op === "<") {
      values[values.length - 1] = toTypedValue(last.value < val.value ? 1 : 0, "boolean");
    } else if (op === ">") {
      values[values.length - 1] = toTypedValue(last.value > val.value ? 1 : 0, "boolean");
    } else if (op === "+" || op === "-") {
      ops.push(op);
      values.push(val);
    } else if (!knownOperators.has(op)) {
      throw new Error(`Unknown operator: ${op}`);
    } else {
      throw new Error(`Unknown operator: ${op}`);
    }
    i += 2;
  }

  // Pass 2: handle + and -
  let result = values[0]!;
  for (let j = 0; j < ops.length; j++) {
    const next = values[j + 1]!;
    if (ops[j] === "+") result = toTypedValue(result.value + next.value);
    else if (ops[j] === "-") result = toTypedValue(result.value - next.value);
    else if (!knownOperators.has(ops[j]!)) throw new Error(`Unknown operator: ${ops[j]}`);
  }

  return result;
}

const knownOperators = new Set(["+", "-", "*", "/", "&&", "||", "==", "!=", "<", ">"]);
const tokenRegex = /(\d+|\([^()]*\)|\{[^{}]*\}|[a-zA-Z_]\w*|[+\-*/<>]|&&|\|\||==|!=|#)/g;

function resolveTyped(token: string, scope: Map<string, TypedValue>, mutable: Set<string>): TypedValue {
  if (token.startsWith("(") || token.startsWith("{")) {
    return evaluateTyped(token, scope, mutable);
  }
  if (token === "true") return toTypedValue(1, "boolean");
  if (token === "false") return toTypedValue(0, "boolean");
  if (/^[a-zA-Z_]\w*$/.test(token)) {
    if (!scope.has(token)) {
      throw new Error(`Undefined variable: ${token}`);
    }
    return scope.get(token)!;
  }
  return toTypedValue(parseFloat(token));
}

function applyTypedOp(a: TypedValue, op: string, b: TypedValue): TypedValue {
  if (op === "+") return toTypedValue(a.value + b.value);
  if (op === "-") return toTypedValue(a.value - b.value);
  if (op === "*") return toTypedValue(a.value * b.value);
  if (op === "/") return toTypedValue(a.value / b.value);
  if (op === "&&") return toTypedValue(a.value && b.value, "boolean");
  if (op === "||") return toTypedValue(a.value || b.value, "boolean");
  if (op === "==") return toTypedValue((a.type === b.type && a.value === b.value) ? 1 : 0, "boolean");
  if (op === "!=") return toTypedValue((a.type !== b.type || a.value !== b.value) ? 1 : 0, "boolean");
  return b;
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

function assignVariable(name: string, val: TypedValue, scope: Map<string, TypedValue>): void {
  const existing = scope.get(name);
  if (existing && existing.type !== val.type) {
    throw new Error(`Type mismatch: cannot assign ${val.type} to ${name} which is ${existing.type}`);
  }
  scope.set(name, val);
}

function findMatchingParen(input: string, start: number): number {
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === "(") depth++;
    else if (input[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findAtDepth(input: string, start: number, predicate: (i: number, ch: string) => boolean): number {
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === "(" || input[i] === "{") depth++;
    else if (input[i] === ")" || input[i] === "}") depth--;
    else if (depth === 0 && predicate(i, input[i]!)) return i;
  }
  return -1;
}

function findElseKeyword(input: string): number {
  return findAtDepth(input, 0, (i, _ch) => input.slice(i, i + 5) === "else ");
}

function tokenizeIfElse(input: string): { condition: string; thenExpr: string; elseExpr: string } | null {
  // Match: if (condition) thenExpr else elseExpr
  const match = input.match(/^if\s*\(([^()]*)\)\s*(.+)$/);
  if (!match) return null;
  const [, condition, rest] = match;
  if (!rest) return null;
  const elseIndex = findElseKeyword(rest);
  if (elseIndex === -1) return null;
  const thenExpr = rest.slice(0, elseIndex).trim();
  const elseExpr = rest.slice(elseIndex + 5).trim();
  return { condition: condition!.trim(), thenExpr, elseExpr };
}

function findSemicolon(input: string, start: number): number {
  return findAtDepth(input, start, (_i, ch) => ch === ";");
}
