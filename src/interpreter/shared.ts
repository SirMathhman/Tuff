import type { Env } from "./types";

export const BRACKET_PAIRS = new Map<string, string>([
  ["(", ")"],
  ["{", "}"],
]);

export function findMatchingParen(s: string, start: number): number {
  const open = s[start];
  const close = BRACKET_PAIRS.get(open);
  if (close === undefined) return -1;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function ensure(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

export function stripOuterParens(s: string): string {
  let out = s.trim();
  while (BRACKET_PAIRS.has(out[0])) {
    const close = findMatchingParen(out, 0);
    if (close === out.length - 1) out = out.slice(1, -1).trim();
    else break;
  }
  return out;
}

export function isDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

export function isPlusMinus(ch: string): boolean {
  return ch === "+" || ch === "-";
}

export function skipSpacesFrom(s: string, pos: number): number {
  let i = pos;
  const n = s.length;
  while (i < n && s[i] === " ") i++;
  return i;
}

export function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === sep && depth === 0) {
      parts.push(s.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

export function topLevelSplitTrim(s: string, sep: string): string[] {
  return splitTopLevel(s, sep)
    .map((r) => r.trim())
    .filter((r) => r !== "");
}

export function findTopLevel(
  s: string,
  predicate: (s: string, i: number, depth: number) => unknown | undefined
): unknown | undefined {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 0) continue;
    const res = predicate(s, i, depth);
    if (res !== undefined) return res;
  }
  return undefined;
}

export function isIdentifierStartCode(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

export function isIdentifierPartCode(c: number): boolean {
  return isIdentifierStartCode(c) || (c >= 48 && c <= 57);
}

export function isIdentifierName(s: string): boolean {
  if (s.length === 0) return false;
  const c = s.charCodeAt(0);
  if (!isIdentifierStartCode(c)) return false;
  for (let i = 1; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (!isIdentifierPartCode(cc)) return false;
  }
  return true;
}

export interface IdentifierParseResult {
  name: string;
  next: number;
}

export function parseIdentifierAt(
  s: string,
  pos: number
): IdentifierParseResult | undefined {
  let i = pos;
  const n = s.length;
  if (i >= n) return undefined;
  const c = s.charCodeAt(i);
  if (!isIdentifierStartCode(c)) return undefined;
  i++;
  while (i < n) {
    const cc = s.charCodeAt(i);
    if (!isIdentifierPartCode(cc)) break;
    i++;
  }
  return { name: s.slice(pos, i), next: i } as IdentifierParseResult;
}

export function sliceTrim(s: string, n: number): string {
  return s.slice(n).trim();
}

export function isWhitespace(ch: string | undefined): boolean {
  return ch !== undefined && " \t\n\r".includes(ch);
}

export function startsWithKeyword(s: string, kw: string): boolean {
  return s.indexOf(kw + " ") === 0 || s.indexOf(kw + "(") === 0;
}

export function startsWithIf(s: string): boolean {
  return startsWithKeyword(s, "if");
}

export function startsWithWhile(s: string): boolean {
  return startsWithKeyword(s, "while");
}

export function startsWithFor(s: string): boolean {
  return startsWithKeyword(s, "for");
}

export function ensureExists(idx: number, msg: string): void {
  if (idx === -1) throw new Error(msg);
}

export function sliceTrimRange(s: string, a: number, b: number): string {
  return s.slice(a, b).trim();
}

export function ensureCloseParen(close: number, msg: string): void {
  if (close < 0) throw new Error(msg);
}

export function ensureStartsWith(s: string, prefix: string, msg: string) {
  if (!s.startsWith(prefix)) throw new Error(msg);
}

export function ensureNonEmptyPair(a: string, b: string, msg: string) {
  if (a === "" || b === "") throw new Error(msg);
}

export function sliceAfterKeyword(s: string, n: number): string {
  return s.slice(n).trim();
}

export function ensureUniqueDeclaration(
  localDeclared: Set<string>,
  name: string
) {
  if (localDeclared.has(name)) throw new Error("Duplicate declaration");
  localDeclared.add(name);
}

export interface MutPrefixResult {
  mutable: boolean;
  rest: string;
}

export function parseMutPrefix(s: string): MutPrefixResult {
  if (s.startsWith("mut "))
    return { mutable: true, rest: sliceAfterKeyword(s, 4) } as MutPrefixResult;
  return { mutable: false, rest: s } as MutPrefixResult;
}

export function extractParenContent(stmt: string, kind: string) {
  const paren = stmt.indexOf("(");
  if (paren === -1) throw new Error(`Invalid ${kind} statement`);
  const close = findMatchingParen(stmt, paren);
  if (close < 0) throw new Error(`Unterminated ${kind} condition`);
  const content = stmt.slice(paren + 1, close);
  return { content, paren, close };
}

export function getEnvOrNew(env?: Env): Env {
  return env ?? new Map();
}
