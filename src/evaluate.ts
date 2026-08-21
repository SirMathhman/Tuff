import type { EvalError } from "./errors.ts";
import type { Result } from "./result.ts";
import { evaluateAst } from "./evaluator.ts";
import { parse } from "./parser.ts";
import { typecheck } from "./typecheck.ts";

export function evaluate(input: string): Result<number, EvalError> {
  if (input.trim() === "") return { ok: true, value: 0 };
  const ast = parse(input);
  if (!ast.ok) return ast;
  const checked = typecheck(ast.value, input);
  if (!checked.ok) return checked;
  return evaluateAst(ast.value, input);
}
