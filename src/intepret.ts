import { Result, ok, err } from "./result";

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
  if (suffix === "I32") return "Value out of range for I32 (-2147483648 to 2147483647)";
  return "Value out of range";
}

/**
 * Parses a string input and returns a Result<number, string>.
 *
 * Behavior:
 *  - empty or whitespace-only string => ok(0)
 *  - positive numeric string => ok(parsed number)
 *  - "100U8" format => ok(100)
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

  let isNegative = false;
  let startIdx = 0;
  if (s[0] === "-") {
    isNegative = true;
    startIdx = 1;
  }

  let numPart = "";
  let i = startIdx;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") {
    numPart = numPart + s[i];
    i = i + 1;
  }

  const hasSuffix = i < s.length;
  const suffixStartsWithU = hasSuffix && s[i] === "U";

  if (isNegative && suffixStartsWithU) {
    return err("Negative numbers with unsigned type suffixes are not allowed");
  }

  let n = Number(numPart);
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    return err("Invalid numeric format");
  }

  if (isNegative) n = -n;

  if (hasSuffix) {
    const suffix = s.slice(i);
    if (!isInRange(n, suffix)) return err(getRangeError(suffix));
  }

  return ok(n);
}
