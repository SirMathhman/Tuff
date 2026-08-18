import { err, EvalErrorCode, type EvalResult } from "./errors.ts";
import { tokenize } from "./tokens.ts";
import { parseStatements } from "./statements.ts";

export { EvalErrorCode } from "./errors.ts";
export type { EvalError, EvalResult } from "./errors.ts";

export function evaluate(input: string): EvalResult {
  if (input === "") return { ok: true, value: 0 };
  const tokens = tokenize(input);
  if (!tokens.ok) return tokens;
  const result = parseStatements(tokens.tokens, 0, new Map());
  if (!result.ok) return result;
  if (result.next !== tokens.tokens.length) {
    return err(
      EvalErrorCode.TrailingTokens,
      input,
      "Unexpected trailing tokens. Remove extra characters or operators.",
    );
  }
  return { ok: true, value: result.value };
}
