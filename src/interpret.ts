/**
 * Minimal interpret implementation: parse a leading integer (optional sign).
 * Behavior required by tests:
 * - accept leading integer and ignore trailing text for non-negative numbers
 * - throw if a negative integer has trailing text
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === "") return NaN;

  const additionResult = tryHandleAddition(s);
  if (additionResult !== undefined) return additionResult;

  const { numStr, rest } = splitNumberAndSuffix(s);
  if (numStr === "") return NaN;

  const value = Number(numStr);
  if (!Number.isFinite(value)) return NaN;

  const suffix = parseWidthSuffix(rest);
  if (suffix !== undefined) {
    if (
      suffix.bits !== 8 &&
      suffix.bits !== 16 &&
      suffix.bits !== 32 &&
      suffix.bits !== 64
    ) {
      throw new Error("Invalid bit width");
    }

    if (suffix.bits <= 53 && suffix.bits !== 64) {
      validateWidthNumber(suffix.signed, suffix.bits, value);
    } else {
      validateWidthBig(suffix.signed, suffix.bits, numStr);
    }
  }

  if (rest !== "" && value < 0 && suffix === undefined) {
    throw new Error("Invalid trailing characters after negative number");
  }

  function validateWidthNumber(
    signed: boolean,
    bits: number,
    value: number
  ): void {
    const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
    const min = signed ? -(2 ** (bits - 1)) : 0;
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error("Integer out of range");
    }
  }

  function validateWidthBig(
    signed: boolean,
    bits: number,
    numStr: string
  ): void {
    // bits === 64
    try {
      const big = BigInt(numStr);
      const base = BigInt(1) << BigInt(bits - 1);
      const bigMax = signed
        ? base - BigInt(1)
        : (base << BigInt(1)) - BigInt(1);
      const bigMin = signed ? -base : BigInt(0);
      if (big < bigMin || big > bigMax) {
        throw new Error("Integer out of range");
      }
      if (
        big > BigInt(Number.MAX_SAFE_INTEGER) ||
        big < BigInt(Number.MIN_SAFE_INTEGER)
      ) {
        throw new Error("Value out of safe integer range");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Integer out of range") throw e;
      throw new Error("Invalid integer for specified width");
    }
  }
  return value;
}

function tryHandleAddition(s: string): number | undefined {
  const tokens = tokenizeAddSub(s);
  if (!tokens) return undefined;
  ensureConsistentSuffix(tokens);
  return evaluateTokens(tokens);
}

function isDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

function isPlusMinus(ch: string): boolean {
  return ch === "+" || ch === "-";
}

function isSuffixChar(ch: string): boolean {
  return ch === "U" || ch === "u" || ch === "I" || ch === "i";
}

function tokenizeAddSub(s: string): string[] | undefined {
  let i = 0;
  const n = s.length;
  const tokens: string[] = [];
  let expectNumber = true;

  function skipSpaces() {
    while (i < n && s[i] === " ") i++;
  }

  interface ParseResult {
    token: string;
    next: number;
  }

  function atCheck(pos: number, pred: (ch: string) => boolean): boolean {
    return pos < n && pred(s[pos]);
  }

  function parseNumberToken(pos: number): ParseResult | undefined {
    let j = pos;
    const start = j;
    if (atCheck(j, isPlusMinus)) j++;
    const digitsStart = j;
    j = consumeDigits(j);
    if (j === digitsStart) return undefined;
    if (atCheck(j, isSuffixChar)) {
      j++;
      const sufStart = j;
      j = consumeDigits(j);
      if (j === sufStart) return undefined;
    }
    return { token: s.slice(start, j).trim(), next: j };
  }

  function consumeDigits(pos: number): number {
    let k = pos;
    while (atCheck(k, isDigit)) k++;
    return k;
  }

  skipSpaces();
  while (i < n) {
    skipSpaces();
    if (expectNumber) {
      const res = parseNumberToken(i);
      if (!res) return undefined;
      tokens.push(res.token);
      i = res.next;
      expectNumber = false;
    } else {
      if (s[i] !== "+" && s[i] !== "-") return undefined;
      tokens.push(s[i]);
      i++;
      expectNumber = true;
    }
    skipSpaces();
  }
  if (expectNumber) return undefined; // dangling operator
  if (tokens.length < 3) return undefined;
  return tokens;
}

function ensureConsistentSuffix(tokens: string[]): void {
  let common: WidthSuffix | undefined;
  for (let idx = 0; idx < tokens.length; idx += 2) {
    const part = tokens[idx];
    const { rest } = splitNumberAndSuffix(part);
    const suffix = parseWidthSuffix(rest);
    if (!suffix) throw new Error("Missing or mixed width in addition");
    if (!common) common = suffix;
    else if (suffix.bits !== common.bits || suffix.signed !== common.signed)
      throw new Error("Mixed widths in addition");
  }
}

function evaluateTokens(tokens: string[]): number {
  let result = interpret(tokens[0]);
  for (let idx = 1; idx < tokens.length; idx += 2) {
    const op = tokens[idx];
    const operand = tokens[idx + 1];
    const val = interpret(operand);
    if (op === "+") result = result + val;
    else result = result - val;
  }
  return result;
}

interface NumberAndSuffix {
  numStr: string;
  rest: string;
}

interface WidthSuffix {
  signed: boolean;
  bits: number;
}

function splitNumberAndSuffix(s: string): NumberAndSuffix {
  let i = 0;
  const n = s.length;
  if (isPlusMinus(s[i])) i++;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    i++;
  }
  return { numStr: s.slice(0, i), rest: s.slice(i) };
}

function parseWidthSuffix(s: string): WidthSuffix | undefined {
  if (s.length < 2) return undefined;
  const first = s[0];
  const signed = first === "I" || first === "i";
  if (!signed && first !== "U" && first !== "u") return undefined;
  const digits = s.slice(1);
  if (digits.length === 0) return undefined;
  for (let i = 0; i < digits.length; i++) {
    const c = digits.charCodeAt(i);
    if (c < 48 || c > 57) return undefined;
  }
  const bits = Number(digits);
  if (!Number.isInteger(bits)) return undefined;
  return { signed, bits };
}
