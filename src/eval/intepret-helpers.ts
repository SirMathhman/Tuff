import { type Result, ok } from "../core/result";
import { type TuffError } from "../core/error";
import { parseLiteral } from "../parse/parser";
import { type VariableEntry } from "./variables";
import { isOperatorToken } from "../utils/validation";

export function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

export function errorUndefinedToken(label: string): TuffError {
  return makeError(
    "Invalid token",
    label,
    "Token is undefined",
    "Ensure all tokens are valid",
  );
}

export function determineSuffix(
  tokens: Array<string>,
  vars: Map<string, VariableEntry>,
): Result<string, TuffError> {
  for (let i = 0; i < tokens.length; i = i + 1) {
    const token = tokens[i];
    if (!isOperatorToken(token)) {
      if (vars.has(token)) {
        const entry = vars.get(token);
        if (entry) {
          return ok(entry.suffix);
        }
      } else {
        const parsed = parseLiteral(token);
        if (!parsed.ok) return parsed;
        return ok(parsed.value.suffix);
      }
    }
  }
  return ok("");
}
