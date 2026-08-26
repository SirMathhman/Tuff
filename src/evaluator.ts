import type { TuffError, TuffResult } from "./errors.ts";
import { isExpr, parseExpression, type TuffExpr } from "./parser.ts";

/** A variable binding in a scope. */
export interface Binding {
  value: number;
  mut: boolean;
}

/**
 * Find a binding by name, searching innermost scope first.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param name {string} - The variable name to look up.
 * @returns {Binding | undefined} The binding, or undefined if not found.
 */
export function findBinding(
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
export function splitStatements(s: string): string[] {
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
export function executeStatements(
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

/** A binary node kind's evaluation rule. */
interface BinaryRule {
  /**
   * Decide the result from the left value alone, or null to evaluate the right.
   * @param left {number} - The evaluated left value.
   * @returns {number | null} The short-circuit result, or null.
   */
  shortCircuit: (left: number) => number | null;
  /**
   * Combine both evaluated sides.
   * @param left {number} - The evaluated left value.
   * @param right {number} - The evaluated right value.
   * @returns {number} The combined result.
   */
  combine: (left: number, right: number) => number;
}

/**
 * The binary node evaluation rules, keyed by node kind.
 */
const BINARY_RULES: Record<"Or" | "And" | "Add" | "Equal", BinaryRule> = {
  Or: {
    shortCircuit: (left) => (left !== 0 ? 1 : null),
    combine: (_left, right) => (right !== 0 ? 1 : 0),
  },
  And: {
    shortCircuit: (left) => (left === 0 ? 0 : null),
    combine: (_left, right) => (right !== 0 ? 1 : 0),
  },
  Add: {
    shortCircuit: () => null,
    combine: (left, right) => left + right,
  },
  Equal: {
    shortCircuit: () => null,
    combine: (left, right) => (left === right ? 1 : 0),
  },
};

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
  const rule = BINARY_RULES[node.kind];
  const left = evalExpr(node.left, scopes, line);
  if (typeof left !== "number") return left;
  const shortcut = rule.shortCircuit(left);
  if (shortcut !== null) return shortcut;
  const right = evalExpr(node.right, scopes, line);
  if (typeof right !== "number") return right;
  return rule.combine(left, right);
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
