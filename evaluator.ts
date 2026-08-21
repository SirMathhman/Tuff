import { tokenize } from "./lexer.ts";
import { parse, type ParserState } from "./parser.ts";
import type { AstNode, EvalError, Result } from "./types.ts";

type Env = Map<string, number>[];

function lookup(
  env: Env,
  name: string,
  index: number,
): Result<number, EvalError> {
  for (let s = env.length - 1; s >= 0; s--) {
    const value = env[s]?.get(name);
    if (value !== undefined) return { ok: true, value };
  }
  return {
    ok: false,
    error: { kind: "unknown-variable", index, name },
  };
}

function evalNode(node: AstNode, env: Env): Result<number, EvalError> {
  switch (node.kind) {
    case "num":
      return { ok: true, value: node.value };
    case "var":
      return lookup(env, node.name, node.index);
    case "neg": {
      const v = evalNode(node.operand, env);
      if (!v.ok) return v;
      return { ok: true, value: -v.value };
    }
    case "binary": {
      const left = evalNode(node.left, env);
      if (!left.ok) return left;
      const right = evalNode(node.right, env);
      if (!right.ok) return right;
      const value =
        node.op === "+"
          ? left.value + right.value
          : node.op === "-"
            ? left.value - right.value
            : left.value * right.value;
      return { ok: true, value };
    }
    case "let": {
      const v = evalNode(node.value, env);
      if (!v.ok) return v;
      env.push(new Map([[node.name, v.value]]));
      const body = evalNode(node.body, env);
      env.pop();
      return body;
    }
    case "block": {
      env.push(new Map());
      const body = evalNode(node.body, env);
      env.pop();
      return body;
    }
  }
}

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return { ok: true, value: 0 };

  const state: ParserState = {
    tokens: tokenize(input),
    pos: 0,
    inputLength: input.trimEnd().length,
  };
  const ast = parse(state);
  if (!ast.ok) return ast;
  return evalNode(ast.value, [new Map()]);
}
