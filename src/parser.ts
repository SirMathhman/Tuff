import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";
import { isInRange, getRangeError } from "./types";

function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

function extractSuffix(
  trimmed: string,
  idx: number,
): { suffix: string; nextIdx: number } {
  let suffix = "";
  let sidx = idx;
  while (sidx < trimmed.length) {
    const ch = trimmed.charAt(sidx);
    if (ch !== " ") {
      suffix = suffix + ch;
      sidx = sidx + 1;
    } else {
      break;
    }
  }
  return { suffix, nextIdx: sidx };
}

export function parseNumberWithSuffix(
  s: string,
): Result<{ num: number; suffix: string; len: number }, TuffError> {
  const trimmed = s.trim();
  let isNeg = false;
  let idx = 0;

  if (trimmed.length > 0 && trimmed[0] === "-") {
    isNeg = true;
    idx = 1;
  }

  let digits = "";
  while (idx < trimmed.length) {
    const ch = trimmed.charAt(idx);
    if (ch >= "0" && ch <= "9") {
      digits = digits + ch;
      idx = idx + 1;
    } else {
      break;
    }
  }

  if (digits === "")
    return err(
      makeError(
        "Invalid number",
        `Input: ${trimmed}`,
        "No digits found in token",
        "Ensure the token starts with a digit",
      ),
    );

  let num = Number(digits);
  if (isNeg) num = -num;

  const { suffix } = extractSuffix(trimmed, idx);
  const finalSuffix = suffix || "I32";

  if (finalSuffix && isNeg && finalSuffix[0] === "U") {
    return err(
      makeError(
        "Invalid combination",
        `Input: ${s}`,
        "Cannot use negative numbers with unsigned type suffixes",
        `Remove the negative sign or use a signed suffix like I${finalSuffix.slice(1)}`,
      ),
    );
  }
  if (finalSuffix && !isInRange(num, finalSuffix)) return err(getRangeError(finalSuffix));

  const negSign = isNeg ? 1 : 0;
  return ok({ num, suffix: finalSuffix, len: negSign + digits.length + suffix.length });
}

export function validateResult(
  result: number,
  suffix: string,
): Result<number, TuffError> {
  if (suffix && !isInRange(result, suffix)) {
    return err(getRangeError(suffix));
  }
  return ok(result);
}

export function applyMultiplicationDivision(
  val: number,
  tokens: Array<number | string>,
  startIdx: number,
): Result<{ result: number; nextIdx: number }, TuffError> {
  let current = val;
  let i = startIdx;

  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== "*" && op !== "/") break;

    i = i + 1;
    const nextNum = tokens[i];
    if (typeof nextNum !== "number") break;

    if (op === "*") {
      current = current * nextNum;
    } else if (op === "/") {
      if (nextNum === 0) {
        return err(
          makeError(
            "Division by zero",
            `Divisor: ${nextNum}`,
            "Cannot divide by zero",
            "Ensure all divisors are non-zero",
          ),
        );
      }
      current = Math.floor(current / nextNum);
    }
    i = i + 1;
  }

  return ok({ result: current, nextIdx: i });
}

function handleHighPrecedence(
  tokens: Array<number | string>,
): Result<Array<number | string>, TuffError> {
  const multDivResult: Array<number | string> = [];
  let i = 0;
  let current = tokens[0];

  if (typeof current !== "number") return ok([0]);

  const initial = applyMultiplicationDivision(current, tokens, 1);
  if (!initial.ok) return initial;
  current = initial.value.result;
  i = initial.value.nextIdx;

  multDivResult.push(current);

  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== "+" && op !== "-") break;

    multDivResult.push(op);
    i = i + 1;

    const nextVal = tokens[i];
    if (typeof nextVal !== "number") break;

    const applied = applyMultiplicationDivision(nextVal, tokens, i + 1);
    if (!applied.ok) return applied;
    multDivResult.push(applied.value.result);
    i = applied.value.nextIdx;
  }

  return ok(multDivResult);
}

export function evaluateTokens(
  tokens: Array<number | string>,
): Result<number, TuffError> {
  const highPrecedence = handleHighPrecedence(tokens);
  if (!highPrecedence.ok) return highPrecedence;

  const multDivResult = highPrecedence.value;
  let result = 0;
  const firstVal = multDivResult[0];
  if (typeof firstVal === "number") {
    result = firstVal;
  }

  let j = 1;
  while (j < multDivResult.length) {
    const op = multDivResult[j];
    const val = multDivResult[j + 1];

    if (typeof val === "number") {
      if (op === "+") result = result + val;
      else if (op === "-") result = result - val;
    }

    j = j + 2;
  }

  return ok(result);
}
