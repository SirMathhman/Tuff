import type { AstNode } from "./ast.ts";
import type { EvalFailure } from "./errors.ts";

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: EvalFailure };

export type Env = Map<string, number>;

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
      const value = env.get(ast.name);
      if (value === undefined) {
        return {
          ok: false,
          error: {
            kind: "undefined",
            message: `undefined variable ${ast.name}`,
            position: ast.position,
          },
        };
      }
      return { ok: true, value };
    }
    case "let": {
      const value = evalAst(ast.value, env);
      if (!value.ok) {
        return value;
      }
      const child = new Map(env);
      child.set(ast.name, value.value);
      return evalAst(ast.body, child);
    }
  }
}

function binop(
  ast: { left: AstNode; right: AstNode },
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
  return { ok: true, value: op(left.value, right.value) };
}
