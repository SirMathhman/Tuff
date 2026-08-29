import type {
  Assign,
  AstNode,
  Binding,
  BinOpNode,
  BlockNode,
  DerefAssign,
  DerefNode,
  EvalErrorKind,
  IfNode,
  RefNode,
  Statement,
} from "./ast.ts";

/**
 * A reference to a variable by name.
 */
export interface Ref {
  /** The referenced variable name. */
  name: string;
  /** Whether the reference allows mutation. */
  mutable: boolean;
  /** The captured value (immutable refs only). */
  value?: number;
}

/**
 * A value produced by evaluation: a number, a boolean, or a reference.
 */
export type Value = number | boolean | Ref;

/**
 * A single lexical scope holding bindings.
 */
export interface Scope {
  /** The values bound in this scope. */
  values: Record<string, Value>;
  /** Whether each bound name is mutable. */
  mutable: Record<string, boolean>;
  /** The enclosing scope, or null at the root. */
  parent: Scope | null;
}

/**
 * A variable environment: a chain of lexical scopes, innermost first.
 */
export interface Env {
  /** The innermost scope. */
  scope: Scope;
}

/**
 * A successful evaluation outcome.
 */
export interface EvalSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The evaluated value. */
  value: Value;
}

/**
 * A failed evaluation outcome.
 */
export interface EvalFailure {
  /** Marks the outcome as failed. */
  ok: false;
  /** What kind of failure this is. */
  kind: EvalErrorKind;
  /** The name of the variable involved. */
  name: string;
}

/**
 * The outcome of evaluating an AST node.
 */
export type EvalOutcome = EvalSuccess | EvalFailure;

/**
 * Evaluate an AST node to a number in an environment.
 * @param {AstNode} node - The AST node to evaluate.
 * @param {Env} env - The variable environment.
 * @returns {EvalOutcome} The evaluated value, or a structured error.
 */
export function evalAst(node: AstNode, env: Env): EvalOutcome {
  if (node.kind === "num") {
    return { ok: true, value: node.value };
  }
  if (node.kind === "bool") {
    return { ok: true, value: node.value };
  }
  if (node.kind === "ident") {
    const value = lookup(env.scope, node.name);
    if (value === undefined) {
      return { ok: false, kind: "unknown-variable", name: node.name };
    }
    return { ok: true, value };
  }
  if (node.kind === "block") {
    return evalBlock(node, env);
  }
  if (node.kind === "ref" || node.kind === "deref") {
    return evalRefOrDeref(node, env);
  }
  if (node.kind === "if") {
    return evalIf(node, env);
  }
  return evalBinOp(node, env);
}

/**
 * Evaluate a binary operation node in an environment.
 * @param {BinOpNode} node - The binary operation node to evaluate.
 * @param {Env} env - The variable environment.
 * @returns {EvalOutcome} The evaluated value, or a structured error.
 */
function evalBinOp(node: BinOpNode, env: Env): EvalOutcome {
  const left = evalAst(node.left, env);
  if (!left.ok) {
    return left;
  }
  const right = evalAst(node.right, env);
  if (!right.ok) {
    return right;
  }
  if (node.op === "==") {
    return evalEq(left.value, right.value);
  }
  if (node.op === "||" || node.op === "&&") {
    const l = truthy(left.value);
    const r = truthy(right.value);
    const result = node.op === "||" ? l || r : l && r;
    return { ok: true, value: result ? 1 : 0 };
  }
  const leftNum = toNumber(left.value);
  const rightNum = toNumber(right.value);
  if (leftNum === null || rightNum === null) {
    return { ok: false, kind: "type-mismatch", name: "" };
  }
  switch (node.op) {
    case "+":
      return { ok: true, value: leftNum + rightNum };
    case "-":
      return { ok: true, value: leftNum - rightNum };
    case "*":
      return { ok: true, value: leftNum * rightNum };
    case "<":
      return { ok: true, value: leftNum < rightNum ? 1 : 0 };
    default: {
      const exhaustive: never = node.op;
      return exhaustive;
    }
  }
}

/**
 * Evaluate an equality comparison between two values.
 * @param {Value} left - The left operand.
 * @param {Value} right - The right operand.
 * @returns {EvalOutcome} 1 when the values are equal, 0 when not, or a type-mismatch error when the operands are of different types.
 */
function evalEq(left: Value, right: Value): EvalOutcome {
  const leftIsNum = typeof left === "number";
  const rightIsNum = typeof right === "number";
  if (leftIsNum !== rightIsNum) {
    return { ok: false, kind: "type-mismatch", name: "" };
  }
  const equal = leftIsNum
    ? (left as number) === (right as number)
    : (left as boolean) === (right as boolean);
  return { ok: true, value: equal ? 1 : 0 };
}

/**
 * A snapshot of a single scope's bindings.
 */
interface ScopeSnapshot {
  /** The values bound in the scope. */
  values: Record<string, Value>;
  /** Whether each bound name is mutable. */
  mutable: Record<string, boolean>;
}

/**
 * Snapshot every scope in the chain, innermost first.
 * @param {Scope} scope - The innermost scope.
 * @returns {ScopeSnapshot[]} A snapshot per scope, innermost first.
 */
function snapshotChain(scope: Scope): ScopeSnapshot[] {
  const snaps: ScopeSnapshot[] = [];
  for (let cur: Scope | null = scope; cur !== null; cur = cur.parent) {
    snaps.push({ values: { ...cur.values }, mutable: { ...cur.mutable } });
  }
  return snaps;
}

/**
 * Restore a scope chain from snapshots taken by snapshotChain.
 * @param {Scope} scope - The innermost scope.
 * @param {ScopeSnapshot[]} snaps - The snapshots, innermost first.
 * @returns {void} Nothing.
 */
function restoreChain(scope: Scope, snaps: ScopeSnapshot[]): void {
  let cur: Scope | null = scope;
  for (const snap of snaps) {
    cur!.values = snap.values;
    cur!.mutable = snap.mutable;
    cur = cur!.parent;
  }
}

/**
 * Evaluate a conditional (if) expression. Both branches are evaluated so an
 * error in either surfaces, but only the taken branch's side effects persist:
 * the untaken branch runs against a snapshot that is restored afterwards.
 * @param {IfNode} node - The if node to evaluate.
 * @param {Env} env - The variable environment.
 * @returns {EvalOutcome} The value of the taken branch, or a structured error.
 */
function evalIf(node: IfNode, env: Env): EvalOutcome {
  const cond = evalAst(node.condition, env);
  if (!cond.ok) {
    return cond;
  }
  const taken = truthy(cond.value) ? node.then : node.else;
  const untaken = truthy(cond.value) ? node.else : node.then;
  const snaps = snapshotChain(env.scope);
  const untakenOut = evalAst(untaken, env);
  restoreChain(env.scope, snaps);
  if (!untakenOut.ok) {
    return untakenOut;
  }
  return evalAst(taken, env);
}

/**
 * Coerce a value to a number, or null when it is not a number.
 * @param {Value} value - The value to coerce.
 * @returns {number | null} The numeric value, or null for non-numbers.
 */
function toNumber(value: Value): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Whether a value is truthy (nonzero number or true).
 * @param {Value} value - The value to test.
 * @returns {boolean} True when the value is truthy.
 */
function truthy(value: Value): boolean {
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return false;
}

/**
 * Evaluate a reference or dereference node.
 * @param {RefNode | DerefNode} node - The node to evaluate.
 * @param {Env} env - The variable environment.
 * @returns {EvalOutcome} The evaluated value, or a structured error.
 */
function evalRefOrDeref(node: RefNode | DerefNode, env: Env): EvalOutcome {
  if (node.kind === "ref") {
    const target = node.target;
    if (target.kind !== "ident") {
      return { ok: false, kind: "deref-non-ref", name: "" };
    }
    if (node.mutable) {
      return { ok: true, value: { name: target.name, mutable: true } };
    }
    const val = lookup(env.scope, target.name);
    if (val === undefined) {
      return { ok: false, kind: "unknown-variable", name: target.name };
    }
    if (typeof val !== "number") {
      return { ok: false, kind: "deref-non-ref", name: target.name };
    }
    return {
      ok: true,
      value: { name: target.name, mutable: false, value: val },
    };
  }
  const out = evalAst(node.target, env);
  if (!out.ok) {
    return out;
  }
  if (typeof out.value === "object" && "name" in out.value) {
    const ref = out.value as Ref;
    if (!ref.mutable) {
      return { ok: true, value: ref.value! };
    }
    const val = lookup(env.scope, ref.name);
    if (val === undefined) {
      return { ok: false, kind: "unknown-variable", name: ref.name };
    }
    return { ok: true, value: val };
  }
  return { ok: false, kind: "deref-non-ref", name: "" };
}

/**
 * Look up a name in the scope chain, innermost first.
 * @param {Scope} scope - The innermost scope to start from.
 * @param {string} name - The name to look up.
 * @returns {Value | undefined} The bound value, or undefined when unbound.
 */
function lookup(scope: Scope, name: string): Value | undefined {
  let cur: Scope | null = scope;
  while (cur !== null) {
    const value = cur.values[name];
    if (value !== undefined) {
      return value;
    }
    cur = cur.parent;
  }
  return undefined;
}

/**
 * Find the nearest scope in the chain that binds a name.
 * @param {Scope} scope - The innermost scope to start from.
 * @param {string} name - The name to locate.
 * @returns {Scope | null} The binding scope, or null when unbound.
 */
function findScope(scope: Scope, name: string): Scope | null {
  let cur: Scope | null = scope;
  while (cur !== null) {
    if (cur.values[name] !== undefined) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * Evaluate a block node, resolving its statements eagerly in a child env.
 * @param {BlockNode} node - The block node to evaluate.
 * @param {Env} env - The enclosing variable environment.
 * @returns {EvalOutcome} The evaluated body, or a structured error.
 */
function evalBlock(node: BlockNode, env: Env): EvalOutcome {
  const scope: Scope = { values: {}, mutable: {}, parent: env.scope };
  const child: Env = { scope };
  for (const statement of node.statements) {
    const out = isDerefAssign(statement)
      ? evalDerefAssignStatement(statement, child, scope)
      : evalStatement(statement, child, scope);
    if (!out.ok) {
      return out;
    }
  }
  return evalAst(node.body, child);
}

/**
 * Evaluate a dereference assignment statement in a block's child env.
 * @param {DerefAssign} statement - The dereference assignment statement.
 * @param {Env} child - The block's child environment.
 * @param {Scope} scope - The block's innermost scope.
 * @returns {EvalOutcome} A success, or a structured error.
 */
function evalDerefAssignStatement(
  statement: DerefAssign,
  child: Env,
  scope: Scope,
): EvalOutcome {
  const targetOut = evalAst(statement.target, child);
  if (!targetOut.ok) {
    return targetOut;
  }
  if (typeof targetOut.value !== "object" || !("name" in targetOut.value)) {
    return { ok: false, kind: "deref-non-ref", name: "" };
  }
  const ref = targetOut.value as Ref;
  if (!ref.mutable) {
    return { ok: false, kind: "immutable-assignment", name: ref.name };
  }
  const valOut = evalAst(statement.value, child);
  if (!valOut.ok) {
    return valOut;
  }
  const target = findScope(scope, ref.name) ?? scope;
  if (!typeMatches(child, ref.name, valOut.value)) {
    return { ok: false, kind: "type-mismatch", name: ref.name };
  }
  target.values[ref.name] = valOut.value;
  return { ok: true, value: valOut.value };
}

/**
 * Evaluate a binding or assignment statement in a block's child env.
 * @param {Binding | Assign} statement - The binding or assignment statement.
 * @param {Env} child - The block's child environment.
 * @param {Scope} scope - The block's innermost scope.
 * @returns {EvalOutcome} A success, or a structured error.
 */
function evalStatement(
  statement: Binding | Assign,
  child: Env,
  scope: Scope,
): EvalOutcome {
  const out = evalAst(statement.value, child);
  if (!out.ok) {
    return out;
  }
  if (isBinding(statement)) {
    scope.mutable[statement.name] = statement.mutable;
    scope.values[statement.name] = out.value;
    return { ok: true, value: out.value };
  }
  const target = findScope(scope, statement.name);
  if (target === null || !isMutable(target.mutable, statement.name)) {
    return { ok: false, kind: "immutable-assignment", name: statement.name };
  }
  if (!typeMatches(child, statement.name, out.value)) {
    return { ok: false, kind: "type-mismatch", name: statement.name };
  }
  target.values[statement.name] = out.value;
  return { ok: true, value: out.value };
}

/**
 * Whether a statement is a binding (as opposed to an assignment).
 * @param {Statement} statement - The statement to test.
 * @returns {boolean} True when the statement is a binding.
 */
function isBinding(statement: Statement): statement is Binding {
  return "mutable" in statement;
}

/**
 * Whether a statement is a dereference assignment.
 * @param {Statement} statement - The statement to test.
 * @returns {boolean} True when the statement is a deref assignment.
 */
function isDerefAssign(statement: Statement): statement is DerefAssign {
  return "target" in statement;
}

/**
 * Whether a name is bound mutable in a block's local scope.
 * @param {Record<string, boolean>} mutable - The block's mutability map.
 * @param {string} name - The name to test.
 * @returns {boolean} True when the name is bound and mutable.
 */
function isMutable(mutable: Record<string, boolean>, name: string): boolean {
  return mutable[name] === true;
}

/**
 * The primitive type of a value (references have no type for this purpose).
 * @param {Value} value - The value to classify.
 * @returns {"number" | "boolean"} The value's primitive type.
 */
function valueType(value: Value): "number" | "boolean" {
  return typeof value === "number" ? "number" : "boolean";
}

/**
 * Whether a value's type matches the type a name is currently bound to.
 * @param {Env} env - The environment the name is bound in.
 * @param {string} name - The name being assigned.
 * @param {Value} value - The value being assigned.
 * @returns {boolean} True when the value's type matches the bound type.
 */
function typeMatches(env: Env, name: string, value: Value): boolean {
  const bound = lookup(env.scope, name);
  if (bound === undefined) {
    return true;
  }
  return valueType(bound) === valueType(value);
}
