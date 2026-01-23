import { type Result, ok, err } from "./result";

function isInRange(n: number, suffix: string): boolean {
  if (suffix === "U8") return n >= 0 && n <= 255;
  if (suffix === "U16") return n >= 0 && n <= 65535;
  if (suffix === "U32") return n >= 0 && n <= 4294967295;
  if (suffix === "I8") return n >= -128 && n <= 127;
  if (suffix === "I16") return n >= -32768 && n <= 32767;
  if (suffix === "I32") return n >= -2147483648 && n <= 2147483647;
  return true;
}

function getRangeError(suffix: string): string {
  if (suffix === "U8") return "Value out of range for U8 (0-255)";
  if (suffix === "U16") return "Value out of range for U16 (0-65535)";
  if (suffix === "U32") return "Value out of range for U32 (0-4294967295)";
  if (suffix === "I8") return "Value out of range for I8 (-128 to 127)";
  if (suffix === "I16") return "Value out of range for I16 (-32768 to 32767)";
  if (suffix === "I32")
    return "Value out of range for I32 (-2147483648 to 2147483647)";
  return "Value out of range";
}

function parseNumberWithSuffix(
  s: string,
): Result<{ num: number; suffix: string; len: number }, string> {
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

  if (digits === "") return err("No digits found");

  let num = Number(digits);
  if (isNeg) num = -num;

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

  if (suffix && isNeg && suffix[0] === "U") {
    return err("Negative numbers with unsigned type suffixes are not allowed");
  }
  if (suffix && !isInRange(num, suffix)) return err(getRangeError(suffix));

  const negSign = isNeg ? 1 : 0;
  return ok({ num, suffix, len: negSign + digits.length + suffix.length });
}

function validateResult(
  result: number,
  suffix: string,
): Result<number, string> {
  if (suffix && !isInRange(result, suffix)) {
    return err(getRangeError(suffix));
  }
  return ok(result);
}

function evaluateExpression(expr: string): Result<number, string> {
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

function applyMultiplication(
  val: number,
  tokens: Array<number | string>,
  startIdx: number,
): { result: number; nextIdx: number } {
  let current = val;
  let i = startIdx;

  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== "*") break;

    i = i + 1;
    const multNum = tokens[i];
    if (typeof multNum !== "number") break;

    current = current * multNum;
    i = i + 1;
  }

  return { result: current, nextIdx: i };
}

function evaluateTokens(tokens: Array<number | string>): number {
  const multDivResult: Array<number | string> = [];
  let i = 0;
  let current = tokens[0];

  if (typeof current !== "number") return 0;

  i = 1;
  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== "*") break;

    i = i + 1;
    const nextNum = tokens[i];
    if (typeof nextNum !== "number") break;

    if (typeof current === "number") {
      current = current * nextNum;
    }
    i = i + 1;
  }

  multDivResult.push(current);

  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== "+" && op !== "-") break;

    multDivResult.push(op);
    i = i + 1;

    const nextVal = tokens[i];
    if (typeof nextVal !== "number") break;

    const applied = applyMultiplication(nextVal, tokens, i + 1);
    multDivResult.push(applied.result);
    i = applied.nextIdx;
  }

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

  return result;
}

/**
 * Parses a string input and returns a Result<number, string>.
 *
 * Behavior:
 *  - empty or whitespace-only string => ok(0)
 *  - positive numeric string => ok(parsed number)
 *  - "100U8" format => ok(100)
 *  - expressions like "1U8 + 2U8" => ok(3)
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
