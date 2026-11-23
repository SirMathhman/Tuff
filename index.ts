import { type Result, type TuffError } from "./errors.ts";
import { tokenize } from "./tokenizer.ts";
import { parseExpr, invalidAt } from "./parser.ts";
import { evaluate } from "./evaluator.ts";

export * from "./errors.ts";

/**
 * Interprets Tuff source text and returns its numeric value.
 * @param tuffSource - The Tuff program text.
 * @returns The computed value, or a structured error describing the first problem.
 */
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tokenize(tuffSource);
  const parsed = parseExpr(tokens, 0, 0);

  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.value.next !== tokens.length) {
    return invalidAt(
      tokens,
      parsed.value.next,
      "'+', '-', '*', a closing ')' or '}', or the end of the input",
      "Remove the extra token, or add an operator before it.",
    );
  }

  return evaluate(parsed.value.value);
}

// TODO: simple repl with interpretTuff
