/** Token types for our simple arithmetic language. */
type NumberToken = { type: "number"; value: number };
type OpToken = { type: "op"; value: string };
type IdToken = { type: "id"; value: string };
type BooleanToken = { type: "boolean"; value: boolean };
type KeywordToken = { type: "keyword"; value: string };
type ScopeValue = unknown | unknown[];
type Token = NumberToken | OpToken | IdToken | BooleanToken | KeywordToken;

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
    } else if (/[a-zA-Z_$]/.test(ch)) {
      // Identifier or boolean literal
      let name = "";
      while (i < input.length && /[a-zA-Z0-9_$]/.test(input.charAt(i))) {
        name += input.charAt(i++);
      }
      if (name === "true") {
        tokens.push({ type: "boolean", value: true });
      } else if (name === "false") {
        tokens.push({ type: "boolean", value: false });
      } else if (name === "if" || name === "else") {
        tokens.push({ type: "keyword", value: name });
      } else {
        tokens.push({ type: "id", value: name });
      }
    } else if (ch === "[") {
      tokens.push({ type: "op", value: "[" });
      i++;
    } else if (ch === ")" || ch === "(") {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "op", value: "]" });
      i++;
    } else if (ch === ",") {
      // comma is ignored at token level; handled by parser context
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

/** Parse a value expression that can be a number or an array. */
function parseValue(input: string, scope: Map<string, ScopeValue>): unknown {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");

  // If the first token is an array literal start, parse as value (to get arrays)
  if (isOp(tokens[0]!) && tokens[0].value === "[") {
    return parseValuePrimary(tokens, [0], scope);
  }

  // Otherwise parse as arithmetic expression and return number
  return parseExpression(tokens, [0], scope as unknown as Map<string, unknown>);
}

/** Resolve an identifier token, handling chained index access like arr[0][1]. */
function resolveIdentifier(
  tokens: Token[],
  pos: [number],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
): unknown {
  const token = peek(tokens, pos);
  if (!token || token.type !== "id") throw new Error("Expected identifier");
  consume(tokens, pos);
  let value = scope.get(token.value);
  if (value === undefined)
    throw new Error(`Undefined variable: ${token.value}`);

  // Handle chained index access: arr[0][1]
  while (true) {
    const nextToken = peek(tokens, pos);
    if (!nextToken || !isOp(nextToken) || nextToken.value !== "[") break;
    consume(tokens, pos); // consume [
    const idx = parseExpression(
      tokens,
      pos,
      scope as unknown as Map<string, unknown>,
    );
    consume(tokens, pos); // consume ]
    if (!Array.isArray(value)) throw new Error("Cannot index non-array");
    value = (value as unknown[])[idx];
  }

  return value;
}

function parseValuePrimary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): unknown {
  const token = peek(tokens, pos);
  if (!token) throw new Error("Unexpected end of input");

  // Number literal
  if (token.type === "number") {
    consume(tokens, pos);
    return token.value;
  }

  // Boolean literal: true -> 1, false -> 0
  if (token.type === "boolean") {
    consume(tokens, pos);
    return token.value ? 1 : 0;
  }

  // Array literal: [ expr , expr ]
  if (isOp(token) && token.value === "[") {
    consume(tokens, pos); // consume [
    const arr: unknown[] = [];
    while (true) {
      const next = peek(tokens, pos);
      if (!next || (isOp(next) && next.value === "]")) break;
      arr.push(parseValuePrimary(tokens, pos, scope));
    }
    consume(tokens, pos); // consume ]
    return arr;
  }

  // Identifier (possibly followed by index access)
  if (token.type === "id") {
    return resolveIdentifier(tokens, pos, scope);
  }

  throw new Error(`Unexpected token: ${token.type}`);
}

/** Recursive descent parser for arithmetic expressions. */
function parseExpression(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  let left = parseTerm(tokens, pos, scope);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (
      !currentToken ||
      !isOp(currentToken) ||
      !"+-".includes(currentToken.value)
    )
      break;
    consume(tokens, pos);
    const right = parseTerm(tokens, pos, scope);
    left = currentToken.value === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  let left = parseUnary(tokens, pos, scope);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (
      !currentToken ||
      !isOp(currentToken) ||
      !"*/".includes(currentToken.value)
    )
      break;
    consume(tokens, pos);
    const right = parseUnary(tokens, pos, scope);
    left = currentToken.value === "*" ? left * right : left / right;
  }
  return left;
}

function parseUnary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  while (true) {
    const currentToken = peek(tokens, pos);
    if (!currentToken || !isOp(currentToken)) break;
    consume(tokens, pos);
    const operand = parseUnary(tokens, pos, scope);
    return typeof operand === "number"
      ? currentToken.value === "-"
        ? -operand
        : operand
      : operand;
  }
  return parsePrimary(tokens, pos, scope);
}

function parseIfExpr(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  // Consume 'if' keyword
  consume(tokens, pos);

  // Parse condition (in parens)
  const parenToken = peek(tokens, pos);
  if (parenToken && isOp(parenToken) && parenToken.value === "(") {
    consume(tokens, pos); // consume (
    const cond = parseExpression(tokens, pos, scope);
    const closeParen = peek(tokens, pos);
    if (closeParen && isOp(closeParen) && closeParen.value === ")") {
      consume(tokens, pos); // consume )
    }

    // Parse then branch
    const thenValue = parseExpression(tokens, pos, scope);

    // Check for 'else' keyword and parse else branch if present
    const nextToken = peek(tokens, pos);
    if (nextToken && nextToken.type === "keyword" && nextToken.value === "else") {
      consume(tokens, pos); // consume 'else'
      const elseValue = parseExpression(tokens, pos, scope);
      return cond !== 0 ? thenValue : elseValue;
    }

    return thenValue;
  }

  throw new Error("Expected condition after if");
}

function parsePrimary(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  // Check for 'if' keyword at primary level
  const token = peek(tokens, pos);
  if (token && token.type === "keyword" && token.value === "if") {
    return parseIfExpr(tokens, pos, scope);
  }

  const value = parseValuePrimary(
    tokens,
    pos,
    scope as unknown as Map<string, ScopeValue>,
  );
  return typeof value === "number" ? value : 0;
}

function evaluateExpression(
  input: string,
  scope?: Map<string, unknown>,
): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new Error("Empty expression");
  return parseExpression(tokens, [0], scope ?? new Map());
}

/** Check if a block contains only statements (assignments/declarations) with no trailing expression. */
function isStatementBlock(inner: string): boolean {
  const parts = splitStatements(inner);
  if (parts.length === 0) return false;
  // If every part is an assignment or declaration, it's a statement-only block
  for (const p of parts) {
    if (!isAssignment(p.trim()) && !/^\s*(?:let|const|var)\s/.test(p))
      return false;
  }
  return true;
}

/** Evaluate a block's inner content with an existing scope. */
function evaluateBlockWithScope(
  inner: string,
  scope: Map<string, ScopeValue>,
): number {
  const parts = splitStatements(inner);
  if (parts.length === 0) throw new Error("Empty block");

  processBlock(scope, parts);
  // If the last part is an assignment or declaration, return resolved value from scope instead of re-evaluating
  const lastPart = parts[parts.length - 1]!;
  if (isAssignment(lastPart) || /^\s*(?:let|const|var)\s/.test(lastPart)) {
    // Extract identifier name and resolve its current value
    const idMatch = lastPart.match(/^(\w+)/);
    if (idMatch) {
      const name = idMatch[1]!;
      if (scope.has(name)) {
        const val = scope.get(name);
        return typeof val === "number" ? val : 0;
      }
    }
  }
  return resolveBlocksWithScope(lastPart, scope);
}

/** Evaluate a block's inner content. */
function evaluateBlock(inner: string): number {
  const scope = new Map<string, ScopeValue>();
  return evaluateBlockWithScope(inner, scope);
}

/** Process a single statement in the given scope. */
function processSingleStatement(
  part: string,
  scope: Map<string, ScopeValue>,
): void {
  // Handle let/const/var declarations: `let x = expr` or `let mut x = expr`
  const declMatch = part.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*=\s*(.+)$/,
  );
  if (declMatch && declMatch[1] && declMatch[2]) {
    const rhs = declMatch[2];
    let value: unknown;
    if (/^\s*\[/.test(rhs)) {
      // Array literal - parse directly to preserve array structure
      value = parseValue(rhs, scope);
    } else {
      // Expression or block - resolve blocks first then evaluate
      value = resolveBlocksWithScope(rhs, scope);
    }
    scope.set(declMatch[1], value);
  } else if (part.startsWith("{") && part.endsWith("}")) {
    // Nested block: use child scope so declarations don't leak outward
    const innerParts = splitStatements(part.slice(1, -1));
    processNestedBlock(innerParts, scope);
  } else if (isAssignment(part)) {
    // Assignment statement: `x = value`
    evaluateAssignment(part, scope);
  } else {
    resolveBlocksWithScope(part, scope);
  }
}

/** Process statements in a block, updating the scope. */
function processBlock(scope: Map<string, ScopeValue>, parts: string[]): void {
  for (let i = 0; i < parts.length - 1; i++) {
    processSingleStatement(parts[i]!, scope);
  }
}

/** Process a nested block with its own child scope.
 * Declarations stay local, assignments to pre-existing vars propagate outward. */
function processNestedBlock(
  innerParts: string[],
  outerScope: Map<string, ScopeValue>,
): void {
  // If the block has no declarations, just process directly on outer scope
  const hasDeclarations = innerParts.some((p) =>
    /^(?:let|const|var)\s+/.test(p.trim()),
  );
  if (!hasDeclarations) {
    for (const ip of innerParts) {
      processSingleStatement(ip, outerScope);
    }
    return;
  }

  // Child scope copies references from parent so lookups find inherited values
  const child = new Map(outerScope);
  for (const ip of innerParts) {
    processSingleStatement(ip, child);
  }
}

/** Resolve blocks in an expression and evaluate with a given scope. */
function resolveBlocksWithScope(
  input: string,
  scope: Map<string, ScopeValue>,
): number {
  let resolved = input;
  // Recursively replace innermost blocks with their values (or empty if statement-only)
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_match, blockInner) => {
      const trimmed = blockInner.trim();
      // If the block is purely statements (assignments/declarations), process for side effects only
      if (isStatementBlock(trimmed)) {
        const innerParts = splitStatements(trimmed);
        processNestedBlock(innerParts, scope);
        return "";
      }
      return String(evaluateBlockWithScope(trimmed, scope));
    });
  } while (resolved !== prev && /\{/.test(resolved));

  // Trim whitespace that may remain after block removal
  resolved = resolved.trim();

  return evaluateExpression(
    resolved,
    new Map(scope as unknown as Map<string, unknown>),
  );
}

/** Check if a string is an assignment like `x = expr` or `arr[0] = expr`. */
function isAssignment(input: string): boolean {
  return /^\w+(?:\s*\[[^\]]+\])*\s*=/.test(input.trim());
}

/** Evaluate an assignment statement like `x = 3` or `arr[0] = 100`. */
function evaluateAssignment(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^(\w+)(.*)\s*=\s*(.+)$/);
  if (match && match[1] && typeof match[2] === "string" && match[3]) {
    const name = match[1];
    // Extract indices from the middle part like [0][1]
    const idxMatch = match[2].match(/\[(\d+)\]/g) ?? [];

    if (idxMatch.length === 0) {
      // Plain assignment: `x = value`
      scope.set(name, parseValue(match[3], scope));
      return;
    }

    // Indexed assignment: ensure target is an array
    const arr = scope.get(name);
    if (!Array.isArray(arr)) throw new Error("Cannot index non-array");

    // Walk to parent and set at final index
    let current: unknown[] = arr;
    for (let i = 0; i < idxMatch.length - 1; i++) {
      const ci = parseInt(idxMatch[i]!.slice(1, -1), 10);
      current = current[ci] as unknown[];
    }
    const finalIdx = parseInt(idxMatch.at(-1)!.slice(1, -1), 10);
    current[finalIdx] = parseValue(match[3], scope);
  }
}

/** Split input by semicolons, respecting brace and bracket nesting. */
function splitStatements(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === ";" && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  const last = current.trim();
  if (last.length > 0) parts.push(last);
  return parts.filter(Boolean);
}

/** Check if a string looks like it starts with a statement keyword. */
function isStatement(input: string): boolean {
  return /^(?:let|const|var)\s/.test(input.trim());
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

  // Handle top-level statements: `let x = ...; expr`
  if (isStatement(trimmed)) {
    const scope = new Map<string, ScopeValue>();
    const parts: string[] = splitStatements(trimmed);
    processBlock(scope, parts);
    return resolveBlocksWithScope(parts[parts.length - 1]!, scope);
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
