import { ok, typeMismatchAt, type Result, type TuffError } from "./errors.ts";
import { tokenize } from "./tokenizer.ts";
import { invalidAt, whereAt } from "./parse-errors.ts";
import { parseExpr } from "./parser.ts";
import { blockBody } from "./statements.ts";
import { evaluate } from "./evaluator.ts";

export { describeError } from "./errors.ts";
export type {
  Ok,
  Err,
  Result,
  ErrorWhere,
  TuffError,
  TuffErrorDetails,
  InvalidTerm,
  TermTooLarge,
  ResultTooLarge,
  NestingTooDeep,
  UndefinedName,
  ImmutableAssignment,
  TypeMismatch,
} from "./errors.ts";

/**
 * Interprets Tuff source text and returns its numeric value.
 * @param tuffSource - The Tuff program text.
 * @returns The computed value, or a structured error describing the first problem.
 */
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tokenize(tuffSource);
  const parsed = blockBody(tokens, 0, 0, parseExpr);

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

  const result = evaluate(parsed.value.value);

  if (!result.ok) {
    return result;
  }

  if (typeof result.value === "boolean") {
    return ok(result.value ? 1 : 0);
  }

  if (Array.isArray(result.value)) {
    return typeMismatchAt(whereAt(tokens, 0), "a number, boolean, or string", "an array");
  }

  if (typeof result.value === "string") {
    return ok(result.value.codePointAt(0) ?? 0);
  }

  return ok(result.value);
}

// TODO: simple repl with interpretTuff
