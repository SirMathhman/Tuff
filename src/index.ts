import { ok, programResultTooLargeAt, typeMismatchAt, type Result, type TuffError } from "./errors.ts";
import { tokenize } from "./tokenizer.ts";
import { invalidAt, whereAt } from "./parse-errors.ts";
import { parseExpr } from "./parser.ts";
import { blockBody } from "./statements.ts";
import { evaluate } from "./eval/evaluator.ts";
import { isInteger, isRecord, type Scope } from "./eval/values.ts";
import { parseFunctions, parseStructs } from "./structs.ts";

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
  const declared = parseStructs(tokens);

  if (!declared.ok) {
    return declared;
  }

  const functions = parseFunctions(tokens, declared.value.next, parseExpr);

  if (!functions.ok) {
    return functions;
  }

  const parsed = blockBody(tokens, functions.value.next, 0, parseExpr);

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

  const root: Scope = {
    name: "",
    cell: { value: 0, moved: false },
    mutable: false,
    structs: new Map(declared.value.structs.map((decl) => [decl.name, decl] as const)),
    functions: functions.value.functions,
  };
  const result = evaluate(parsed.value.value, root);

  if (!result.ok) {
    return result;
  }

  if (typeof result.value === "boolean") {
    return ok(result.value ? 1 : 0);
  }

  if (typeof result.value === "string") {
    return ok(result.value.codePointAt(0) ?? 0);
  }

  if (typeof result.value === "number") {
    return ok(result.value);
  }

  if (isInteger(result.value)) {
    const digits = result.value.value;
    const safe = BigInt(Number.MAX_SAFE_INTEGER);

    return digits >= -safe && digits <= safe ? ok(Number(digits)) : programResultTooLargeAt(whereAt(tokens, 0), digits);
  }

  const found = Array.isArray(result.value) ? "an array" : isRecord(result.value) ? "a record" : "a reference";

  return typeMismatchAt(whereAt(tokens, 0), "a number, boolean, or string", found);
}

// TODO: simple repl with interpretTuff
