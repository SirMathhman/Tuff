import type { AstNode } from "./ast.ts";

/**
 * A variable environment mapping names to values.
 */
export interface Env {
  /** Look up a variable by name. */
  get(name: string): number | undefined;
}

/**
 * A successful evaluation outcome.
 */
export interface EvalSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The evaluated value. */
  value: number;
}

/**
 * A failed evaluation outcome.
 */
export interface EvalFailure {
  /** Marks the outcome as failed. */
  ok: false;
  /** The name of the unknown variable. */
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
      return { ok: false, name: node.name };
    }
    return { ok: true, value };
  }
  if (node.kind === "block") {
    const values: Record<string, number> = {};
    const child: Env = {
      get: (name: string) => {
        const value = values[name];
        return value === undefined ? env.get(name) : value;
      },
    };
    for (const statement of node.statements) {
      const out = evalAst(statement.value, child);
      if (!out.ok) {
        return out;
      }
      values[statement.name] = out.value;
    }
    return evalAst(node.body, child);
  }
  const left = evalAst(node.left, env);
  if (!left.ok) {
    return left;
  }
  const right = evalAst(node.right, env);
  if (!right.ok) {
    return right;
  }
  switch (node.op) {
    case "+":
      return { ok: true, value: left.value + right.value };
    case "-":
      return { ok: true, value: left.value - right.value };
    case "*":
      return { ok: true, value: left.value * right.value };
    default: {
      const exhaustive: never = node.op;
      return exhaustive;
    }
  }
}
