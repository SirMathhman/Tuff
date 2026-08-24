import type { Result } from "./errors.ts";
import { interpret } from "./interpreter.ts";
import { tokenize } from "./lexer.ts";
import { groupStatements } from "./parser.ts";

export function evaluate(input: string): Result<unknown> {
  if (input === "") return { ok: true, value: 0 };
  const tokensResult = tokenize(input);
  if (!tokensResult.ok) return tokensResult;
  const statementsResult = groupStatements(tokensResult.value);
  if (!statementsResult.ok) return statementsResult;
  return interpret(statementsResult.value);
}
