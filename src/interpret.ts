/**
 * Minimal interpret implementation: parse a leading integer (optional sign).
 * Behavior required by tests:
 * - accept leading integer and ignore trailing text for non-negative numbers
 * - throw if a negative integer has trailing text
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === "") return NaN;

  const { numStr, rest } = splitNumberAndSuffix(s);
  if (numStr === "") return NaN;

  const value = Number(numStr);
  if (!Number.isFinite(value)) return NaN;

  const bits = parseUnsignedBits(rest);
  if (bits !== undefined) {
    if (!Number.isInteger(bits) || bits <= 0 || bits > 53) {
      throw new Error("Invalid unsigned bit width");
    }
    const max = 2 ** bits - 1;
    if (value < 0 || value > max) {
      throw new Error("Unsigned integer out of range");
    }
  }

  if (rest !== "" && value < 0) {
    throw new Error("Invalid trailing characters after negative number");
  }

  return value;
}

function splitNumberAndSuffix(s: string): { numStr: string; rest: string } {
  let i = 0;
  const n = s.length;
  if (s[i] === "+" || s[i] === "-") i++;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    i++;
  }
  return { numStr: s.slice(0, i), rest: s.slice(i) };
}

function parseUnsignedBits(s: string): number | undefined {
  if (s.length < 2) return undefined;
  const first = s[0];
  if (first !== "U" && first !== "u") return undefined;
  const digits = s.slice(1);
  if (digits.length === 0) return undefined;
  for (let i = 0; i < digits.length; i++) {
    const c = digits.charCodeAt(i);
    if (c < 48 || c > 57) return undefined;
  }
  return Number(digits);
}
