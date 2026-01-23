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

  if (trimmed[0] === "-") {
    isNeg = true;
    idx = 1;
  }

  let digits = "";
  while (idx < trimmed.length && trimmed[idx] >= "0" && trimmed[idx] <= "9") {
    digits = digits + trimmed[idx];
    idx = idx + 1;
  }

  if (digits === "") return err("No digits found");

  let num = Number(digits);
  if (isNeg) num = -num;

  const suffix = trimmed.slice(idx).split(" ")[0];
  if (suffix && isNeg && suffix[0] === "U") {
    return err("Negative numbers with unsigned type suffixes are not allowed");
  }
  if (suffix && !isInRange(num, suffix)) return err(getRangeError(suffix));

  const negSign = isNeg ? 1 : 0;
  return ok({ num, suffix, len: negSign + digits.length + suffix.length });
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
    const parsed = parseNumberWithSuffix(tokens[0]);
    return parsed.ok ? ok(parsed.value.num) : parsed;
  }

  let result = 0;
  let operator = "+";
  let i = 0;

  while (i < tokens.length) {
    const parsed = parseNumberWithSuffix(tokens[i]);
    if (!parsed.ok) return parsed;

    if (operator === "+") result = result + parsed.value.num;
    else if (operator === "-") result = result - parsed.value.num;

    i = i + 1;
    if (i < tokens.length) {
      operator = tokens[i];
      i = i + 1;
    }
  }

  return ok(result);
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
