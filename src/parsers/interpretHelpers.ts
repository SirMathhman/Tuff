import type { Err, Result } from "../helpers/result";
import { lookupBinding } from "../control/ifValidators";

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
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      // if this closing bracket is the target and we've returned to top-level, it's a match
      if (ch === target && depth === 0) return i;
      continue;
    }
    if (ch === target && depth === 0) return i;
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
    // accept unsuffixed numeric literals as long as they fit the annotation range; if a suffix is present it must match
    if (rhsSuffix && rhsSuffix !== annText)
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
    if (rhsParsed)
      return value === 0 || value === 1
        ? undefined
        : {
            ok: false,
            error: "declaration initializer does not match annotation",
          };
    if (initSuffix === "Bool") return undefined;
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  }

  return undefined;
}

export function isIdentifierName(name: string): boolean {
  if (name.length === 0) return false;
  const first = name.charCodeAt(0);
  if (
    !(
      (first >= 65 && first <= 90) ||
      (first >= 97 && first <= 122) ||
      first === 95
    )
  )
    return false;
  for (let i = 1; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (
      !(
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 95
      )
    )
      return false;
  }
  return true;
}

export function isIdentCharCode(c: number): boolean {
  return (
    (c >= 65 && c <= 90) ||
    (c >= 97 && c <= 122) ||
    (c >= 48 && c <= 57) ||
    c === 95
  );
}

interface IdentScanRes {
  name: string;
  next: number;
}
function scanIdentAt(src: string, i: number): IdentScanRes | undefined {
  let p = i;
  while (p < src.length) {
    const cc = src.charCodeAt(p);
    if (
      (cc >= 65 && cc <= 90) ||
      (cc >= 97 && cc <= 122) ||
      (cc >= 48 && cc <= 57) ||
      cc === 95
    )
      p++;
    else break;
  }
  const name = src.slice(i, p);
  return name ? { name, next: p } : undefined;
}

export function findMatchingParenIndex(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export interface BindingLike {
  value: number;
  suffix?: string;
}

export const SIZED_TYPES = new Set([
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
  "Bool",
]);

// Reserved identifiers that should not be substituted by numeric values
export const RESERVED_IDENTS = new Set([
  "if",
  "else",
  "let",
  "true",
  "false",
  "match",
  "case",
  "_",
  "break",
  "continue",
]);

export function isIdentifierOnly(stmt: string): boolean {
  const t = stmt.trim();
  if (t.length === 0) return false;
  return isIdentifierName(t);
}

interface ParseOneLiteralRes {
  next: number;
  suffix?: string;
}

function parseOneLiteralSuffix(
  annText: string,
  start: number
): ParseOneLiteralRes | undefined {
  const parsed = parseLeadingNumber(annText.slice(start));
  if (!parsed) return undefined;
  const i = start + parsed.end;
  // read suffix characters (identifier-like)
  let j = i;
  while (j < annText.length) {
    const cc = annText.charCodeAt(j);
    if (
      (cc >= 65 && cc <= 90) ||
      (cc >= 97 && cc <= 122) ||
      (cc >= 48 && cc <= 57) ||
      cc === 95
    )
      j++;
    else break;
  }
  const suffix = annText.slice(i, j);
  return { next: j, suffix: suffix || undefined };
}

export function scanExpressionSuffix(
  annText: string
): Result<string | undefined, string> {
  let i = 0;
  let firstSuffix: string | undefined;
  while (i < annText.length) {
    const ch = annText[i];
    // skip whitespace/operators/parentheses
    if (
      ch === " " ||
      ch === "+" ||
      ch === "-" ||
      ch === "*" ||
      ch === "/" ||
      ch === "(" ||
      ch === ")"
    ) {
      i++;
      continue;
    }

    const parsedRes = parseOneLiteralSuffix(annText, i);
    if (!parsedRes)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    const { next, suffix } = parsedRes;
    if (suffix) {
      if (!SIZED_TYPES.has(suffix))
        return {
          ok: false,
          error: "declaration initializer does not match annotation",
        };
      if (!firstSuffix) firstSuffix = suffix;
      else if (firstSuffix !== suffix)
        return { ok: false, error: "mixed suffixes not supported" };
    }
    i = next;
  }
  return { ok: true, value: firstSuffix };
}

export function deriveAnnotationSuffixForNoInit(
  stmt: string,
  colonPos: number
): Result<string | undefined, string> {
  if (colonPos === -1) return { ok: true, value: undefined };
  const annText = stmt.slice(colonPos + 1).trim();
  if (SIZED_TYPES.has(annText)) return { ok: true, value: annText };
  return { ok: false, error: "invalid declaration" };
}

export function handleNumericSuffixAnnotation(
  parsedNumValue: number,
  rest: string,
  initValue: number
): Result<string | undefined, string> {
  if (!isIdentifierName(rest))
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  // annotation like '2U8' must also match numeric value
  if (parsedNumValue !== initValue)
    return {
      ok: false,
      error: "declaration initializer does not match annotation",
    };
  const annSuffix = rest;
  const rangeErr = validateSizedInteger(String(initValue), annSuffix);
  if (rangeErr) return rangeErr;
  return { ok: true, value: annSuffix };
}

export function checkSimpleAnnotation(
  annText: string,
  parsedAnn: ReturnType<typeof parseLeadingNumber> | undefined,
  rhs: string,
  init: BindingLike
): Result<string | undefined, string> | undefined {
  // For simple annotations (pure numeric literal, sized type, or Bool), run the simple matcher first
  if (
    (parsedAnn && parsedAnn.end === annText.length) ||
    SIZED_TYPES.has(annText) ||
    annText === "Bool"
  ) {
    const annErr = checkAnnotationMatch(annText, rhs, init.value, init.suffix);
    if (annErr) return annErr;

    if (parsedAnn && parsedAnn.end === annText.length)
      return { ok: true, value: undefined };
    if (SIZED_TYPES.has(annText)) {
      const rangeErr = validateSizedInteger(String(init.value), annText);
      if (rangeErr) return rangeErr;
      return { ok: true, value: annText };
    }
    return { ok: true, value: undefined };
  }
  return undefined;
}

function substituteIdentsGeneric(
  src: string,
  envLocal: Map<string, BindingLike>,
  parentEnvLocal: Map<string, BindingLike> | undefined,
  onlyTopLevel: boolean
): Result<string, string> {
  const reserved = RESERVED_IDENTS;
  let out = "";
  let i = 0;
  let depth = 0;

  while (i < src.length) {
    const ch = src[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      out += ch;
      i++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      out += ch;
      i++;
      continue;
    }

    if (!onlyTopLevel || depth === 0) {
      const scanned = scanIdentAt(src, i);
      if (scanned) {
        const { name, next } = scanned;
        if (next < src.length && src[next] === "(") {
          out += name;
          i = next;
          continue;
        }
        const res = lookupAndFormatSubstIdent(
          name,
          reserved,
          envLocal,
          parentEnvLocal
        );
        if (!res.ok) return res;
        out += res.value;
        i = next;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return { ok: true, value: out };
}

function lookupAndFormatSubstIdent(
  name: string,
  reserved: Set<string>,
  envLocal: Map<string, BindingLike>,
  parentEnvLocal: Map<string, BindingLike> | undefined
): Result<string, string> {
  if (!isIdentifierName(name) || reserved.has(name))
    return { ok: true, value: name };
  const b = lookupBinding(name, envLocal, parentEnvLocal);
  if (!b.ok) return { ok: false, error: b.error };
  return {
    ok: true,
    value: String(b.value.value) + (b.value.suffix ? b.value.suffix : ""),
  };
}

export function substituteAllIdents(
  src: string,
  envLocal: Map<string, BindingLike>,
  parentEnvLocal?: Map<string, BindingLike>
): Result<string, string> {
  return substituteIdentsGeneric(src, envLocal, parentEnvLocal, false);
}

export function substituteTopLevelIdents(
  src: string,
  envLocal: Map<string, BindingLike>,
  parentEnvLocal?: Map<string, BindingLike>
): Result<string, string> {
  return substituteIdentsGeneric(src, envLocal, parentEnvLocal, true);
}
