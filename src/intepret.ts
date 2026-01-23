import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";
import {
  parseNumberWithSuffix,
  validateResult,
  evaluateTokens,
} from "./parser";

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
  evaluate: (s: string, vars: Map<string, number>) => Result<number, TuffError>,
  vars: Map<string, number>,
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

function parseVariableDeclarations(
  expr: string,
  vars: Map<string, number>,
): Result<{ finalExpr: string; vars: Map<string, number> }, TuffError> {
  let working = expr.trim();
  const newVars = new Map(vars);

  while (working.startsWith("let ")) {
    let semicolonIdx = -1;
    for (let i = 0; i < working.length; i = i + 1) {
      if (working.charAt(i) === ";") {
        semicolonIdx = i;
        break;
      }
    }

    if (semicolonIdx === -1) break;

    const declStr = working.substring(0, semicolonIdx).trim();
    working = working.substring(semicolonIdx + 1).trim();

    const eqIdx = declStr.indexOf("=");
    if (eqIdx === -1) break;

    const nameTypePart = declStr.substring(4, eqIdx).trim();
    const colonIdx = nameTypePart.indexOf(":");

    let varName = "";
    let varTypeSuffix = "";
    if (colonIdx === -1) {
      varName = nameTypePart;
    } else {
      varName = nameTypePart.substring(0, colonIdx).trim();
      varTypeSuffix = nameTypePart.substring(colonIdx + 1).trim();
    }

    const valueStr = declStr.substring(eqIdx + 1).trim();

    const parsed = parseNumberWithSuffix(valueStr);
    if (!parsed.ok) return parsed;

    if (varTypeSuffix !== "" && parsed.value.suffix !== "" && varTypeSuffix !== parsed.value.suffix) {
      return err(
        makeError(
          "Type suffix mismatch",
          `Variable: ${varTypeSuffix}, Value: ${parsed.value.suffix}`,
          "Variable type and value type must match",
          `Use matching suffixes, e.g., let x : U8 = 100U8; or let x = 100;`,
        ),
      );
    }

    newVars.set(varName, parsed.value.num);
  }

  return ok({ finalExpr: working, vars: newVars });
}

function validateTokens(
  tokens: Array<string>,
  vars: Map<string, number>,
): Result<
  { commonSuffix: string; parsedTokens: Array<number | string> },
  TuffError
> {
  let commonSuffix = "";
  let suffixSet = false;
  const parsedTokens = [];

  for (let i = 0; i < tokens.length; i = i + 1) {
    const token = tokens[i];
    if (token === undefined) return err(errorUndefinedToken(`Index: ${i}`));

    const isOp =
      token === "+" || token === "-" || token === "*" || token === "/";
    if (isOp) {
      parsedTokens.push(token);
    } else if (vars.has(token)) {
      const val = vars.get(token);
      if (typeof val === "number") {
        parsedTokens.push(val);
      }
    } else {
      const parsed = parseNumberWithSuffix(token);
      if (!parsed.ok) return parsed;

      if (!suffixSet) {
        commonSuffix = parsed.value.suffix;
        suffixSet = true;
      } else if (parsed.value.suffix !== commonSuffix) {
        return err(
          makeError(
            "Mixed type suffixes",
            `Common: ${commonSuffix}, Found: ${parsed.value.suffix}`,
            "Cannot mix different type suffixes in expression",
            `Use the same suffix for all numbers (e.g., all U8 or all I32)`,
          ),
        );
      }

      parsedTokens.push(parsed.value.num);
    }
  }

  return ok({ commonSuffix, parsedTokens });
}

function evaluateCore(
  expr: string,
  vars: Map<string, number>,
): Result<number, TuffError> {
  const parsed = parseVariableDeclarations(expr, vars);
  if (!parsed.ok) return parsed;
  const { finalExpr, vars: newVars } = parsed.value;

  const trimmed = finalExpr.trim();
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
    if (token === undefined) return err(errorUndefinedToken(`Token: ${token}`));

    if (newVars.has(token)) {
      const val = newVars.get(token);
      if (typeof val === "number") return ok(val);
    }

    const parsed = parseNumberWithSuffix(token);
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
  vars: Map<string, number>,
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
