import { tokenize } from "./tokenize";
import { evalLeftToRight } from "./evalLeftToRight";
import { Result, ok, err, isOk, isErr } from "./result";

export function interpret(input: string): Result<number, string> {
  const trimmed = input.trim();

  // Direct numeric literal (fast path)
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== "") {
    return ok(numeric);
  }

  // Delegate to tokenizer + evaluator
  const tokensRes = tokenize(trimmed);
  if (isErr(tokensRes)) return err(tokensRes.error);
  const evalRes = evalLeftToRight(tokensRes.value);
  if (isErr(evalRes)) return err(evalRes.error);
  return ok(evalRes.value);
}
