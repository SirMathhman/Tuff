import { type Result, ok, err } from "./result";
import { type TuffError } from "./error";
import {
  isInRange,
  getRangeError,
  looksLikeNumber,
  parseBooleanLiteral,
} from "./types";
import { evaluateTokens as evaluateTokensImpl } from "./arithmetic";

export const evaluateTokens = evaluateTokensImpl;

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

function validateSuffixForNumber(
  finalSuffix: string,
  isNeg: boolean,
  inputStr: string,
): Result<void, TuffError> {
  if (finalSuffix && isNeg && finalSuffix[0] === "U") {
    return err(
      makeError(
        "Invalid combination",
        `Input: ${inputStr}`,
        "Cannot use negative numbers with unsigned type suffixes",
        `Remove the negative sign or use a signed suffix like I${finalSuffix.slice(1)}`,
      ),
    );
  }
  if (finalSuffix && !isInRange(0, finalSuffix))
    return err(getRangeError(finalSuffix));
  return ok();
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

  const validated = validateSuffixForNumber(finalSuffix, isNeg, s);
  if (!validated.ok) return validated;

  if (!isInRange(num, finalSuffix)) return err(getRangeError(finalSuffix));

  const negSign = isNeg ? 1 : 0;
  return ok({
    num,
    suffix: finalSuffix,
    len: negSign + digits.length + suffix.length,
  });
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



export function parseLiteral(
  s: string,
): Result<{ num: number; suffix: string }, TuffError> {
  let result = parseNumberWithSuffix(s);
  if (!result.ok && !looksLikeNumber(s)) {
    result = parseBooleanLiteral(s);
  }
  return result;
}
