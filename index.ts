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
  const trimmed = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\w+$/.test(trimmed)) {
    const binding = findBinding(scopes, trimmed);
    if (binding) return binding.value;
    return { kind: "UnidentifiedIdentifier", name: trimmed, line };
  }
  return { kind: "InvalidExpression", expression: trimmed, line };
}
