import assert from "node:assert";
import type { TuffResult } from "./errors.ts";
import type { BinaryNodeKind } from "./expr.ts";
import type { TuffExpr, TuffStatement, WhileNode } from "./ast.ts";
import {
  findBinding,
  type Binding,
  type Environment,
  type RefEntry,
} from "./scopes.ts";
import { bool, num, toResultValue, truthy, type TuffValue } from "./values.ts";

/** A control-flow signal: a `break` exited the enclosing loop. */
interface BreakSignal {
  kind: "Break";
}

/** A control-flow signal: a `continue` skipped to the next loop iteration. */
interface ContinueSignal {
  kind: "Continue";
}

/** A control-flow signal: a `break` or a `continue`. */
type ControlSignal = BreakSignal | ContinueSignal;

/** A step result: a final value, or a control-flow signal. */
type TuffStep = TuffResult | ControlSignal;

/** Executes a list of statements; passed to statement execution for blocks. */
type ExecuteList = (
  statements: TuffStatement[],
  baseLine: number,
  env: Environment,
) => TuffStep | undefined;

/** The break control-flow signal. */
const BREAK: BreakSignal = { kind: "Break" };

/** The continue control-flow signal. */
const CONTINUE: ContinueSignal = { kind: "Continue" };

/**
 * Whether a step result is the break signal.
 * @param result {TuffStep | undefined} - The result to test.
 * @returns {boolean} True if the result is the break signal.
 */
export function isBreak(result: TuffStep | undefined): result is BreakSignal {
  return result !== undefined && "kind" in result && result.kind === "Break";
}

/**
 * Whether a step result is the continue signal.
 * @param result {TuffStep | undefined} - The result to test.
 * @returns {boolean} True if the result is the continue signal.
 */
export function isContinue(
  result: TuffStep | undefined,
): result is ContinueSignal {
  return result !== undefined && "kind" in result && result.kind === "Continue";
}

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
): TuffStep | undefined {
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
): TuffStep | undefined {
  if (stmt.kind === "Block") {
    env.scopes.push(new Map());
    try {
      return executeList(stmt.statements, line, env);
    } finally {
      env.scopes.pop();
    }
  }
  if (stmt.kind === "Let") {
    const value = evalExpr(stmt.value, env);
    const scope = env.scopes[env.scopes.length - 1];
    if (scope) scope.set(stmt.name, { value, mut: stmt.mut });
    return undefined;
  }
  if (stmt.kind === "Return") {
    const value = evalExpr(stmt.value, env);
    return { ok: true, value: toResultValue(value) };
  }
  if (stmt.kind === "If") {
    const condition = evalExpr(stmt.condition, env);
    const branch = truthy(condition) ? stmt.then : stmt.else;
    if (!branch) return undefined;
    env.scopes.push(new Map());
    try {
      return executeStatement(branch, line, env, executeList);
    } finally {
      env.scopes.pop();
    }
  }
  if (stmt.kind === "While") {
    return executeWhile(stmt, line, env, executeList);
  }
  if (stmt.kind === "Break") {
    return BREAK;
  }
  if (stmt.kind === "Continue") {
    return CONTINUE;
  }
  executeAssignment(stmt.target, stmt.value, env);
  return undefined;
}

/**
 * Execute a `while` loop, re-evaluating the condition each iteration.
 * @param stmt - The While statement to execute.
 * @param line - The 1-based line number.
 * @param env - The evaluation environment.
 * @param executeList - The list executor, for block statements.
 * @returns A result if a return is hit, else undefined.
 */
function executeWhile(
  stmt: WhileNode,
  line: number,
  env: Environment,
  executeList: ExecuteList,
): TuffStep | undefined {
  while (truthy(evalExpr(stmt.condition, env))) {
    env.scopes.push(new Map());
    try {
      const result = executeStatement(stmt.body, line, env, executeList);
      if (isBreak(result)) return undefined;
      if (isContinue(result)) continue;
      if (result) return result;
    } finally {
      env.scopes.pop();
    }
  }
  return undefined;
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
 * @param env {Environment} - The evaluation environment.
 * @returns {RefEntry} The reference entry.
 */
function lookupRef(operand: TuffValue, env: Environment): RefEntry {
  assert(operand.kind === "number", "deref operand must be a reference id");
  const entry = env.refs.refs.get(operand.value);
  assert(entry, "reference id must be registered");
  return entry;
}

/**
 * Resolve an assignment target expression to the binding it writes to.
 * @param target {TuffExpr} - The target: an identifier or a dereference.
 * @param env {Environment} - The evaluation environment.
 * @returns {Lvalue} The resolved target.
 */
function resolveLvalue(target: TuffExpr, env: Environment): Lvalue {
  if (target.kind === "Identifier") {
    const binding = findBinding(env.scopes, target.name);
    assert(binding, `unidentified identifier ${target.name}`);
    return { binding, name: target.name, mut: binding.mut };
  }
  assert(
    target.kind === "Deref",
    "assignment target must be an identifier or dereference",
  );
  const operand = evalExpr(target.operand, env);
  const entry = lookupRef(operand, env);
  return { binding: entry.binding, name: entry.name, mut: entry.mut };
}

/**
 * Execute an assignment statement.
 * @param target {TuffExpr} - The target: an identifier or a dereference.
 * @param value {TuffExpr} - The expression to assign.
 * @param env {Environment} - The evaluation environment.
 */
function executeAssignment(
  target: TuffExpr,
  value: TuffExpr,
  env: Environment,
): void {
  const lvalue = resolveLvalue(target, env);
  assert(lvalue.mut, `immutable assignment to ${lvalue.name}`);
  const result = evalExpr(value, env);
  assert(
    result.kind === lvalue.binding.value.kind,
    `type mismatch assigning to ${lvalue.name}`,
  );
  lvalue.binding.value = result;
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
 * Evaluate a parsed expression to a runtime value.
 * @param node {TuffExpr} - The expression node.
 * @param env {Environment} - The evaluation environment.
 * @returns {TuffValue} The runtime value.
 */
function evalExpr(node: TuffExpr, env: Environment): TuffValue {
  if (node.kind === "Literal") return node.value;
  if (node.kind === "Identifier") {
    const binding = findBinding(env.scopes, node.name);
    assert(binding, `unidentified identifier ${node.name}`);
    return binding.value;
  }
  if (node.kind === "Ref") {
    assert(
      node.operand.kind === "Identifier",
      "reference operand must be an identifier",
    );
    const binding = findBinding(env.scopes, node.operand.name);
    assert(binding, `unidentified identifier ${node.operand.name}`);
    assert(
      !node.mut || binding.mut,
      `immutable reference to ${node.operand.name}`,
    );
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
    const operand = evalExpr(node.operand, env);
    const entry = lookupRef(operand, env);
    return entry.binding.value;
  }
  const rule = BINARY_RULES[node.kind];
  const left = evalExpr(node.left, env);
  const shortcut = rule.shortCircuit(left);
  if (shortcut !== null) return shortcut;
  const right = evalExpr(node.right, env);
  return rule.combine(left, right);
}
