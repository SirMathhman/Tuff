import { Result, ok, err } from "./result";

/**
 * Parses a string input and returns a Result<number, string>.
 *
 * Behavior:
 *  - empty or whitespace-only string => ok(0)
 *  - positive numeric string => ok(parsed number)
 *  - "100U8" format => ok(100)
 *  - negative with suffix (e.g., "-100U8") => err(message)
 *  - non-numeric => err(message)
 *
 * @param input - the input string to interpret
 * @returns Result<number, string>
 */
export function intepret(input: string): Result<number, string> {
  const s = input.trim();
  if (s === "") return ok(0);

  // Check for leading minus sign
  let isNegative = false;
  let startIdx = 0;
  if (s[0] === "-") {
    isNegative = true;
    startIdx = 1;
  }

  // Extract numeric part
  let numPart = "";
  let i = startIdx;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") {
    numPart = numPart + s[i];
    i = i + 1;
  }

  // Check if there are non-numeric characters after the digits
  const hasSuffix = i < s.length;
  let suffixStartsWithU = false;
  if (hasSuffix && s[i] === "U") {
    suffixStartsWithU = true;
  }

  // Reject negative numbers with unsigned type suffixes (U8, U16, etc.)
  if (isNegative && suffixStartsWithU) {
    return err("Negative numbers with unsigned type suffixes are not allowed");
  }

  // Parse the number
  let n = Number(numPart);
  if (Number.isNaN(n) || !Number.isFinite(n)) {
    return err("Invalid numeric format");
  }

  // Apply sign
  if (isNegative) n = -n;

  return ok(n);
}
