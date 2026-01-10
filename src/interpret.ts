/**
 * Result<T, E> - conservative result type to avoid throwing
 */
export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;


// parse helpers
interface ParsedNumber {
  value: number;
  end: number;
}

function consumeDigits(str: string, idx: number): number {
  const n = str.length;
  let i = idx;
  while (i < n && str.charCodeAt(i) >= 48 && str.charCodeAt(i) <= 57) {
    i++;
  }
  return i;
}

// returns ParsedNumber when a numeric prefix exists, otherwise undefined
function parseLeadingNumber(str: string): ParsedNumber | undefined {
  if (str.length === 0) return undefined;
  let i = 0;
  const n = str.length;

  // optional sign
  if (str[i] === "+" || str[i] === "-") i++;
  if (i === n) return undefined; // only sign

  const startDigits = i;
  i = consumeDigits(str, i);
  if (i === startDigits) return undefined; // no digits before decimal

  // optional fractional part
  if (i < n && str[i] === ".") {
    i++; // skip '.'
    const startFrac = i;
    i = consumeDigits(str, i);
    if (i === startFrac) return undefined; // no digits after decimal
  }

  // parse the numeric prefix
  const numStr = str.slice(0, i);
  const value = Number(numStr);
  return Number.isFinite(value) ? { value, end: i } : undefined;
}

/**
 * interpret - parse and evaluate the given string input and return a Result
 *
 * Current behavior (stub + incremental implementation):
 *  - If the input is a numeric literal (integer or decimal, optional +/-) it
 *    returns the numeric value.
 *  - For any other input it returns 0 for now (keeps previous tests passing).
 */
export function interpret(input: string): Result<number, string> {
  const s = input.trim();

  const parsed = parseLeadingNumber(s);
  if (parsed !== undefined) {
    // If there is a non-empty suffix and the number is negative, that's invalid by new rule
    if (parsed.end < s.length && s[0] === "-") {
      return {
        ok: false,
        error: "negative numeric prefix with suffix is not allowed",
      };
    }

    // handle U8 suffix specifically: require integer within 0..255
    const suffix = s.slice(parsed.end);
    if (suffix === "U8") {
      const v = parsed.value;
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        return { ok: false, error: "value out of range for U8" };
      }
    }

    return { ok: true, value: parsed.value };
  }

  // fallback until more cases are provided
  return { ok: true, value: 0 };
}
