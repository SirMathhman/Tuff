/** A successful evaluation result. */
export interface TuffOk {
  ok: true;
  value: number;
}

/** An error for referencing an identifier that is not in scope. */
export interface UnidentifiedIdentifierError {
  kind: "UnidentifiedIdentifier";
  name: string;
  line: number;
}

/** An error for an expression that is neither a number nor an identifier. */
export interface InvalidExpressionError {
  kind: "InvalidExpression";
  expression: string;
  line: number;
}

/** An error for assigning to a binding declared without `mut`. */
export interface ImmutableAssignmentError {
  kind: "ImmutableAssignment";
  name: string;
  line: number;
}

/** The structured errors an evaluation can produce. */
export type TuffError =
  | UnidentifiedIdentifierError
  | InvalidExpressionError
  | ImmutableAssignmentError;

/** A failed evaluation result. */
export interface TuffErr {
  ok: false;
  error: TuffError;
}

/** The result of evaluating a tuff program. */
export type TuffResult = TuffOk | TuffErr;

/** A variable binding in a scope. */
export interface Binding {
  value: number;
  mut: boolean;
}

/** A literal expression node (number or boolean). */
export interface LiteralNode {
  kind: "Literal";
  value: number;
}

/** An identifier expression node. */
export interface IdentifierNode {
  kind: "Identifier";
  name: string;
}

/** A binary `||` expression node. */
export interface OrNode {
  kind: "Or";
  left: TuffExpr;
  right: TuffExpr;
}

/** A parsed tuff expression. */
export type TuffExpr = LiteralNode | IdentifierNode | OrNode;

/**
 * Evaluate the tuffness of a string.
 * @param s - The string to evaluate.
 * @returns The tuffness score, or an error if an identifier is not defined.
 */
export function evaluateTuff(s: string): TuffResult {
  const scopes: Map<string, Binding>[] = [new Map()];
  const result = executeStatements(splitStatements(s), scopes, 1);
  return result ?? { ok: true, value: 0 };
}

/** Executes a list of statements; passed to statement execution for blocks. */
type ExecuteList = (
  statements: string[],
  scopes: Map<string, Binding>[],
  baseLine: number,
) => TuffResult | undefined;

/**
 * Execute a list of statements in order.
 * @param statements - The statements to execute.
 * @param scopes - The scope chain.
 * @param baseLine - The 1-based line of the first statement.
 * @returns A result if a return or error is hit, else undefined.
 */
function executeStatements(
  statements: string[],
  scopes: Map<string, Binding>[],
  baseLine: number,
): TuffResult | undefined {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const result = executeStatement(
      stmt,
      scopes,
      baseLine + i,
      executeStatements,
    );
    if (result) return result;
  }
  return undefined;
}

/**
 * Execute a single statement.
 * @param stmt - The statement text.
 * @param scopes - The scope chain.
 * @param line - The 1-based line number.
 * @param executeList - The list executor, for block statements.
 * @returns A result if the statement terminates, else undefined.
 */
function executeStatement(
  stmt: string,
  scopes: Map<string, Binding>[],
  line: number,
  executeList: ExecuteList,
): TuffResult | undefined {
  const [, blockBody] = stmt.match(/^\{([\s\S]*)\}$/) ?? [];
  if (blockBody !== undefined) {
    scopes.push(new Map());
    try {
      return executeList(splitStatements(blockBody), scopes, line);
    } finally {
      scopes.pop();
    }
  }
  const [, letMut, letName, letValue] =
    stmt.match(/^let\s+(mut\s+)?(\w+)\s*=\s*(.+)$/) ?? [];
  if (letName && letValue) {
    const value = resolveOrError(letValue, scopes, line);
    if (typeof value !== "number") return { ok: false, error: value };
    const scope = scopes[scopes.length - 1];
    if (scope) scope.set(letName, { value, mut: Boolean(letMut) });
    return undefined;
  }
  const [, returnValue] = stmt.match(/^return\s+(.+)$/) ?? [];
  if (returnValue) {
    const value = resolveOrError(returnValue, scopes, line);
    if (typeof value !== "number") return { ok: false, error: value };
    return { ok: true, value };
  }
  const [, assignName, assignValue] = stmt.match(/^(\w+)\s*=\s*(.+)$/) ?? [];
  if (assignName && assignValue) {
    return executeAssignment(assignName, assignValue, scopes, line);
  }
  return undefined;
}

/**
 * Execute an assignment statement.
 * @param name {string} - The variable being assigned.
 * @param valueExpr {string} - The expression to assign.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param line {number} - The 1-based line number.
 * @returns {TuffResult | undefined} A result if the statement terminates, else undefined.
 */
function executeAssignment(
  name: string,
  valueExpr: string,
  scopes: Map<string, Binding>[],
  line: number,
): TuffResult | undefined {
  const binding = findBinding(scopes, name);
  if (!binding) {
    return {
      ok: false,
      error: { kind: "UnidentifiedIdentifier", name, line },
    };
  }
  if (!binding.mut) {
    return {
      ok: false,
      error: { kind: "ImmutableAssignment", name, line },
    };
  }
  const value = resolveOrError(valueExpr, scopes, line);
  if (typeof value !== "number") return { ok: false, error: value };
  binding.value = value;
  return undefined;
}

/**
 * Find a binding by name, searching innermost scope first.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param name {string} - The variable name to look up.
 * @returns {Binding | undefined} The binding, or undefined if not found.
 */
function findBinding(
  scopes: Map<string, Binding>[],
  name: string,
): Binding | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const binding = scopes[i]?.get(name);
    if (binding) return binding;
  }
  return undefined;
}

/**
 * Split source into statements, respecting brace nesting.
 * @param s {string} - The source text.
 * @returns {string[]} The trimmed, non-empty statements.
 */
function splitStatements(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of s) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === ";" && depth === 0) {
      out.push(current);
      current = "";
    } else if (ch === "}" && depth === 0) {
      out.push(current + ch);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.map((st) => st.trim()).filter(Boolean);
}

/** A mutable parse position over an expression string. */
interface Pos {
  i: number;
}

/**
 * Type guard distinguishing a parsed expression node from an error.
 * @param value {TuffExpr | TuffError} - The value to test.
 * @returns {boolean} True if the value is an expression node.
 */
function isExpr(value: TuffExpr | TuffError): value is TuffExpr {
  return (
    value.kind === "Literal" ||
    value.kind === "Identifier" ||
    value.kind === "Or"
  );
}

/**
 * Advance the position past any whitespace.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position.
 * @returns {void} No return value.
 */
function skipSpaces(text: string, pos: Pos): void {
  while (pos.i < text.length && /\s/.test(text[pos.i] ?? "")) pos.i++;
}

/**
 * Parse a single operand: a number, a boolean, or an identifier.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
function parseOperand(
  text: string,
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  skipSpaces(text, pos);
  const rest = text.slice(pos.i);
  const num = rest.match(/^-?\d+(\.\d+)?/);
  if (num) {
    pos.i += num[0].length;
    return { kind: "Literal", value: Number(num[0]) };
  }
  if (/^true\b/.test(rest)) {
    pos.i += 4;
    return { kind: "Literal", value: 1 };
  }
  if (/^false\b/.test(rest)) {
    pos.i += 5;
    return { kind: "Literal", value: 0 };
  }
  const ident = rest.match(/^\w+/);
  if (ident) {
    pos.i += ident[0].length;
    return { kind: "Identifier", name: ident[0] };
  }
  return { kind: "InvalidExpression", expression: text.trim(), line };
}

/**
 * Parse an expression, right-associative over `||`.
 * @param text {string} - The expression text.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseExpr(text: string, pos: Pos, line: number): TuffExpr | TuffError {
  const left = parseOperand(text, pos, line);
  if (!isExpr(left)) return left;
  skipSpaces(text, pos);
  if (text.startsWith("||", pos.i)) {
    pos.i += 2;
    const right = parseExpr(text, pos, line);
    if (!isExpr(right)) return right;
    return { kind: "Or", left, right };
  }
  return left;
}

/**
 * Parse a full expression string into an AST.
 * @param expr {string} - The expression text.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The parsed expression, or a TuffError.
 */
function parseExpression(expr: string, line: number): TuffExpr | TuffError {
  const pos: Pos = { i: 0 };
  skipSpaces(expr, pos);
  const node = parseExpr(expr, pos, line);
  if (!isExpr(node)) return node;
  skipSpaces(expr, pos);
  if (pos.i !== expr.length) {
    return { kind: "InvalidExpression", expression: expr.trim(), line };
  }
  return node;
}

/**
 * Evaluate a parsed expression to a number, or a structured error.
 * @param node {TuffExpr} - The expression node.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param line {number} - The 1-based line number.
 * @returns {number | TuffError} The numeric value, or a TuffError.
 */
function evalExpr(
  node: TuffExpr,
  scopes: Map<string, Binding>[],
  line: number,
): number | TuffError {
  if (node.kind === "Literal") return node.value;
  if (node.kind === "Identifier") {
    const binding = findBinding(scopes, node.name);
    if (binding) return binding.value;
    return { kind: "UnidentifiedIdentifier", name: node.name, line };
  }
  const left = evalExpr(node.left, scopes, line);
  if (typeof left !== "number") return left;
  if (left !== 0) return 1;
  const right = evalExpr(node.right, scopes, line);
  if (typeof right !== "number") return right;
  return right !== 0 ? 1 : 0;
}

/**
 * Resolve an expression to a number, or a structured error.
 * @param expr {string} - The expression text.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param line {number} - The 1-based line number.
 * @returns {number | TuffError} The numeric value, or a TuffError.
 */
function resolveOrError(
  expr: string,
  scopes: Map<string, Binding>[],
  line: number,
): number | TuffError {
  const node = parseExpression(expr, line);
  if (!isExpr(node)) return node;
  return evalExpr(node, scopes, line);
}
