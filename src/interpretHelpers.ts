import type { Err } from "./result";

export interface ParsedNumber {
  value: number;
  raw: string;
  end: number;
}

export interface SuffixInfo {
  signed: boolean;
  bits: number;
}

export function consumeDigits(str: string, idx: number): number {
  const n = str.length;
  let i = idx;
  while (i < n && str.charCodeAt(i) >= 48 && str.charCodeAt(i) <= 57) {
    i++;
  }
  return i;
}

export function outOfRange(suffix: string): Err<string> {
  return { ok: false, error: `value out of range for ${suffix}` };
}

export function checkIntegerRange(
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

export function validateSizedInteger(
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

export function parseLeadingNumber(str: string): ParsedNumber | undefined {
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

export function isSignedSuffix(suffix: string): boolean {
  return (
    suffix === "I8" || suffix === "I16" || suffix === "I32" || suffix === "I64"
  );
}

export function splitStatements(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const pos = findTopLevelChar(src, i, ";");
    if (pos === -1) {
      out.push(src.slice(i).trim());
      break;
    }
    out.push(src.slice(i, pos).trim());
    i = pos + 1;
  }
  return out.filter((s) => s !== "");
}

export function findTopLevelChar(
  src: string,
  start: number,
  target: string
): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === target && depth === 0) return i;
  }
  return -1;
}

function checkSizedAnnotationMatch(
  annText: string,
  rhs: string,
  value: number | bigint,
  initSuffix?: string
): Err<string> | undefined {
  const rhsParsed = parseLeadingNumber(rhs);
  if (rhsParsed) {
    const rhsSuffix = rhs.slice(rhsParsed.end);
    if (rhsSuffix !== annText)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    const rangeErr = validateSizedInteger(String(value), annText);
    if (rangeErr) return rangeErr;
    return undefined;
  }

  if (initSuffix) {
    if (initSuffix !== annText)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    const rangeErr = validateSizedInteger(String(value), annText);
    if (rangeErr) return rangeErr;
    return undefined;
  }

  return {
    ok: false,
    error: "declaration initializer does not match annotation",
  };
}

export function checkAnnotationMatch(
  annText: string,
  rhs: string,
  value: number | bigint,
  initSuffix?: string
): Err<string> | undefined {
  const parsed = parseLeadingNumber(annText);
  if (parsed) {
    if (value !== parsed.value)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    return undefined;
  }

  const sizedAllowed = new Set([
    "U8",
    "U16",
    "U32",
    "U64",
    "I8",
    "I16",
    "I32",
    "I64",
  ]);
  if (sizedAllowed.has(annText))
    return checkSizedAnnotationMatch(annText, rhs, value, initSuffix);

  // Bool annotation: accept true/false literals, numeric 0/1, or initializer with Bool suffix
  if (annText === "Bool") {
    const t = rhs.trim();
    if (t === "true" || t === "false") return undefined;
    const rhsParsed = parseLeadingNumber(rhs);
    if (rhsParsed) return value === 0 || value === 1 ? undefined : { ok: false, error: "declaration initializer does not match annotation" };
    if (initSuffix === "Bool") return undefined;
    return { ok: false, error: "declaration initializer does not match annotation" };
  }

  return undefined;
}
