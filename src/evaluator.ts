import type { TuffError, TuffResult } from "./errors.ts";
import type { BinaryNodeKind } from "./expr.ts";
import type { TuffExpr, TuffStatement } from "./ast.ts";
import {
  findBinding,
  type Binding,
  type Environment,
  type RefEntry,
} from "./scopes.ts";
import {
  bool,
  isValue,
  num,
  toResultValue,
  truthy,
  type TuffValue,
} from "./values.ts";

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
    const value = evalExpr(stmt.value, line, env);
    if (!isValue(value)) return { ok: false, error: value };
    const scope = env.scopes[env.scopes.length - 1];
    if (scope) scope.set(stmt.name, { value, mut: stmt.mut });
    return undefined;
  }
  if (stmt.kind === "Return") {
    const value = evalExpr(stmt.value, line, env);
    if (!isValue(value)) return { ok: false, error: value };
    return { ok: true, value: toResultValue(value) };
  }
  if (stmt.kind === "If") {
    const condition = evalExpr(stmt.condition, line, env);
    if (!isValue(condition)) return { ok: false, error: condition };
    const branch = truthy(condition) ? stmt.then : stmt.else;
    if (!branch) return undefined;
    env.scopes.push(new Map());
    try {
      return executeStatement(branch, line, env, executeList);
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
 * Look up a reference entry from an evaluated operand value.
 * @param operand {TuffValue} - The evaluated operand; must be a reference id.
 * @param line {number} - The 1-based line number.
 * @param env {Environment} - The evaluation environment.
 * @returns {RefEntry | TuffError} The reference entry, or a TuffError.
 */
function lookupRef(
  operand: TuffValue,
  line: number,
  env: Environment,
): RefEntry | TuffError {
  if (operand.kind !== "number") return { kind: "InvalidDeref", line };
  const entry = env.refs.refs.get(operand.value);
  if (!entry) return { kind: "InvalidDeref", line };
  return entry;
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
    if (!isValue(operand)) return operand;
    const entry = lookupRef(operand, line, env);
    if ("kind" in entry) return entry;
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
  const result = evalExpr(value, line, env);
  if (!isValue(result)) return { ok: false, error: result };
  if (result.kind !== lvalue.binding.value.kind) {
    return {
      ok: false,
      error: { kind: "TypeMismatch", name: lvalue.name, line },
    };
  }
  lvalue.binding.value = result;
  return undefined;
}

/** A binary node kind's evaluation rule. */
interface BinaryRule {
  /**
   * Decide the result from the left value alone, or null to evaluate the right.
   * @param left {TuffValue} - The evaluated left value.
   * @returns {TuffValue | null} The short-circuit result, or null.
   */
  shortCircuit: (left: TuffValue) => TuffValue | null;
  /**
   * Combine both evaluated sides.
   * @param left {TuffValue} - The evaluated left value.
   * @param right {TuffValue} - The evaluated right value.
   * @returns {TuffValue} The combined result.
   */
  combine: (left: TuffValue, right: TuffValue) => TuffValue;
}

/**
 * The binary node evaluation rules, keyed by node kind.
 */
const BINARY_RULES: Record<BinaryNodeKind, BinaryRule> = {
  Or: {
    shortCircuit: (left) => (truthy(left) ? bool(true) : null),
    combine: (left, right) => bool(truthy(left) || truthy(right)),
  },
  And: {
    shortCircuit: (left) => (!truthy(left) ? bool(false) : null),
    combine: (left, right) => bool(truthy(left) && truthy(right)),
  },
  Add: {
    shortCircuit: () => null,
    combine: (left, right) => num(toResultValue(left) + toResultValue(right)),
  },
  Equal: {
    shortCircuit: () => null,
    combine: (left, right) =>
      bool(left.kind === right.kind && left.value === right.value),
  },
  Less: {
    shortCircuit: () => null,
    combine: (left, right) => bool(toResultValue(left) < toResultValue(right)),
  },
};

/**
 * Evaluate a parsed expression to a runtime value, or a structured error.
 * @param node {TuffExpr} - The expression node.
 * @param line {number} - The 1-based line number.
 * @param env {Environment} - The evaluation environment.
 * @returns {TuffValue | TuffError} The runtime value, or a TuffError.
 */
function evalExpr(
  node: TuffExpr,
  line: number,
  env: Environment,
): TuffValue | TuffError {
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
    return num(id);
  }
  if (node.kind === "Deref") {
    const operand = evalExpr(node.operand, line, env);
    if (!isValue(operand)) return operand;
    const entry = lookupRef(operand, line, env);
    if ("kind" in entry) return entry;
    return entry.binding.value;
  }
  const rule = BINARY_RULES[node.kind];
  const left = evalExpr(node.left, line, env);
  if (!isValue(left)) return left;
  const shortcut = rule.shortCircuit(left);
  if (shortcut !== null) return shortcut;
  const right = evalExpr(node.right, line, env);
  if (!isValue(right)) return right;
  return rule.combine(left, right);
}
