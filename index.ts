/** Token types for our simple arithmetic language. */
type NumberToken = {
  type: "number";
  value: number;
  suffix?: string | undefined;
};
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
    // Dot for property access (check BEFORE number, since . matches /[0-9.]/)
    if (ch === "." && !/[0-9]/.test(input.charAt(i + 1) ?? "")) {
      tokens.push({ type: "op", value: "." });
      i++;
      continue;
    }
    // Number (integer or decimal, with optional leading minus handled by parser)
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input.charAt(i))) {
        num += input.charAt(i++);
      }
      // Optional type suffix: U8, I32, F64, etc.
      let typeSuffix = undefined;
      if (i < input.length && /[a-zA-Z_]/.test(input.charAt(i))) {
        const beforeI = i;
        while (i < input.length && /[a-zA-Z0-9_]/.test(input.charAt(i))) {
          i++;
        }
        typeSuffix = input.slice(beforeI, i);
      }
      tokens.push({
        type: "number",
        value: parseFloat(num),
        suffix: typeSuffix,
      });
    } else if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === "=" && input.charAt(i + 1) === ">") {
      tokens.push({ type: "op", value: "=>" });
      i += 2;
    } else if (
      "<>=!:".includes(ch) ||
      (ch === "<" && input.charAt(i + 1) === "=") ||
      (ch === ">" && input.charAt(i + 1) === "=") ||
      (ch === "=" && input.charAt(i + 1) === "=")
    ) {
      // Handle comparison operators: <, >, <=, >=, ==, !=
      let op = ch;
      if (
        (ch === "<" || ch === ">") &&
        i + 1 < input.length &&
        input.charAt(i + 1) === "="
      ) {
        op += "=";
        i++;
      } else if (
        ch === "=" &&
        i + 1 < input.length &&
        input.charAt(i + 1) === "="
      ) {
        op = "==";
        i++;
      } else if (
        ch === "!" &&
        i + 1 < input.length &&
        input.charAt(i + 1) === "="
      ) {
        op = "!=";
        i++;
      }
      tokens.push({ type: "op", value: op });
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
      } else if (
        name === "if" ||
        name === "else" ||
        name === "while" ||
        name === "for" ||
        name === "fn"
      ) {
        tokens.push({ type: "keyword", value: name });
      } else {
        tokens.push({ type: "id", value: name });
      }
    } else if (ch === "[") {
      tokens.push({ type: "op", value: "[" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "op", value: "]" });
      i++;
    } else if (ch === "{" || ch === "}") {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === ")" || ch === "(") {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === ",") {
      // comma is ignored at token level; handled by parser context
      i++;
    } else if (ch === "." && !/[0-9]/.test(input.charAt(i + 1) ?? "")) {
      // Dot for property access (not part of a decimal number)
      tokens.push({ type: "op", value: "." });
      i++;
    } else if (ch === ":") {
      // Colon for object key-value pairs
      tokens.push({ type: "op", value: ":" });
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

/** Parse a value expression that can be a number, array, or object. */
function parseValue(input: string, scope: Map<string, ScopeValue>): unknown {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) throw new Error("Empty expression");

  // If the first token is an array literal start, parse as value (to get arrays)
  if (isOp(tokens[0]!) && tokens[0].value === "[") {
    return parseValuePrimary(tokens, [0], scope);
  }

  // Object literal: { key : expr } - detect by opening brace followed by identifier and colon
  const third = peek(tokens, [2]);
  if (
    isOp(tokens[0]!) &&
    tokens[0].value === "{" &&
    peek(tokens, [1])?.type === "id" &&
    third !== undefined &&
    isOp(third) &&
    third.value === ":"
  ) {
    consume(tokens, [0]); // consume {
    const obj = parseObjectLiteral(tokens, [0], scope);
    return obj;
  }

  // Otherwise parse as arithmetic expression and return number
  return parseExpression(tokens, [0], scope as unknown as Map<string, unknown>);
}

/** Function definition stored in scope. */
type FnDef = { body: string; params: string[] };

/** Get and delete a function definition from scope (functions are single-use). */
function getFunction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
  name: string,
): FnDef | undefined {
  const fn = scope.get("__fn__" + name);
  if (fn !== undefined) {
    scope.delete("__fn__" + name);
    return fn as FnDef;
  }
  return undefined;
}

/** Resolve an identifier token, handling function calls like fn(), chained index access like arr[0][1], and dot property access like obj.prop. */
function resolveIdentifier(
  tokens: Token[],
  pos: [number],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scope: Map<string, any>,
): unknown {
  const token = peek(tokens, pos);
  if (!token || token.type !== "id") throw new Error("Expected identifier");
  consume(tokens, pos);

  // Check if this is a function call: name(
  const nextToken = peek(tokens, pos);
  if (nextToken && isOp(nextToken) && nextToken.value === "(") {
    // It's a function call - check for defined function
    const fnDef = getFunction(scope, token.value);
    if (fnDef !== undefined) {
      consume(tokens, pos); // consume (
      // Parse arguments: evaluate comma-separated expressions
      const args: number[] = [];
      while (true) {
        const peekNext = peek(tokens, pos);
        if (!peekNext || (isOp(peekNext) && peekNext.value === ")")) break;
        const argValue = parseExpression(
          tokens,
          pos,
          scope as unknown as Map<string, unknown>,
        );
        args.push(argValue);
      }
      const closeParen = peek(tokens, pos);
      if (closeParen && isOp(closeParen) && closeParen.value === ")") {
        consume(tokens, pos); // consume )
      }
      // Evaluate the function body in a new scope that inherits from parent
      const fnScope = new Map(scope);
      // Bind arguments to parameter names
      for (let i = 0; i < fnDef.params.length; i++) {
        const paramName = fnDef.params[i];
        if (paramName !== undefined && args[i] !== undefined) {
          fnScope.set(paramName, args[i]);
        }
      }
      return resolveBlocksWithScope(fnDef.body, fnScope);
    }
    throw new Error(`Undefined function: ${token.value}`);
  }

  let value = scope.get(token.value);
  if (value === undefined)
    throw new Error(`Undefined variable: ${token.value}`);

  // Handle chained access: arr[0][1] and obj.prop
  while (true) {
    const nextToken = peek(tokens, pos);
    if (!nextToken || !isOp(nextToken)) break;

    // Array index access: [expr]
    if (nextToken.value === "[") {
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
    // Dot property access: .prop
    else if (nextToken.value === ".") {
      consume(tokens, pos); // consume .
      const propToken = peek(tokens, pos);
      if (!propToken || propToken.type !== "id")
        throw new Error("Expected property name after dot");
      consume(tokens, pos);
      if (typeof value === "object" && value !== null) {
        value = (value as Record<string, unknown>)[propToken.value];
      } else {
        throw new Error(
          `Cannot access property on non-object: ${String(value)}`,
        );
      }
    } else break;
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

const COMPARISON_OPS = new Set(["<", ">", "<=", ">=", "==", "!="]);

/** Check if a token is a comparison operator. */
function isComparisonOp(token: Token): boolean {
  return isOp(token) && COMPARISON_OPS.has(token.value);
}

/** Parse comparison expressions like `a < b`, `x >= 4`. */
function parseComparison(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  let left = parseTerm(tokens, pos, scope);
  while (true) {
    const currentToken = peek(tokens, pos);
    if (!currentToken || !isComparisonOp(currentToken)) break;
    consume(tokens, pos);
    const right = parseTerm(tokens, pos, scope);
    left = evaluateComparison(left, currentToken.value as string, right);
  }
  return left;
}

/** Evaluate a comparison and return 1 for true, 0 for false. */
function evaluateComparison(left: number, op: string, right: number): number {
  switch (op) {
    case "<":
      return left < right ? 1 : 0;
    case ">":
      return left > right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
    case ">=":
      return left >= right ? 1 : 0;
    case "==":
      return left === right ? 1 : 0;
    case "!=":
      return left !== right ? 1 : 0;
    default:
      throw new Error(`Unknown comparison operator: ${op}`);
  }
}

/** Recursive descent parser for arithmetic expressions with comparison support. */
function parseExpression(
  tokens: Token[],
  pos: [number],
  scope: Map<string, unknown>,
): number {
  let left = parseComparison(tokens, pos, scope);
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
    // Only treat `-` and `+` as unary operators, not comparison or other ops like `<`, `[`, etc.
    if (currentToken.value !== "-" && currentToken.value !== "+") break;

    // Check if the operand (one token ahead) is a number with an unsigned type suffix — reject negative unsigned literals
    const nextToken = tokens[pos[0] + 1];
    if (
      nextToken?.type === "number" &&
      nextToken.suffix &&
      /^[uU]/.test(nextToken.suffix)
    ) {
      throw new Error(
        `Cannot apply unary minus to unsigned typed literal: -${nextToken.value}${nextToken.suffix}`,
      );
    }

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
    if (
      nextToken &&
      nextToken.type === "keyword" &&
      nextToken.value === "else"
    ) {
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

/** Check if a brace-enclosed string is an object literal (has key: value pairs). */
function isObjectLiteral(inner: string): boolean {
  // Object literals have the pattern `key : expr` with colons not part of range operators
  const trimmed = inner.trim();
  return /^\s*\w+\s*:/.test(trimmed) || /^\{[^}]*\s*:\s*/.test(inner);
}

/** Parse an object literal like `{ key1 : val1, key2 : val2 }`. */
function parseObjectLiteral(
  tokens: Token[],
  pos: [number],
  scope: Map<string, ScopeValue>,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  while (true) {
    const next = peek(tokens, pos);
    if (!next || (isOp(next) && next.value === "}")) break;

    // Parse key
    if (next.type !== "id") throw new Error("Expected object property name");
    consume(tokens, pos);
    const propName = next.value;

    // Consume colon
    const colonToken = peek(tokens, pos);
    if (!colonToken || !isOp(colonToken) || colonToken.value !== ":") {
      throw new Error("Expected ':' after object property name");
    }
    consume(tokens, pos);

    // Parse value expression
    const val = parseExpression(
      tokens,
      pos,
      scope as unknown as Map<string, unknown>,
    );
    obj[propName] = val;
  }
  return obj;
}

/** Check if a block contains only statements (assignments/declarations) with no trailing expression. */
function isStatementBlock(inner: string): boolean {
  // If it looks like an object literal, don't treat as statement block
  if (isObjectLiteral(inner)) return false;
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

/** WeakMap to track mutable variable names per scope instance. */
const MUTABLE_VARS = new WeakMap<Map<string, ScopeValue>, Set<string>>();
function getMutableSet(scope: Map<string, ScopeValue>): Set<string> {
  let mutSet = MUTABLE_VARS.get(scope);
  if (!mutSet) {
    mutSet = new Set();
    MUTABLE_VARS.set(scope, mutSet);
  }
  return mutSet;
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
    const name = declMatch[1];
    const rhs = declMatch[2];
    // Track mutability: check for 'mut' keyword
    const isMutable = /^\s*(?:let|const|var)\s+mut\s+/.test(part);
    if (isMutable) {
      getMutableSet(scope).add(name);
    }
    let value: unknown;
    if (/^\s*\[/.test(rhs)) {
      // Array literal - parse directly to preserve array structure
      value = parseValue(rhs, scope);
    } else if (isObjectLiteral(rhs) || /^\s*\{[^}]*\s*:\s*/.test(rhs)) {
      // Object literal - strip outer braces and parse as object
      const inner = rhs.trim();
      const stripped =
        inner.startsWith("{") && inner.endsWith("}")
          ? inner.slice(1, -1)
          : inner;
      const tokens = tokenize(stripped);
      value = parseObjectLiteral(tokens, [0], scope);
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

/** Check if a statement starts with an `if` keyword. */
function isIfStatement(input: string): boolean {
  return /^\s*if\s*\(/.test(input.trim());
}

/** Check if a statement starts with an `else` keyword. */
function isElseStatement(input: string): boolean {
  return /^\s*else\b/.test(input.trim());
}

/** Check if a statement starts with a `while` keyword. */
function isWhileStatement(input: string): boolean {
  return /^\s*while\s*\(/.test(input.trim());
}

/** Check if a statement starts with a `for` keyword. */
function isForStatement(input: string): boolean {
  return /^\s*for\s*\(.*in/.test(input.trim());
}

/** Check if a statement is a function definition like `fn name() => expr` or `fn name(a, b) => expr`. */
function isFnDefinition(input: string): boolean {
  return /^\s*fn\s+\w+\s*\(.*?\)\s*=>\s*/.test(input.trim());
}

/** Process a function definition statement and store it in scope with parameter names. */
function processFnDefinition(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^\s*fn\s+(\w+)\s*\(([^)]*)\)\s*=>\s*(.+)$/);
  if (!match || !match[1] || typeof match[2] !== "string" || !match[3]) return;
  const params = match[2].trim()
    ? match[2].split(",").map((p) => p.trim())
    : [];
  // Store function as an object with body and parameters
  scope.set("__fn__" + match[1], { body: match[3].trim(), params });
}

/** Maximum number of iterations for while loops to prevent infinite loops. */
const MAX_WHILE_ITERATIONS = 1024;

/** Process a `while (cond) body` statement, executing the loop up to MAX_WHILE_ITERATIONS times. */
function processWhileStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^\s*while\s*\((.+)\)\s*(.*)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;

  const condExpr = match[1].trim();
  const body = match[2].trim();

  let iterations = 0;
  while (iterations < MAX_WHILE_ITERATIONS) {
    const condValue = resolveBlocksWithScope(condExpr, scope);
    if (condValue === 0) break; // false condition: exit loop
    processSingleStatement(body, scope);
    iterations++;
  }
}

/** Process a `for (var in start..end) body` statement. */
function processForStatement(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^\s*for\s*\((.+?)\)\s*(.*)$/);
  if (!match || !match[1]) return;

  const header = match[1].trim();
  const body = (match[2] ?? "").trim();

  // Parse `var in start..end`
  const rangeMatch = header.match(/^(\w+)\s+in\s+(.+?)\.\.(.+)$/);
  if (!rangeMatch || !rangeMatch[1] || !rangeMatch[2] || !rangeMatch[3]) return;

  const varName = rangeMatch[1].trim();
  const startVal = parseValue(rangeMatch[2].trim(), scope);
  const endVal = parseValue(rangeMatch[3].trim(), scope);

  if (typeof startVal !== "number" || typeof endVal !== "number") return;

  // Ensure the loop variable is tracked as mutable so compound assignments work
  getMutableSet(scope).add(varName);

  for (
    let i = Math.floor(startVal);
    i < Math.floor(endVal) && i - Math.floor(startVal) < MAX_WHILE_ITERATIONS;
    i++
  ) {
    scope.set(varName, i);
    processSingleStatement(body, scope);
  }
}

/** Process statements in a block, updating the scope. */
function processBlock(scope: Map<string, ScopeValue>, parts: string[]): void {
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (isIfStatement(part)) {
      // Check if next part is the matching `else` branch
      const nextPart = parts[i + 1];
      if (nextPart && isElseStatement(nextPart)) {
        processSingleIfElseStatement(part, nextPart.trim(), scope);
        i++; // skip else since we already consumed it
      } else {
        resolveBlocksWithScope(part, scope);
      }
    } else if (isWhileStatement(part)) {
      processWhileStatement(part, scope);
    } else if (isForStatement(part)) {
      processForStatement(part, scope);
    } else if (isFnDefinition(part)) {
      processFnDefinition(part, scope);
    } else {
      processSingleStatement(part, scope);
    }
  }
}

/** Process an if/else statement pair. */
function processSingleIfElseStatement(
  ifPart: string,
  elsePart: string,
  scope: Map<string, ScopeValue>,
): void {
  // Extract condition from `if (cond) body`
  const match = ifPart.match(/^if\s*\((.+)\)\s*(.*)$/);
  if (!match || !match[1] || typeof match[2] !== "string") return;

  const condValue = resolveBlocksWithScope(match[1], scope);
  const body = match[2].trim();

  if (condValue !== 0) {
    // Execute then branch
    processSingleStatement(body, scope);
  } else {
    // Execute else branch: strip leading `else` keyword
    const stripped = elsePart.replace(/^\s*else\s+/, "");
    processSingleStatement(stripped.trim(), scope);
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
  // Also copy mutable variable tracking to the child scope
  MUTABLE_VARS.set(child, getMutableSet(outerScope));
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
  // But skip object literals which have key:value patterns
  let prev: string;
  do {
    prev = resolved;
    resolved = prev.replace(/\{([^{}]+)\}/g, (_match, blockInner) => {
      const trimmed = blockInner.trim();
      // Skip object literals (have `key : value` pattern, with optional spaces around colon)
      if (/^\s*\w+\s*:\s*/.test(trimmed)) return _match;
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

/** Check if a string is an assignment like `x = expr`, `arr[0] = expr`, or `x += 1`. */
function isAssignment(input: string): boolean {
  return /^\w+(?:\s*\[[^\]]+\])*\s*[+-]?\s*=/.test(input.trim());
}

/** Evaluate an assignment statement like `x = 3`, `arr[0] = 100`, or `x += 1`. */
function evaluateAssignment(
  input: string,
  scope: Map<string, ScopeValue>,
): void {
  const match = input.match(/^(\w+)(.*)\s*[+-]?\s*=\s*(.+)$/);
  if (match && match[1] && typeof match[2] === "string" && match[3]) {
    const name = match[1];
    // Detect compound assignment operator, normalizing whitespace within the operator
    const opMatch = input.match(/\s*([+-])\s*=\s*/);
    const isCompoundOp = !!opMatch;
    const compoundOp = isCompoundOp ? opMatch![1] + "=" : "";

    // Extract indices from the middle part like [0][1]
    const idxMatch = match[2].match(/\[(\d+)\]/g) ?? [];

    if (idxMatch.length === 0) {
      // Plain or compound assignment: `x = value` or `x += value`
      // Check mutability before allowing any assignment to a plain variable
      const mutableSet = getMutableSet(scope);
      if (!mutableSet.has(name)) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
      }

      if (!isCompoundOp) {
        scope.set(name, parseValue(match[3], scope));
        return;
      }

      // Compound assignment: read current value and apply operator
      const rhsValue = resolveBlocksWithScope(match[3], scope);
      const currentValue = scope.get(name);
      const numCurrent = typeof currentValue === "number" ? currentValue : 0;
      if (compoundOp === "+=") {
        scope.set(name, numCurrent + rhsValue);
      } else if (compoundOp === "-=") {
        scope.set(name, numCurrent - rhsValue);
      }
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

    if (!isCompoundOp) {
      current[finalIdx] = parseValue(match[3], scope);
      return;
    }

    // Compound indexed assignment: read current value and apply operator
    const rhsValue = resolveBlocksWithScope(match[3], scope);
    const numCurrent =
      typeof current[finalIdx] === "number" ? current[finalIdx] : 0;
    if (compoundOp === "+=") {
      current[finalIdx] = numCurrent + rhsValue;
    } else if (compoundOp === "-=") {
      current[finalIdx] = numCurrent - rhsValue;
    }
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

/** Check if input contains multiple statements (semicolon-separated). */
function hasMultipleStatements(input: string): boolean {
  return splitStatements(input).length > 1;
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

  // Handle top-level statements with multiple parts: `let x = ...; expr` or `fn f() => ...; call()`
  if (isStatement(trimmed) || hasMultipleStatements(trimmed)) {
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
