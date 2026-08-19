import type { AssignNode, AstNode, BinaryNode, BlockNode, LetNode, VariableNode } from "./ast.js";
import type { TuffError } from "./errors.js";
import type { SourcePosition } from "./position.js";
import type { Result } from "./result.js";

/** A variable binding: its current value and whether it may be reassigned. */
type Binding = { value: number; mut: boolean };

type Env = Map<string, Binding>;

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

function evalNode(node: AstNode, env: Env, input: string): Result<number, TuffError> {
  switch (node.kind) {
    case "number":
      return { ok: true, value: node.value };
    case "variable":
      return evalVariable(node, env, input);
    case "let":
      return evalLet(node, env, input);
    case "assign":
      return evalAssign(node, env, input);
    case "block":
      return evalBlock(node, env, input);
    case "binary":
      return evalBinary(node, env, input);
  }
}

/** Looks up a binding, or returns an `undefined_variable` error. */
function lookup(
  name: string,
  pos: SourcePosition,
  env: Env,
  input: string,
): Result<Binding, TuffError> {
  const binding = env.get(name);
  if (binding === undefined) {
    return {
      ok: false,
      error: {
        kind: "undefined_variable",
        input,
        position: pos,
        name,
        message: `Undefined variable ${JSON.stringify(name)}`,
      },
    };
  }
  return { ok: true, value: binding };
}

function evalVariable(node: VariableNode, env: Env, input: string): Result<number, TuffError> {
  const binding = lookup(node.name, node.pos, env, input);
  if (!binding.ok) {
    return binding;
  }
  return { ok: true, value: binding.value.value };
}

function evalLet(node: LetNode, env: Env, input: string): Result<number, TuffError> {
  const initializer = evalNode(node.initializer, env, input);
  if (!initializer.ok) {
    return initializer;
  }
  const next = new Map(env);
  next.set(node.name, { value: initializer.value, mut: node.mut });

  // The value of the binding is the value of its last statement,
  // or 0 when there are no statements.
  let result: Result<number, TuffError> = { ok: true, value: 0 };
  for (const statement of node.statements) {
    result = evalNode(statement, next, input);
    if (!result.ok) {
      return result;
    }
  }
  return result;
}

function evalAssign(node: AssignNode, env: Env, input: string): Result<number, TuffError> {
  const binding = lookup(node.name, node.pos, env, input);
  if (!binding.ok) {
    return binding;
  }

  if (!binding.value.mut) {
    return {
      ok: false,
      error: {
        kind: "assignment_to_immutable",
        input,
        position: node.pos,
        name: node.name,
        message: `Cannot assign to immutable variable ${JSON.stringify(node.name)}`,
      },
    };
  }

  const value = evalNode(node.value, env, input);
  if (!value.ok) {
    return value;
  }
  binding.value.value = value.value;
  return { ok: true, value: value.value };
}

function evalBlock(node: BlockNode, env: Env, input: string): Result<number, TuffError> {
  // A block is valued by its last statement; earlier ones run for effect.
  let result: Result<number, TuffError> = { ok: true, value: 0 };
  for (const statement of node.statements) {
    result = evalNode(statement, env, input);
    if (!result.ok) {
      return result;
    }
  }
  return result;
}

function evalBinary(node: BinaryNode, env: Env, input: string): Result<number, TuffError> {
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
