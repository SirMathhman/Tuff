import type { Env, EnvItem, ArrayValue, StructValue } from "./types";

export const BRACKET_PAIRS = new Map<string, string>([
  ["(", ")"],
  ["{", "}"],
  ["[", "]"],
]);

export function deepCopyValue(
  value: EnvItem["value"]
): EnvItem["value"] {
  if (typeof value === "number") return value;
  
  if (typeof value === "object" && value !== null) {
    if ("type" in value && value.type === "Array") {
      const arr = value as ArrayValue;
      return {
        type: "Array",
        elementType: arr.elementType,
        elements: [...arr.elements],
        length: arr.length,
        initializedCount: arr.initializedCount,
      };
    }
    
    if ("fields" in value && "values" in value) {
      const struct = value as StructValue;
      return {
        fields: [...struct.fields],
        values: [...struct.values],
      };
    }
    
    // FunctionValue has env which is a Map; shallow copy is fine
    return value;
  }
  
  return value;
}

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

export function skipChar(s: string, pos: number, char: string): number {
  let i = pos;
  const n = s.length;
  while (i < n && s[i] === char) i++;
  return i;
}

export function skipSpacesFrom(s: string, pos: number): number {
  return skipChar(s, pos, " ");
}

const OPEN_BRACKETS = new Set(["(", "{", "["]);
const CLOSE_BRACKETS = new Set([")", "}", "]"]);

export function isOpeningBracket(ch: string): boolean {
  return OPEN_BRACKETS.has(ch);
}

export function isClosingBracket(ch: string): boolean {
  return CLOSE_BRACKETS.has(ch);
}

export function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (isOpeningBracket(ch)) depth++;
    else if (isClosingBracket(ch)) depth--;
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
    if (isOpeningBracket(ch)) {
      depth++;
      continue;
    }
    if (isClosingBracket(ch)) {
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

export function ensureIndexFound(idx: number, msg: string): number {
  if (idx === -1) throw new Error(msg);
  return idx;
}

export function ensureExists(idx: number, msg: string): void {
  ensureIndexFound(idx, msg);
}

export function ensureCloseParen(close: number, msg: string): void {
  if (close < 0) throw new Error(msg);
}

export function sliceTrimRange(s: string, a: number, b: number): string {
  return s.slice(a, b).trim();
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
  ensureUnique(name, localDeclared, "Duplicate declaration");
  localDeclared.add(name);
}

export interface MutPrefixResult {
  mutable: boolean;
  rest: string;
}

export interface FieldDefResult {
  name: string;
  type: string;
}

export function parseMutPrefix(s: string): MutPrefixResult {
  if (s.startsWith("mut "))
    return { mutable: true, rest: sliceAfterKeyword(s, 4) } as MutPrefixResult;
  return { mutable: false, rest: s } as MutPrefixResult;
}

export function ensureIdentifier(name: string, msg: string): string {
  if (!isIdentifierName(name)) throw new Error(msg);
  return name;
}

export interface Collection {
  has(item: string): boolean;
}

export function ensureUnique(
  item: string,
  collection: Collection | string[],
  msg: string
): void {
  const exists = Array.isArray(collection)
    ? collection.includes(item)
    : collection.has(item);
  if (exists) throw new Error(msg);
}

export function extractParenContent(stmt: string, kind: string) {
  const paren = ensureIndexFound(
    stmt.indexOf("("),
    `Invalid ${kind} statement`
  );
  const close = findMatchingParen(stmt, paren);
  ensureCloseParen(close, `Unterminated ${kind} condition`);
  const content = stmt.slice(paren + 1, close);
  return { content, paren, close };
}

export function getEnvOrNew(env?: Env): Env {
  return env ?? new Map();
}

export function splitTopLevelOrEmpty(s: string, delimiter: string): string[] {
  return s === "" ? [] : topLevelSplitTrim(s, delimiter);
}

export function interpretAll(
  items: string[],
  interp: (s: string, env?: Env) => number,
  env?: Env
): number[] {
  return items.map((item) => interp(item, env));
}

export function storeEnvItem(
  env: Env,
  name: string,
  value: EnvItem["value"],
  mutable: boolean,
  type?: string
) {
  env.set(name, { value, mutable, type });
}

export function parseIdentifierWithFieldAccess(
  s: string,
  start: number
): number {
  const n = s.length;
  let j = start + 1;

  function skipIdentifierPart() {
    while (j < n && isIdentifierPartCode(s.charCodeAt(j))) j++;
  }

  skipIdentifierPart();
  // handle field access with dots (e.g. point.x) or array indexing (e.g. x[0])
  while (j < n && (s[j] === "." || s[j] === "[")) {
    if (s[j] === ".") {
      j = skipChar(s, j, ".");
      skipIdentifierPart();
    } else if (s[j] === "[") {
      const close = findMatchingParen(s, j);
      if (close < 0) break;
      j = close + 1;
    }
  }
  return j;
}

export interface BracketResult {
  content: string;
  close: number;
}

export function extractBracketContent(
  s: string,
  openIdx: number
): BracketResult | undefined {
  const close = findMatchingParen(s, openIdx);
  if (close < 0) return undefined;
  return { content: s.slice(openIdx + 1, close).trim(), close };
}

export function extractPureBracketContent(
  s: string,
  openIdx: number
): string | undefined {
  const res = extractBracketContent(s, openIdx);
  if (!res || res.close !== s.length - 1) return undefined;
  return res.content;
}

export function parseFieldDef(fieldStr: string): FieldDefResult {
  const colonIdx = ensureIndexFound(
    fieldStr.indexOf(":"),
    "Invalid field definition"
  );
  const name = fieldStr.slice(0, colonIdx).trim();
  const type = fieldStr.slice(colonIdx + 1).trim();
  return { name, type };
}
