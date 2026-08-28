import assert from "node:assert";
import type { TuffResult } from "./errors.ts";
import type { BinaryNodeKind } from "./expr.ts";
import type {
  CallNode,
  ForNode,
  RefNode,
  TuffExpr,
  TuffStatement,
  WhileNode,
} from "./ast.ts";
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

/** A control-flow signal: a `return` exited the enclosing function. */
interface ReturnSignal {
  kind: "Return";
  /** The raw value being returned, before public rendering. */
  value: TuffValue;
}

/** A control-flow signal: a `break` or a `continue`. */
type ControlSignal = BreakSignal | ContinueSignal;

/** A step result: a final value, a control-flow signal, or a return. */
type TuffStep = TuffResult | ControlSignal | ReturnSignal;

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
 * Whether a step result is a return signal.
 * @param result {TuffStep | undefined} - The result to test.
 * @returns {boolean} True if the result is a return signal.
 */
export function isReturn(result: TuffStep | undefined): result is ReturnSignal {
  return result !== undefined && "kind" in result && result.kind === "Return";
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
  if (stmt.kind === "Type") {
    // Type aliases are compile-time only; a no-op at runtime.
    return undefined;
  }
  if (stmt.kind === "Struct") {
    // Struct declarations are compile-time only; a no-op at runtime.
    return undefined;
  }
  if (stmt.kind === "Return") {
    return { kind: "Return", value: evalExpr(stmt.value, env) };
  }
  if (stmt.kind === "Fn") {
    env.fns.set(stmt.name, {
      params: stmt.params.map((param) => param.name),
      body: stmt.body.statements,
    });
    return undefined;
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
  if (stmt.kind === "For") {
    return executeFor(stmt, line, env, executeList);
  }
  if (stmt.kind === "Break") {
    return BREAK;
  }
  if (stmt.kind === "Continue") {
    return CONTINUE;
  }
  assert(
    stmt.kind !== "Expr",
    "Expr statements must be transformed to Return by the typechecker",
  );
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
    const result = runLoopIteration(
      stmt.body,
      line,
      env,
      executeList,
      () => {},
    );
    if (isBreak(result)) return undefined;
    if (isContinue(result)) continue;
    if (result) return result;
  }
  return undefined;
}

/**
 * Run one loop iteration in a fresh scope: run the setup (e.g. bind the loop
 * variable), execute the body, and pop the scope on exit.
 * @param body - The loop body statement.
 * @param line - The 1-based line number.
 * @param env - The evaluation environment.
 * @param executeList - The list executor, for block statements.
 * @param setup - Runs in the fresh scope before the body (e.g. bind a loop variable).
 * @returns The body's step result, or undefined if the body did not terminate.
 */
function runLoopIteration(
  body: TuffStatement,
  line: number,
  env: Environment,
  executeList: ExecuteList,
  setup: () => void,
): TuffStep | undefined {
  env.scopes.push(new Map());
  try {
    setup();
    return executeStatement(body, line, env, executeList);
  } finally {
    env.scopes.pop();
  }
}

/**
 * Execute a `for` loop, binding the loop variable to each value of the
 * half-open range in a fresh scope per iteration.
 * @param stmt - The For statement to execute.
 * @param line - The 1-based line number.
 * @param env - The evaluation environment.
 * @param executeList - The list executor, for block statements.
 * @returns A result if a return is hit, else undefined.
 */
function executeFor(
  stmt: ForNode,
  line: number,
  env: Environment,
  executeList: ExecuteList,
): TuffStep | undefined {
  const rangeValue = evalExpr(stmt.range, env);
  assert(rangeValue.kind === "range", "for range must be a range");
  const startValue = rangeValue.elements[0];
  const endValue = rangeValue.elements[1];
  assert(startValue?.kind === "number", "for start must be a number");
  assert(endValue?.kind === "number", "for end must be a number");
  for (let i = startValue.value; i < endValue.value; i++) {
    const result = runLoopIteration(stmt.body, line, env, executeList, () => {
      const scope = env.scopes[env.scopes.length - 1];
      if (scope) scope.set(stmt.name, { value: num(i), mut: true });
    });
    if (isBreak(result)) return undefined;
    if (isContinue(result)) continue;
    if (result) return result;
  }
  return undefined;
}

/** A resolved assignment target: the binding to write and its mutability. */
interface Lvalue {
  binding: Binding;
  name: string;
  mut: boolean;
  /** The element index, when the target is an array index. */
  index?: number;
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
  if (target.kind === "Deref") {
    const operand = evalExpr(target.operand, env);
    const entry = lookupRef(operand, env);
    return { binding: entry.binding, name: entry.name, mut: entry.mut };
  }
  assert(target.kind === "ArrayIndex", "assignment target must be an lvalue");
  assert(
    target.operand.kind === "Identifier",
    "array index operand must be an identifier",
  );
  const operand = evalExpr(target.operand, env);
  assert(operand.kind === "array", "array index operand must be an array");
  const indexValue = evalExpr(target.index, env);
  assert(indexValue.kind === "number", "array index must be a number");
  const element = operand.elements[indexValue.value];
  assert(element, "array index out of bounds");
  const binding = findBinding(env.scopes, target.operand.name);
  assert(binding, `unidentified identifier ${target.operand.name}`);
  return {
    binding,
    name: target.operand.name,
    mut: binding.mut,
    index: indexValue.value,
  };
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
  if (lvalue.index !== undefined) {
    const container = lvalue.binding.value;
    assert(container.kind === "array", "array index target must be an array");
    const element = container.elements[lvalue.index];
    assert(element, "array index out of bounds");
    assert(
      result.kind === element.kind,
      `type mismatch assigning to ${lvalue.name}`,
    );
    container.elements[lvalue.index] = result;
    return;
  }
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
    combine: (left, right) => {
      if (
        left.kind === "tuple" ||
        right.kind === "tuple" ||
        left.kind === "array" ||
        right.kind === "array" ||
        left.kind === "range" ||
        right.kind === "range" ||
        left.kind === "struct" ||
        right.kind === "struct"
      ) {
        return bool(false);
      }
      if (left.kind !== right.kind) return bool(false);
      return bool(left.value === right.value);
    },
  },
  Less: {
    shortCircuit: () => null,
    combine: (left, right) => bool(toResultValue(left) < toResultValue(right)),
  },
  Range: {
    shortCircuit: () => null,
    combine: (left, right) => ({ kind: "range", elements: [left, right] }),
  },
};

/**
 * Evaluate a `&`/`&mut` reference expression to a fresh reference id.
 * @param node {RefNode} - The reference expression node.
 * @param env {Environment} - The evaluation environment.
 * @returns {TuffValue} The numeric reference id.
 */
function evalRef(node: RefNode, env: Environment): TuffValue {
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

/**
 * Execute a function call: evaluate the arguments, bind them to the
 * parameters in a fresh scope, run the body, and return its value.
 * @param node {CallNode} - The call expression node.
 * @param env {Environment} - The evaluation environment.
 * @returns {TuffValue} The value the function returned.
 */
function executeCall(node: CallNode, env: Environment): TuffValue {
  const entry = env.fns.get(node.name);
  assert(entry, `unidentified function ${node.name}`);
  const args = node.args.map((arg) => evalExpr(arg, env));
  env.scopes.push(new Map());
  try {
    const scope = env.scopes[env.scopes.length - 1];
    if (scope) {
      for (let i = 0; i < entry.params.length; i++) {
        const param = entry.params[i];
        const arg = args[i];
        if (param && arg) scope.set(param, { value: arg, mut: false });
      }
    }
    const result = executeStatements(entry.body, 1, env);
    if (!isReturn(result)) {
      assert(false, "function body must return a value");
    }
    return result.value;
  } finally {
    env.scopes.pop();
  }
}

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
  if (node.kind === "Ref") return evalRef(node, env);
  if (node.kind === "Deref") {
    const operand = evalExpr(node.operand, env);
    const entry = lookupRef(operand, env);
    return entry.binding.value;
  }
  if (node.kind === "Tuple") {
    return {
      kind: "tuple",
      elements: node.elements.map((element) => evalExpr(element, env)),
    };
  }
  if (node.kind === "TupleIndex") {
    const operand = evalExpr(node.operand, env);
    assert(operand.kind === "tuple", "tuple index operand must be a tuple");
    const element = operand.elements[node.index];
    assert(element, "tuple index out of bounds");
    return element;
  }
  if (node.kind === "Array") {
    return {
      kind: "array",
      elements: node.elements.map((element) => evalExpr(element, env)),
    };
  }
  if (node.kind === "ArrayIndex") {
    const operand = evalExpr(node.operand, env);
    assert(operand.kind === "array", "array index operand must be an array");
    const indexValue = evalExpr(node.index, env);
    assert(indexValue.kind === "number", "array index must be a number");
    const element = operand.elements[indexValue.value];
    assert(element, "array index out of bounds");
    return element;
  }
  if (node.kind === "StructLiteral") {
    const fields: Record<string, TuffValue> = {};
    for (const field of node.fields) {
      fields[field.name] = evalExpr(field.value, env);
    }
    return { kind: "struct", fields };
  }
  if (node.kind === "FieldAccess") {
    const operand = evalExpr(node.operand, env);
    assert(operand.kind === "struct", "field access operand must be a struct");
    const field = operand.fields[node.field];
    assert(field !== undefined, "field access out of bounds");
    return field;
  }
  if (node.kind === "Call") return executeCall(node, env);
  assert(node.kind !== "Is", "is type-test must be folded before execution");
  const rule = BINARY_RULES[node.kind];
  const left = evalExpr(node.left, env);
  const shortcut = rule.shortCircuit(left);
  if (shortcut !== null) return shortcut;
  const right = evalExpr(node.right, env);
  return rule.combine(left, right);
}
