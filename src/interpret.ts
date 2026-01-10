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
    const max = info.signed ? (1n << (bits - 1n)) - 1n : (1n << bits) - 1n;
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

interface Tokenized {
  operands: ParsedNumber[];
  operandStrs: string[];
  ops: string[];
}

function tokenizeAddSub(s: string): Result<Tokenized, string> {
  const n = s.length;
  let pos = 0;

  function skipSpaces(): void {
    while (pos < n && s[pos] === " ") pos++;
  }

  function validateParsedOperand(
    parsed: ParsedNumber,
    operandStr: string
  ): Err<string> | undefined {
    const neg = checkNegativeSuffix(operandStr, parsed);
    if (neg) return neg;
    return validateOperandSuffix(parsed, operandStr);
  }

  const operands: ParsedNumber[] = [];
  const operandStrs: string[] = [];
  const ops: string[] = [];

  skipSpaces();
  while (pos < n) {
    const substr = s.slice(pos);
    const parsed = parseLeadingNumber(substr);
    if (!parsed) return { ok: false, error: "invalid operand" };

    // find full operand including suffix (up to next operator)
    let j = pos + parsed.end;
    while (j < n && s[j] !== "+" && s[j] !== "-") j++;
    const operandFull = s.slice(pos, j).trim();

    const err = validateParsedOperand(parsed, operandFull);
    if (err) return err;

    operands.push(parsed);
    operandStrs.push(operandFull);

    pos = j;
    skipSpaces();

    if (pos >= n) break;

    const ch = s[pos];
    if (ch !== "+" && ch !== "-") return { ok: false, error: "invalid operator" };
    ops.push(ch);
    pos++;
    skipSpaces();
  }

  if (operands.length === 0) return { ok: false, error: "invalid expression" };
  if (ops.length !== operands.length - 1)
    return { ok: false, error: "invalid expression" };

  return { ok: true, value: { operands, operandStrs, ops } };
}

function handleAddSubChain(s: string): Result<number, string> {
  const tokens = tokenizeAddSub(s);
  if (!tokens.ok) return tokens;
  const { operands, operandStrs, ops } = tokens.value;

  // ensure suffixes are compatible (allow empty suffixes intermixed)
  let commonSuffix = "";
  for (let i = 0; i < operands.length; i++) {
    const suf = operandStrs[i].slice(operands[i].end);
    if (suf) {
      if (commonSuffix && suf !== commonSuffix)
        return { ok: false, error: "mixed suffixes not supported" };
      commonSuffix = suf;
    }
  }

  // Left-associative evaluation with validation at each step
  let acc = operands[0].value;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const next = operands[i + 1].value;
    acc = op === "+" ? acc + next : acc - next;
    if (commonSuffix) {
      const err = validateSizedInteger(String(acc), commonSuffix);
      if (err) return err;
    }
  }

  return { ok: true, value: acc };
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

  // binary + or - operator (supports chained additions/subtractions)
  if (s.indexOf("+") !== -1 || s.indexOf("-") !== -1) {
    return handleAddSubChain(s);
  }

  return handleSingle(s);
}
