import type {
  AstNode,
  Binding,
  BlockNode,
  DerefAssign,
  DerefNode,
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
 * A value produced by evaluation: a number or a reference.
 */
export type Value = number | Ref;

/**
 * A variable environment mapping names to values.
 */
export interface Env {
  /** Look up a variable by name. */
  get(name: string): Value | undefined;
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
  kind: "unknown-variable" | "immutable-assignment" | "deref-non-ref";
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
  if (node.kind === "ident") {
    const value = env.get(node.name);
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
  const left = evalAst(node.left, env);
  if (!left.ok) {
    return left;
  }
  const right = evalAst(node.right, env);
  if (!right.ok) {
    return right;
  }
  if (typeof left.value !== "number" || typeof right.value !== "number") {
    return { ok: false, kind: "deref-non-ref", name: "" };
  }
  switch (node.op) {
    case "+":
      return { ok: true, value: left.value + right.value };
    case "-":
      return { ok: true, value: left.value - right.value };
    case "*":
      return { ok: true, value: left.value * right.value };
    case "||":
      return {
        ok: true,
        value: left.value !== 0 || right.value !== 0 ? 1 : 0,
      };
    case "&&":
      return {
        ok: true,
        value: left.value !== 0 && right.value !== 0 ? 1 : 0,
      };
    case "==":
      return { ok: true, value: left.value === right.value ? 1 : 0 };
    default: {
      const exhaustive: never = node.op;
      return exhaustive;
    }
  }
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
    const val = env.get(target.name);
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
  if (typeof out.value !== "number" && "name" in out.value) {
    const ref = out.value as Ref;
    if (!ref.mutable) {
      return { ok: true, value: ref.value! };
    }
    const val = env.get(ref.name);
    if (val === undefined) {
      return { ok: false, kind: "unknown-variable", name: ref.name };
    }
    return { ok: true, value: val };
  }
  return { ok: false, kind: "deref-non-ref", name: "" };
}

/**
 * Evaluate a block node, resolving its statements eagerly in a child env.
 * @param {BlockNode} node - The block node to evaluate.
 * @param {Env} env - The enclosing variable environment.
 * @returns {EvalOutcome} The evaluated body, or a structured error.
 */
function evalBlock(node: BlockNode, env: Env): EvalOutcome {
  const values: Record<string, Value> = {};
  const mutable: Record<string, boolean> = {};
  const child: Env = {
    get: (name: string) => {
      const value = values[name];
      return value === undefined ? env.get(name) : value;
    },
  };
  for (const statement of node.statements) {
    if (isDerefAssign(statement)) {
      const targetOut = evalAst(statement.target, child);
      if (!targetOut.ok) {
        return targetOut;
      }
      if (typeof targetOut.value === "number") {
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
      values[ref.name] = valOut.value;
    } else {
      const out = evalAst(statement.value, child);
      if (!out.ok) {
        return out;
      }
      if (isBinding(statement)) {
        mutable[statement.name] = statement.mutable;
      } else if (!isMutable(mutable, statement.name)) {
        return {
          ok: false,
          kind: "immutable-assignment",
          name: statement.name,
        };
      }
      values[statement.name] = out.value;
    }
  }
  return evalAst(node.body, child);
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
