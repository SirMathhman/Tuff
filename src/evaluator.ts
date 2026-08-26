import type { TuffError, TuffResult } from "./errors.ts";
import type { TuffExpr, TuffStatement } from "./parser.ts";
import { findBinding, type Binding } from "./scopes.ts";

/** A per-evaluation registry mapping reference ids to their bindings. */
export interface RefRegistry {
  next: number;
  refs: Map<number, Binding>;
}

/**
 * Create an empty reference registry.
 * @returns {RefRegistry} A fresh registry with no references.
 */
export function createRefRegistry(): RefRegistry {
  return { next: 1, refs: new Map() };
}

/** Executes a list of statements; passed to statement execution for blocks. */
type ExecuteList = (
  statements: TuffStatement[],
  scopes: Map<string, Binding>[],
  baseLine: number,
  refs: RefRegistry,
) => TuffResult | undefined;

/**
 * Execute a list of statements in order.
 * @param statements - The statements to execute.
 * @param scopes - The scope chain.
 * @param baseLine - The 1-based line of the first statement.
 * @param refs - The reference registry.
 * @returns A result if a return or error is hit, else undefined.
 */
export function executeStatements(
  statements: TuffStatement[],
  scopes: Map<string, Binding>[],
  baseLine: number,
  refs: RefRegistry,
): TuffResult | undefined {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const result = executeStatement(
      stmt,
      scopes,
      baseLine + i,
      refs,
      executeStatements,
    );
    if (result) return result;
  }
  return undefined;
}

/**
 * Execute a single statement node.
 * @param stmt - The statement to execute.
 * @param scopes - The scope chain.
 * @param line - The 1-based line number.
 * @param refs - The reference registry.
 * @param executeList - The list executor, for block statements.
 * @returns A result if the statement terminates, else undefined.
 */
function executeStatement(
  stmt: TuffStatement,
  scopes: Map<string, Binding>[],
  line: number,
  refs: RefRegistry,
  executeList: ExecuteList,
): TuffResult | undefined {
  if (stmt.kind === "Block") {
    scopes.push(new Map());
    try {
      return executeList(stmt.statements, scopes, line, refs);
    } finally {
      scopes.pop();
    }
  }
  if (stmt.kind === "Let") {
    const value = evalOrError(stmt.value, scopes, line, refs);
    if (!value.ok) return value;
    const scope = scopes[scopes.length - 1];
    if (scope) scope.set(stmt.name, { value: value.value, mut: stmt.mut });
    return undefined;
  }
  if (stmt.kind === "Return") {
    const value = evalOrError(stmt.value, scopes, line, refs);
    if (!value.ok) return value;
    return value;
  }
  return executeAssignment(stmt.name, stmt.value, scopes, line, refs);
}

/**
 * Execute an assignment statement.
 * @param name {string} - The variable being assigned.
 * @param value {TuffExpr} - The expression to assign.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param line {number} - The 1-based line number.
 * @param refs {RefRegistry} - The reference registry.
 * @returns {TuffResult | undefined} A result if the statement terminates, else undefined.
 */
function executeAssignment(
  name: string,
  value: TuffExpr,
  scopes: Map<string, Binding>[],
  line: number,
  refs: RefRegistry,
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
  const result = evalOrError(value, scopes, line, refs);
  if (!result.ok) return result;
  binding.value = result.value;
  return undefined;
}

/**
 * Evaluate an expression node to a result, wrapping errors.
 * @param node {TuffExpr} - The expression to evaluate.
 * @param scopes {Map<string, Binding>[]} - The scope chain.
 * @param line {number} - The 1-based line number.
 * @param refs {RefRegistry} - The reference registry.
 * @returns {TuffResult} The numeric value, or a TuffErr.
 */
function evalOrError(
  node: TuffExpr,
  scopes: Map<string, Binding>[],
  line: number,
  refs: RefRegistry,
): TuffResult {
  const value = evalExpr(node, scopes, line, refs);
  if (typeof value !== "number") return { ok: false, error: value };
  return { ok: true, value };
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
 * @param refs {RefRegistry} - The reference registry.
 * @returns {number | TuffError} The numeric value, or a TuffError.
 */
function evalExpr(
  node: TuffExpr,
  scopes: Map<string, Binding>[],
  line: number,
  refs: RefRegistry,
): number | TuffError {
  if (node.kind === "Literal") return node.value;
  if (node.kind === "Identifier") {
    const binding = findBinding(scopes, node.name);
    if (binding) return binding.value;
    return { kind: "UnidentifiedIdentifier", name: node.name, line };
  }
  if (node.kind === "Ref") {
    if (node.operand.kind !== "Identifier") return { kind: "InvalidDeref", line };
    const binding = findBinding(scopes, node.operand.name);
    if (!binding) {
      return { kind: "UnidentifiedIdentifier", name: node.operand.name, line };
    }
    const id = refs.next;
    refs.next++;
    refs.refs.set(id, binding);
    return id;
  }
  if (node.kind === "Deref") {
    const operand = evalExpr(node.operand, scopes, line, refs);
    if (typeof operand !== "number") return operand;
    const binding = refs.refs.get(operand);
    if (!binding) return { kind: "InvalidDeref", line };
    return binding.value;
  }
  const rule = BINARY_RULES[node.kind];
  const left = evalExpr(node.left, scopes, line, refs);
  if (typeof left !== "number") return left;
  const shortcut = rule.shortCircuit(left);
  if (shortcut !== null) return shortcut;
  const right = evalExpr(node.right, scopes, line, refs);
  if (typeof right !== "number") return right;
  return rule.combine(left, right);
}
