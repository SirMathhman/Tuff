/** Token types for our simple arithmetic language. */
type NumberToken = { type: "number"; value: number };
type OpToken = { type: "op"; value: string };
type Token = NumberToken | OpToken;

function isOp(token: Token): token is OpToken {
  return token.type === "op";
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Number (integer or decimal, with optional leading minus handled by parser)
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input.charAt(i))) {
        num += input.charAt(i++);
      }
      tokens.push({ type: "number", value: parseFloat(num) });
    } else if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  return tokens;
}

/** Helper to get the current token. */
function peek(tokens: Token[], pos: [number]): Token | undefined {
  return tokens[pos[0]];
}

/** Helper to consume and return the current token, advancing position. */
function consume(tokens: Token[], pos: [number]): Token {
  const token = tokens[pos[0]++];
  if (!token) throw new Error("Unexpected end of input");
  return token;
}

/** Recursive descent parser for arithmetic expressions. */
function parseExpression(tokens: Token[], pos: [number]): number {
  let left = parseTerm(tokens, pos);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (
      !currentToken ||
      !isOp(currentToken) ||
      !"+-".includes(currentToken.value)
    )
      break;
    consume(tokens, pos);
    const right = parseTerm(tokens, pos);
    left = currentToken.value === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: Token[], pos: [number]): number {
  let left = parseUnary(tokens, pos);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (
      !currentToken ||
      !isOp(currentToken) ||
      !"*/".includes(currentToken.value)
    )
      break;
    consume(tokens, pos);
    const right = parseUnary(tokens, pos);
    left = currentToken.value === "*" ? left * right : left / right;
  }
  return left;
}

function parseUnary(tokens: Token[], pos: [number]): number {
  while (true) {
    const currentToken = peek(tokens, pos);
    if (!currentToken || !isOp(currentToken)) break;
    consume(tokens, pos);
    const operand = parseUnary(tokens, pos);
    return currentToken.value === "-" ? -operand : operand;
  }
  if (peek(tokens, pos)?.type === "number") {
    return consume(tokens, pos).value as number;
  }
  throw new Error("Unexpected token");
}

function evaluateExpression(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");
  return parseExpression(tokens, [0]);
}

/** Evaluate a block's inner content, handling both expressions and statements (let/const/var). */
function evaluateBlock(inner: string): number {
  const scope = new Map<string, number>();
  // Split by semicolons; last part is the returned value
  const parts: string[] = inner
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error("Empty block");

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    // Handle let/const/var declarations: `let x = expr`
    const declMatch = part.match(/^(?:let|const|var)\s+(\w+)\s*=\s*(.+)$/);
    if (declMatch && declMatch[1] && declMatch[2]) {
      scope.set(declMatch[1], evaluateExpressionWithScope(declMatch[2], scope));
    } else {
      // Statement without declaration, just evaluate for side effects
      evaluateExpressionWithScope(part, scope);
    }
  }

  return evaluateExpressionWithScope(parts[parts.length - 1]!, scope);
}

function evaluateExpressionWithScope(
  input: string,
  scope: Map<string, number>,
): number {
  // Replace variable names with their values from the scope
  let resolved = input;
  for (const [name, value] of scope) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    resolved = resolved.replace(regex, String(value));
  }
  return evaluateExpression(resolved);
}

function evaluate(source: string): number {
  const trimmed = source.trim();

  // Handle block syntax { ... }: only when the entire string is a single pair of braces
  if (
    trimmed.startsWith("{") &&
    trimmed.endsWith("}") &&
    !trimmed.slice(1).includes("{")
  ) {
    return evaluateBlock(trimmed.slice(1, -1));
  }

  // Find any { ... } blocks in the expression and recursively resolve them
  let resolved = trimmed;
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_match, inner) =>
      String(evaluateBlock(inner)),
    );
  } while (resolved !== prev && /\{/.test(resolved));

  // Evaluate the resulting expression
  return evaluateExpression(resolved);
}

export function executeTuff(source: string): number {
  if (source.trim() === "") return 0;

  try {
    const result = evaluate(source);
    if (typeof result !== "number" || isNaN(result))
      throw new Error("Not a number");
    return result;
  } catch {
    throw new Error("Default error, invalid source: " + source);
  }
}
