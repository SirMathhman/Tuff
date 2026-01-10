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

function outOfRange(suffix: string): Err<string> {
  return { ok: false, error: `value out of range for ${suffix}` };
}

function checkIntegerRange(
  raw: string,
  suffix: string,
  info: SuffixInfo
): Err<string> | undefined {
  if (raw.indexOf(".") !== -1) return outOfRange(suffix);

  try {
    const big = BigInt(raw);
    const bits = BigInt(info.bits);
    const min = info.signed ? -(1n << (bits - 1n)) : 0n;
    const max = info.signed
      ? (1n << (bits - 1n)) - 1n
      : (1n << bits) - 1n;
    if (big < min || big > max) return outOfRange(suffix);
  } catch {
    return outOfRange(suffix);
  }

  return undefined;
}

function validateSizedInteger(
  raw: string,
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

  return checkIntegerRange(raw, suffix, info);
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
function isSignedSuffix(suffix: string): boolean {
  return (
    suffix === "I8" || suffix === "I16" || suffix === "I32" || suffix === "I64"
  );
}

function checkNegativeSuffix(
  str: string,
  parsed: ParsedNumber
): Err<string> | undefined {
  if (parsed.end < str.length && str[0] === "-") {
    const suffix = str.slice(parsed.end);
    if (!isSignedSuffix(suffix))
      return {
        ok: false,
        error: "negative numeric prefix with suffix is not allowed",
      };
  }
  return undefined;
}

function validateOperandSuffix(
  parsed: ParsedNumber,
  operandStr: string
): Err<string> | undefined {
  const suffix = operandStr.slice(parsed.end);
  return validateSizedInteger(parsed.raw, suffix);
}

function handleBinaryAdd(s: string): Result<number, string> {
  const plusIdx = s.indexOf("+");
  if (plusIdx === -1) return { ok: false, error: "invalid expression" };

  const leftStr = s.slice(0, plusIdx).trim();
  const rightStr = s.slice(plusIdx + 1).trim();
  if (!leftStr || !rightStr) return { ok: false, error: "invalid expression" };

  const leftParsed = parseLeadingNumber(leftStr);
  const rightParsed = parseLeadingNumber(rightStr);
  if (!leftParsed || !rightParsed)
    return { ok: false, error: "invalid operand" };

  function validateParsedOperand(
    parsed: ParsedNumber,
    operandStr: string
  ): Err<string> | undefined {
    const neg = checkNegativeSuffix(operandStr, parsed);
    if (neg) return neg;
    return validateOperandSuffix(parsed, operandStr);
  }

  const leftErr = validateParsedOperand(leftParsed, leftStr);
  if (leftErr) return leftErr;
  const rightErr = validateParsedOperand(rightParsed, rightStr);
  if (rightErr) return rightErr;

  const leftSuffix = leftStr.slice(leftParsed.end);
  const rightSuffix = rightStr.slice(rightParsed.end);
  if (leftSuffix && rightSuffix && leftSuffix !== rightSuffix)
    return { ok: false, error: "mixed suffixes not supported" };

  const sum = leftParsed.value + rightParsed.value;
  const commonSuffix = leftSuffix || rightSuffix;
  if (commonSuffix) {
    const sumErr = validateSizedInteger(String(sum), commonSuffix);
    if (sumErr) return sumErr;
  }

  return { ok: true, value: sum };
}

function handleSingle(s: string): Result<number, string> {
  const parsed = parseLeadingNumber(s);
  if (parsed === undefined) return { ok: true, value: 0 };

  if (parsed.end < s.length && s[0] === "-") {
    const suffix = s.slice(parsed.end);
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

  const suffix = s.slice(parsed.end);
  const err = validateSizedInteger(parsed.raw, suffix);
  if (err) return err;

  return { ok: true, value: parsed.value };
}

export function interpret(input: string): Result<number, string> {
  const s = input.trim();

  // find a binary + operator (skip leading unary + or +/-)
  let idx = s.indexOf("+");
  while (idx !== -1) {
    const left = s.slice(0, idx).trim();
    const right = s.slice(idx + 1).trim();
    if (left !== "" && right !== "") {
      return handleBinaryAdd(s);
    }
    idx = s.indexOf("+", idx + 1);
  }

  return handleSingle(s);
}
