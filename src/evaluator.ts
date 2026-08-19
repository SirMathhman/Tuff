import type { AstNode, BinaryNode, LetNode, VariableNode } from "./ast.js";
import type { TuffError } from "./errors.js";
import type { Result } from "./result.js";

/**
 * Computes the numeric value of an AST.
 *
 * @param node - The AST to evaluate.
 * @param input - The raw input, carried into errors for diagnostics.
 * @returns A Result holding the numeric value, or a structured error.
 */
export function evaluateAst(node: AstNode, input: string): Result<number, TuffError> {
  return evalNode(node, new Map(), input);
}

function evalNode(
  node: AstNode,
  env: Map<string, number>,
  input: string,
): Result<number, TuffError> {
  switch (node.kind) {
    case "number":
      return { ok: true, value: node.value };
    case "variable":
      return evalVariable(node, env, input);
    case "let":
      return evalLet(node, env, input);
    case "binary":
      return evalBinary(node, env, input);
  }
}

function evalVariable(
  node: VariableNode,
  env: Map<string, number>,
  input: string,
): Result<number, TuffError> {
  const value = env.get(node.name);
  if (value === undefined) {
    return {
      ok: false,
      error: {
        kind: "undefined_variable",
        input,
        position: node.pos,
        name: node.name,
        message: `Undefined variable ${JSON.stringify(node.name)}`,
      },
    };
  }
  return { ok: true, value };
}

function evalLet(
  node: LetNode,
  env: Map<string, number>,
  input: string,
): Result<number, TuffError> {
  const initializer = evalNode(node.initializer, env, input);
  if (!initializer.ok) {
    return initializer;
  }
  const next = new Map(env);
  next.set(node.name, initializer.value);

  // A bare binding (no body after the `;`) evaluates to 0.
  if (node.body === undefined) {
    return { ok: true, value: 0 };
  }

  return evalNode(node.body, next, input);
}

function evalBinary(
  node: BinaryNode,
  env: Map<string, number>,
  input: string,
): Result<number, TuffError> {
  const left = evalNode(node.left, env, input);
  if (!left.ok) {
    return left;
  }
  const right = evalNode(node.right, env, input);
  if (!right.ok) {
    return right;
  }

  switch (node.op) {
    case "plus":
      return { ok: true, value: left.value + right.value };
    case "minus":
      return { ok: true, value: left.value - right.value };
    case "times":
      return { ok: true, value: left.value * right.value };
  }
}
