import type { TuffError, TuffResult } from "./errors.ts";
import type { BinaryNodeKind, TuffExpr, TuffStatement } from "./parser.ts";
import { findBinding, type Binding, type Environment } from "./scopes.ts";

/** Executes a list of statements; passed to statement execution for blocks. */
type ExecuteList = (
  statements: TuffStatement[],
  baseLine: number,
  env: Environment,
) => TuffResult | undefined;

/**
 * Execute a list of statements in order.
 * @param statements - The statements to execute.
 * @param baseLine - The 1-based line of the first statement.
 * @param env - The evaluation environment.
 * @returns A result if a return or error is hit, else undefined.
 */
export function executeStatements(
  statements: TuffStatement[],
  baseLine: number,
  env: Environment,
): TuffResult | undefined {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    const result = executeStatement(stmt, baseLine + i, env, executeStatements);
    if (result) return result;
  }
  return undefined;
}

/**
 * Execute a single statement node.
 * @param stmt - The statement to execute.
 * @param line - The 1-based line number.
 * @param env - The evaluation environment.
 * @param executeList - The list executor, for block statements.
 * @returns A result if the statement terminates, else undefined.
 */
function executeStatement(
  stmt: TuffStatement,
  line: number,
  env: Environment,
  executeList: ExecuteList,
): TuffResult | undefined {
  if (stmt.kind === "Block") {
    env.scopes.push(new Map());
    try {
      return executeList(stmt.statements, line, env);
    } finally {
      env.scopes.pop();
    }
  }
  if (stmt.kind === "Let") {
    const value = evalOrError(stmt.value, line, env);
    if (!value.ok) return value;
    const scope = env.scopes[env.scopes.length - 1];
    if (scope) scope.set(stmt.name, { value: value.value, mut: stmt.mut });
    return undefined;
  }
  if (stmt.kind === "Return") {
    const value = evalOrError(stmt.value, line, env);
    if (!value.ok) return value;
    return value;
  }
  if (stmt.kind === "If") {
    const condition = evalOrError(stmt.condition, line, env);
    if (!condition.ok) return condition;
    const branch = condition.value !== 0 ? stmt.then : stmt.else;
    if (!branch) return undefined;
    env.scopes.push(new Map());
    try {
      return executeList(branch.statements, line, env);
    } finally {
      env.scopes.pop();
    }
  }
  return executeAssignment(stmt.target, stmt.value, line, env);
}

/** A resolved assignment target: the binding to write and its mutability. */
interface Lvalue {
  binding: Binding;
  name: string;
  mut: boolean;
}

/**
 * Resolve an assignment target expression to the binding it writes to.
 * @param target {TuffExpr} - The target: an identifier or a dereference.
 * @param line {number} - The 1-based line number.
 * @param env {Environment} - The evaluation environment.
 * @returns {Lvalue | TuffError} The resolved target, or a TuffError.
 */
function resolveLvalue(
  target: TuffExpr,
  line: number,
  env: Environment,
): Lvalue | TuffError {
  if (target.kind === "Identifier") {
    const binding = findBinding(env.scopes, target.name);
    if (!binding) {
      return { kind: "UnidentifiedIdentifier", name: target.name, line };
    }
    return { binding, name: target.name, mut: binding.mut };
  }
  if (target.kind === "Deref") {
    const operand = evalExpr(target.operand, line, env);
    if (typeof operand !== "number") return operand;
    const entry = env.refs.refs.get(operand);
    if (!entry) return { kind: "InvalidDeref", line };
    return { binding: entry.binding, name: entry.name, mut: entry.mut };
  }
  return { kind: "InvalidDeref", line };
}

/**
 * Execute an assignment statement.
 * @param target {TuffExpr} - The target: an identifier or a dereference.
 * @param value {TuffExpr} - The expression to assign.
 * @param line {number} - The 1-based line number.
 * @param env {Environment} - The evaluation environment.
 * @returns {TuffResult | undefined} A result if the statement terminates, else undefined.
 */
function executeAssignment(
  target: TuffExpr,
  value: TuffExpr,
  line: number,
  env: Environment,
): TuffResult | undefined {
  const lvalue = resolveLvalue(target, line, env);
  if ("kind" in lvalue) {
    return { ok: false, error: lvalue };
  }
  if (!lvalue.mut) {
    return {
      ok: false,
      error: { kind: "ImmutableAssignment", name: lvalue.name, line },
    };
  }
  const result = evalOrError(value, line, env);
  if (!result.ok) return result;
  lvalue.binding.value = result.value;
  return undefined;
}

/**
 * Evaluate an expression node to a result, wrapping errors.
 * @param node {TuffExpr} - The expression to evaluate.
 * @param line {number} - The 1-based line number.
 * @param env {Environment} - The evaluation environment.
 * @returns {TuffResult} The numeric value, or a TuffErr.
 */
function evalOrError(
  node: TuffExpr,
  line: number,
  env: Environment,
): TuffResult {
  const value = evalExpr(node, line, env);
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
const BINARY_RULES: Record<BinaryNodeKind, BinaryRule> = {
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
  Less: {
    shortCircuit: () => null,
    combine: (left, right) => (left < right ? 1 : 0),
  },
};

/**
 * Evaluate a parsed expression to a number, or a structured error.
 * @param node {TuffExpr} - The expression node.
 * @param line {number} - The 1-based line number.
 * @param env {Environment} - The evaluation environment.
 * @returns {number | TuffError} The numeric value, or a TuffError.
 */
function evalExpr(
  node: TuffExpr,
  line: number,
  env: Environment,
): number | TuffError {
  if (node.kind === "Literal") return node.value;
  if (node.kind === "Identifier") {
    const binding = findBinding(env.scopes, node.name);
    if (binding) return binding.value;
    return { kind: "UnidentifiedIdentifier", name: node.name, line };
  }
  if (node.kind === "Ref") {
    if (node.operand.kind !== "Identifier")
      return { kind: "InvalidDeref", line };
    const binding = findBinding(env.scopes, node.operand.name);
    if (!binding) {
      return { kind: "UnidentifiedIdentifier", name: node.operand.name, line };
    }
    if (node.mut && !binding.mut) {
      return { kind: "ImmutableAssignment", name: node.operand.name, line };
    }
    const id = env.refs.next;
    env.refs.next++;
    env.refs.refs.set(id, {
      binding,
      name: node.operand.name,
      mut: binding.mut,
    });
    return id;
  }
  if (node.kind === "Deref") {
    const operand = evalExpr(node.operand, line, env);
    if (typeof operand !== "number") return operand;
    const entry = env.refs.refs.get(operand);
    if (!entry) return { kind: "InvalidDeref", line };
    return entry.binding.value;
  }
  const rule = BINARY_RULES[node.kind];
  const left = evalExpr(node.left, line, env);
  if (typeof left !== "number") return left;
  const shortcut = rule.shortCircuit(left);
  if (shortcut !== null) return shortcut;
  const right = evalExpr(node.right, line, env);
  if (typeof right !== "number") return right;
  return rule.combine(left, right);
}
