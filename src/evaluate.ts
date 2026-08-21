import type { EvalError } from "./ast.ts";
import type { Result } from "./result.ts";
import { evaluateAst } from "./evaluator.ts";
import { parse } from "./parser.ts";

export function evaluate(input: string): Result<number, EvalError> {
  if (input.trim() === "") return { ok: true, value: 0 };
  const ast = parse(input);
  if (!ast.ok) return ast;
  return evaluateAst(ast.value, input);
}
