import { type Result, ok, err } from "./result";
import {
  parseNumberWithSuffix,
  validateResult,
  evaluateTokens,
} from "./parser";

function hasOpenParen(s: string): boolean {
  for (let i = 0; i < s.length; i = i + 1) {
    if (s[i] === "(") return true;
  }
  return false;
}

function resolveParentheses(
  expr: string,
  evaluate: (s: string) => Result<number, string>,
): Result<string, string> {
  let result = expr;

  while (hasOpenParen(result)) {
    let lastOpen = -1;
    for (let i = 0; i < result.length; i = i + 1) {
      if (result[i] === "(") lastOpen = i;
      if (result[i] === ")" && lastOpen !== -1) {
        const inner = result.substring(lastOpen + 1, i);
        const evaluated = evaluate(inner);
        if (!evaluated.ok) return evaluated;

        const before = result.substring(0, lastOpen);
        const after = result.substring(i + 1);
        result = before + evaluated.value + after;
        break;
      }
    }
  }

  return ok(result);
}

function evaluateCore(expr: string): Result<number, string> {
  const trimmed = expr.trim();
  const tokens = [];
  let current = "";

  for (let i = 0; i < trimmed.length; i = i + 1) {
    const c = trimmed[i];
    if (c === " ") {
      if (current !== "") {
        tokens.push(current);
        current = "";
      }
    } else {
      current = current + c;
    }
  }

  if (current !== "") tokens.push(current);
  if (tokens.length === 0) return ok(0);

  if (tokens.length === 1) {
    const token = tokens[0];
    if (token === undefined) return err("Invalid token");
    const parsed = parseNumberWithSuffix(token);
    return parsed.ok ? ok(parsed.value.num) : parsed;
  }

  let commonSuffix = "";
  let suffixSet = false;
  const parsedTokens = [];

  for (let i = 0; i < tokens.length; i = i + 1) {
    const token = tokens[i];
    if (token === undefined) return err("Invalid token");

    const isOp = token === "+" || token === "-" || token === "*";
    if (isOp) {
      parsedTokens.push(token);
    } else {
      const parsed = parseNumberWithSuffix(token);
      if (!parsed.ok) return parsed;

      if (!suffixSet) {
        commonSuffix = parsed.value.suffix;
        suffixSet = true;
      } else if (parsed.value.suffix !== commonSuffix) {
        return err("Mixed type suffixes in expression");
      }

      parsedTokens.push(parsed.value.num);
    }
  }

  const result = evaluateTokens(parsedTokens);
  return validateResult(result, commonSuffix);
}

function evaluateExpression(expr: string): Result<number, string> {
  const resolvedResult = resolveParentheses(expr, evaluateExpression);
  if (!resolvedResult.ok) return resolvedResult;
  return evaluateCore(resolvedResult.value);
}

/**
 * Parses a string input and returns a Result<number, string>.
 *
 * Behavior:
 *  - empty or whitespace-only string => ok(0)
 *  - positive numeric string => ok(parsed number)
 *  - "100U8" format => ok(100)
 *  - expressions like "1U8 + 2U8" => ok(3)
 *  - expressions with parentheses like "(4 + 2) * 3" => ok(18)
 *  - negative with suffix (e.g., "-100U8") => err(message)
 *  - out of range for type (e.g., "256U8") => err(message)
 *  - non-numeric => err(message)
 *
 * @param input - the input string to interpret
 * @returns Result<number, string>
 */
export function intepret(input: string): Result<number, string> {
  const s = input.trim();
  if (s === "") return ok(0);
  return evaluateExpression(s);
}
