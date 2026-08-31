import type { AstNode } from "./ast.ts";
import type { EvalFailure } from "./errors.ts";

export type Value = number | { ref: string };

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
      return { ok: true, value: { ref: ast.target } };
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
