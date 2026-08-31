import type { AstNode } from "./ast.ts";
import type { EvalFailure } from "./errors.ts";

export type Value = number | { ref: string; mut: boolean };

export type EvalResult =
  | { ok: true; value: Value }
  | { ok: false; error: EvalFailure };

export type Binding = { value: Value; mutable: boolean };

export type Env = Map<string, Binding>;

export function evalAst(ast: AstNode, env: Env = new Map()): EvalResult {
  switch (ast.type) {
    case "number":
      return { ok: true, value: ast.value };
    case "add":
      return binop(ast, env, (a, b) => a + b);
    case "sub":
      return binop(ast, env, (a, b) => a - b);
    case "mul":
      return binop(ast, env, (a, b) => a * b);
    case "or":
      return evalOr(ast, env);
    case "ident": {
      const binding = env.get(ast.name);
      if (binding === undefined) {
        return {
          ok: false,
          error: {
            kind: "undefined",
            message: `undefined variable ${ast.name}`,
            position: ast.position,
          },
        };
      }
      return { ok: true, value: binding.value };
    }
    case "let": {
      const value = evalAst(ast.value, env);
      if (!value.ok) {
        return value;
      }
      const child = new Map(env);
      child.set(ast.name, { value: value.value, mutable: ast.mutable });
      return evalAst(ast.body, child);
    }
    case "assign": {
      const value = evalAst(ast.value, env);
      if (!value.ok) {
        return value;
      }
      const binding = env.get(ast.name);
      if (binding === undefined) {
        return {
          ok: false,
          error: {
            kind: "undefined",
            message: `undefined variable ${ast.name}`,
            position: ast.position,
          },
        };
      }
      if (!binding.mutable) {
        return {
          ok: false,
          error: {
            kind: "immutable",
            message: `cannot assign to immutable variable ${ast.name}`,
            position: ast.position,
          },
        };
      }
      binding.value = value.value;
      return evalAst(ast.body, env);
    }
    case "ref": {
      const binding = env.get(ast.target);
      if (binding === undefined) {
        return {
          ok: false,
          error: {
            kind: "undefined",
            message: `undefined variable ${ast.target}`,
            position: ast.position,
          },
        };
      }
      if (ast.mut && !binding.mutable) {
        return {
          ok: false,
          error: {
            kind: "type",
            message: `cannot take a mutable reference to immutable variable ${ast.target}`,
            position: ast.position,
          },
        };
      }
      return { ok: true, value: { ref: ast.target, mut: ast.mut } };
    }
    case "deref": {
      const inner = evalAst(ast.operand, env);
      if (!inner.ok) {
        return inner;
      }
      if (typeof inner.value === "number") {
        return {
          ok: false,
          error: {
            kind: "type",
            message: "cannot dereference a number",
            position: ast.position,
          },
        };
      }
      const target = env.get(inner.value.ref);
      if (target === undefined) {
        return {
          ok: false,
          error: {
            kind: "undefined",
            message: `undefined variable ${inner.value.ref}`,
            position: ast.position,
          },
        };
      }
      return { ok: true, value: target.value };
    }
    case "derefAssign": {
      const value = evalAst(ast.value, env);
      if (!value.ok) {
        return value;
      }
      const inner = evalAst(ast.operand, env);
      if (!inner.ok) {
        return inner;
      }
      if (typeof inner.value === "number") {
        return {
          ok: false,
          error: {
            kind: "type",
            message: "cannot assign through a number",
            position: ast.position,
          },
        };
      }
      if (!inner.value.mut) {
        return {
          ok: false,
          error: {
            kind: "type",
            message: "cannot assign through a shared reference",
            position: ast.position,
          },
        };
      }
      const target = env.get(inner.value.ref);
      if (target === undefined) {
        return {
          ok: false,
          error: {
            kind: "undefined",
            message: `undefined variable ${inner.value.ref}`,
            position: ast.position,
          },
        };
      }
      target.value = value.value;
      return evalAst(ast.body, env);
    }
  }
}

function binop(
  ast: { left: AstNode; right: AstNode; position: number },
  env: Env,
  op: (a: number, b: number) => number,
): EvalResult {
  const left = evalAst(ast.left, env);
  if (!left.ok) {
    return left;
  }
  const right = evalAst(ast.right, env);
  if (!right.ok) {
    return right;
  }
  if (typeof left.value !== "number" || typeof right.value !== "number") {
    return {
      ok: false,
      error: {
        kind: "type",
        message: "expected a number",
        position: ast.position,
      },
    };
  }
  return { ok: true, value: op(left.value, right.value) };
}

// Short-circuit logical OR: the right operand is evaluated only when the
// left is zero (falsy). A ref operand is a "type" error, matching binop.
function evalOr(
  ast: { left: AstNode; right: AstNode; position: number },
  env: Env,
): EvalResult {
  const left = evalAst(ast.left, env);
  if (!left.ok) {
    return left;
  }
  if (typeof left.value !== "number") {
    return {
      ok: false,
      error: {
        kind: "type",
        message: "expected a number",
        position: ast.position,
      },
    };
  }
  if (left.value !== 0) {
    return { ok: true, value: 1 };
  }
  const right = evalAst(ast.right, env);
  if (!right.ok) {
    return right;
  }
  if (typeof right.value !== "number") {
    return {
      ok: false,
      error: {
        kind: "type",
        message: "expected a number",
        position: ast.position,
      },
    };
  }
  return { ok: true, value: right.value !== 0 ? 1 : 0 };
}
