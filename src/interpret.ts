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
  raw: string;
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

// validate sized integer suffixes like U8, I16 etc.
interface SuffixInfo {
  signed: boolean;
  bits: number;
}

function validateSizedInteger(
  raw: string,
  value: number,
  suffix: string
): Err<string> | undefined {
  if (!suffix) return undefined;
  const allowed = new Map<string, SuffixInfo>([
    ["U8", { signed: false, bits: 8 }],
    ["U16", { signed: false, bits: 16 }],
    ["U32", { signed: false, bits: 32 }],
    ["U64", { signed: false, bits: 64 }],
    ["I8", { signed: true, bits: 8 }],
    ["I16", { signed: true, bits: 16 }],
    ["I32", { signed: true, bits: 32 }],
    ["I64", { signed: true, bits: 64 }],
  ]);

  const info = allowed.get(suffix);
  if (!info) return undefined;

  // require integer for sized types
  if (raw.indexOf(".") !== -1) {
    return { ok: false, error: `value out of range for ${suffix}` };
  }

  try {
    const big = BigInt(raw);
    const bits = BigInt(info.bits);
    if (info.signed) {
      const min = -(1n << (bits - 1n));
      const max = (1n << (bits - 1n)) - 1n;
      if (big < min || big > max)
        return { ok: false, error: `value out of range for ${suffix}` };
    } else {
      const min = 0n;
      const max = (1n << bits) - 1n;
      if (big < min || big > max)
        return { ok: false, error: `value out of range for ${suffix}` };
    }
  } catch (e) {
    // BigInt parse failure (e.g., too large or fractional)
    return { ok: false, error: `value out of range for ${suffix}` };
  }

  return undefined;
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
  return Number.isFinite(value) ? { value, raw: numStr, end: i } : undefined;
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
      // unsigned suffixes will be validated below; negative with arbitrary suffix still invalid
      const suffix = s.slice(parsed.end);
      // allow negative for signed suffixes (I8/I16/I32/I64)
      if (
        !(
          suffix === "I8" ||
          suffix === "I16" ||
          suffix === "I32" ||
          suffix === "I64"
        )
      ) {
        return {
          ok: false,
          error: "negative numeric prefix with suffix is not allowed",
        };
      }
    }

    // validate known sized integer suffixes
    const suffix = s.slice(parsed.end);
    const err = validateSizedInteger(parsed.raw, parsed.value, suffix);
    if (err) return err;

    return { ok: true, value: parsed.value };
  }

  // fallback until more cases are provided
  return { ok: true, value: 0 };
}
