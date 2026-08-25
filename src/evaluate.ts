import type { Result } from "./errors.ts";
import { interpret } from "./interpreter.ts";
import { tokenize } from "./lexer.ts";
import { groupStatements } from "./parser.ts";
import { typecheck } from "./typecheck.ts";

export function evaluate(input: string): Result<number> {
  if (input === "") return { ok: true, value: 0 };
  const tokensResult = tokenize(input);
  if (!tokensResult.ok) return tokensResult;
  const statementsResult = groupStatements(tokensResult.value);
  if (!statementsResult.ok) return statementsResult;
  const typeResult = typecheck(statementsResult.value);
  if (!typeResult.ok) return typeResult;
  const result = interpret(statementsResult.value);
  if (!result.ok) return result;
  const value = result.value;
  if (value === undefined) return { ok: true, value: 0 };
  return {
    ok: true,
    value: typeof value === "boolean" ? (value ? 1 : 0) : value,
  };
}
