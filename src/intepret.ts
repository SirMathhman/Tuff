import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";
import { validateResult, evaluateTokens, parseLiteral } from "./parser";
import { parseVariableDeclarations, type VariableEntry } from "./variables";
import {
  checkOperatorTypeCompat,
  createMixedSuffixError,
  isOperatorToken,
} from "./validation";

function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

function hasOpenParen(s: string): boolean {
  for (let i = 0; i < s.length; i = i + 1) {
    if (s[i] === "(" || s[i] === "{") return true;
  }
  return false;
}

function resolveParentheses(
  expr: string,
  evaluate: (
    s: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
  vars: Map<string, VariableEntry>,
): Result<string, TuffError> {
  let result = expr;

  while (hasOpenParen(result)) {
    let lastOpen = -1;
    let openChar = "";
    for (let i = 0; i < result.length; i = i + 1) {
      const ch = result.charAt(i);
      if (ch === "(" || ch === "{") {
        lastOpen = i;
        openChar = ch;
      }
      const closeChar = openChar === "{" ? "}" : ")";
      if (ch === closeChar && lastOpen !== -1) {
        const inner = result.substring(lastOpen + 1, i);
        const evaluated = evaluate(inner, vars);
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

function errorUndefinedToken(label: string): TuffError {
  return makeError(
    "Invalid token",
    label,
    "Token is undefined",
    "Ensure all tokens are valid",
  );
}

function determineSuffix(
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

function buildParsedTokens(
  tokens: Array<string>,
  commonSuffix: string,
  vars: Map<string, VariableEntry>,
): Result<Array<number | string>, TuffError> {
  const parsedTokens = [];
  for (let i = 0; i < tokens.length; i = i + 1) {
    const token = tokens[i];
    if (token === undefined) return err(errorUndefinedToken(`Index: ${i}`));

    if (isOperatorToken(token)) {
      const typeCheck = checkOperatorTypeCompat(token, commonSuffix);
      if (!typeCheck.ok) return typeCheck;
      parsedTokens.push(token);
    } else if (vars.has(token)) {
      const entry = vars.get(token);
      if (entry) {
        if (entry.suffix !== commonSuffix) {
          return err(createMixedSuffixError(commonSuffix, entry.suffix));
        }
        parsedTokens.push(entry.value);
      }
    } else {
      const parsed = parseLiteral(token);
      if (!parsed.ok) return parsed;

      if (parsed.value.suffix !== commonSuffix) {
        return err(createMixedSuffixError(commonSuffix, parsed.value.suffix));
      }

      parsedTokens.push(parsed.value.num);
    }
  }

  return ok(parsedTokens);
}

function validateTokens(
  tokens: Array<string>,
  vars: Map<string, VariableEntry>,
): Result<
  { commonSuffix: string; parsedTokens: Array<number | string> },
  TuffError
> {
  const suffixResult = determineSuffix(tokens, vars);
  if (!suffixResult.ok) return suffixResult;
  const commonSuffix = suffixResult.value;

  const tokensResult = buildParsedTokens(tokens, commonSuffix, vars);
  if (!tokensResult.ok) return tokensResult;
  const parsedTokens = tokensResult.value;

  return ok({ commonSuffix, parsedTokens });
}

function evaluateCore(
  expr: string,
  vars: Map<string, VariableEntry>,
): Result<number, TuffError> {
  const parsed = parseVariableDeclarations(expr, vars);
  if (!parsed.ok) return parsed;
  const { finalExpr, vars: newVars } = parsed.value;

  const trimmed = finalExpr.trim();
  const tokens = [];
  let current = "";

  for (let i = 0; i < trimmed.length; i = i + 1) {
    const c = trimmed[i];
    const nextC = i + 1 < trimmed.length ? trimmed[i + 1] : "";
    if ((c === "|" || c === "&") && nextC === c) {
      if (current) tokens.push(current);
      tokens.push(c + c);
      current = "";
      i = i + 1;
    } else if (c === " ") {
      if (current) tokens.push(current);
      current = "";
    } else {
      current = current + c;
    }
  }

  if (current) tokens.push(current);
  if (!tokens.length) return ok(0);

  if (tokens.length === 1) {
    const token = tokens[0];
    if (!token) return err(errorUndefinedToken(`Token: ${token}`));

    if (newVars.has(token)) {
      const entry = newVars.get(token);
      if (entry) return ok(entry.value);
    }

    const parsed = parseLiteral(token);
    return parsed.ok ? ok(parsed.value.num) : parsed;
  }

  const validated = validateTokens(tokens, newVars);
  if (!validated.ok) return validated;
  const { commonSuffix, parsedTokens } = validated.value;

  const evaluated = evaluateTokens(parsedTokens);
  if (!evaluated.ok) return evaluated;
  return validateResult(evaluated.value, commonSuffix);
}

function evaluateExpression(
  expr: string,
  vars: Map<string, VariableEntry>,
): Result<number, TuffError> {
  const resolvedResult = resolveParentheses(expr, evaluateExpression, vars);
  if (!resolvedResult.ok) return resolvedResult;
  return evaluateCore(resolvedResult.value, vars);
}

/**
 * Parses a string input and returns a Result<number, TuffError>.
 *
 * Behavior:
 *  - empty or whitespace-only string => ok(0)
 *  - positive numeric string => ok(parsed number)
 *  - "100U8" format => ok(100)
 *  - expressions like "1U8 + 2U8" => ok(3)
 *  - expressions with parentheses like "(4 + 2) * 3" => ok(18)
 *  - negative with suffix (e.g., "-100U8") => err(TuffError)
 *  - out of range for type (e.g., "256U8") => err(TuffError)
 *  - non-numeric => err(TuffError)
 *
 * @param input - the input string to interpret
 * @returns Result<number, TuffError>
 */
export function intepret(input: string): Result<number, TuffError> {
  const s = input.trim();
  if (s === "") return ok(0);
  return evaluateExpression(s, new Map());
}
