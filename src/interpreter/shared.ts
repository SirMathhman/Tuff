/* eslint-disable max-lines */

import type {
  Env,
  EnvItem,
  ArrayValue,
  StructValue,
  SliceValue,
} from "./types";
import { splitNumberAndSuffix } from "./numbers";
import {
  parseAddressOfType,
  parseFnSignature,
  parseArrowSignature,
} from "./typeParsers";

export const BRACKET_PAIRS = new Map<string, string>([
  ["(", ")"],
  ["{", "}"],
  ["[", "]"],
]);

export function deepCopyValue(value: EnvItem["value"]): EnvItem["value"] {
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

    // SliceValue references a backing ArrayValue; shallow copy the slice object
    if (hasTypeTag(value, "Slice")) {
      const sv = value as SliceValue;
      return {
        type: "Slice",
        elementType: sv.elementType,
        backing: sv.backing,
        start: sv.start,
        length: sv.length,
      };
    }

    // FunctionValue has env which is a Map; shallow copy is fine
    return value;
  }

  return value;
}

export function isObjectWithKey(o: unknown, key: string): boolean {
  return typeof o === "object" && o !== null && key in (o as object);
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
  // Only strip outer parentheses '()' or braces '{}' here. Do NOT strip
  // square brackets '[]' since they denote array literals.
  while (out[0] === "(" || out[0] === "{") {
    const close = findMatchingParen(out, 0);
    if (close === out.length - 1) out = out.slice(1, -1).trim();
    else break;
  }
  return out;
}

export function removeWhitespace(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!isWhitespace(ch)) out += ch;
  }
  return out;
}

// Type alias support: maintain a per-env map of type aliases so aliases can
// be scoped to blocks. Use a WeakMap keyed by Env so we don't leak memory.
const envTypeAliasMap: WeakMap<Env, Map<string, string>> = new WeakMap();

// Linear type support: map linear type name -> destructor function name.
// This is also block-scoped, so it is keyed by Env.
const envLinearDestructorMap: WeakMap<Env, Map<string, string>> = new WeakMap();

// Borrow tracking (minimal borrow checker): track borrows per binding (EnvItem)
// so that borrowing works even when block scopes clone the Env Map but share
// EnvItem objects for existing bindings.
interface BorrowCounts {
  immut: number;
  mut: number;
}

const envItemBorrowCounts: WeakMap<EnvItem, BorrowCounts> = new WeakMap();

function getBorrowCounts(item: EnvItem): BorrowCounts {
  const existing = envItemBorrowCounts.get(item);
  if (existing) return existing;
  const fresh: BorrowCounts = { immut: 0, mut: 0 };
  envItemBorrowCounts.set(item, fresh);
  return fresh;
}

function hasAnyActiveBorrow(counts: BorrowCounts): boolean {
  return counts.immut > 0 || counts.mut > 0;
}

function assertNoActiveBorrows(counts: BorrowCounts, msg: string): void {
  if (hasAnyActiveBorrow(counts)) throw new Error(msg);
}

export function registerBorrow(env: Env, name: string, mutable: boolean): void {
  ensureExistsInEnv(name, env);
  const item = env.get(name)!;
  if (item.type === "__deleted__") throw new Error("Unknown identifier");
  if (item.moved) throw new Error("Use-after-move");

  const counts = getBorrowCounts(item);
  if (mutable) {
    assertNoActiveBorrows(
      counts,
      "Cannot take mutable reference while borrow(s) exist"
    );
    counts.mut = 1;
  } else {
    if (counts.mut > 0)
      throw new Error(
        "Cannot take immutable reference while mutable borrow exists"
      );
    counts.immut += 1;
  }
}

export function releaseBorrow(env: Env, name: string, mutable: boolean): void {
  // Best-effort: if the binding is gone, there's nothing to release.
  if (!env.has(name)) return;
  const item = env.get(name)!;
  if (item.type === "__deleted__") return;

  const counts = getBorrowCounts(item);
  if (mutable) {
    counts.mut = 0;
  } else {
    counts.immut = Math.max(0, counts.immut - 1);
  }
}

export function assertCanMoveBinding(env: Env, name: string): void {
  ensureExistsInEnv(name, env);
  const item = env.get(name)!;
  const counts = getBorrowCounts(item);
  assertNoActiveBorrows(counts, "Cannot move while borrowed");
}

export function assertCanAssignBinding(env: Env, name: string): void {
  ensureExistsInEnv(name, env);
  const item = env.get(name)!;
  const counts = getBorrowCounts(item);
  assertNoActiveBorrows(counts, "Cannot assign while borrowed");
}

export function getTypeAliasMap(env: Env): Map<string, string> {
  if (!envTypeAliasMap.has(env)) envTypeAliasMap.set(env, new Map());
  return envTypeAliasMap.get(env)!;
}

export function setTypeAlias(env: Env, name: string, target: string): void {
  getTypeAliasMap(env).set(name, target);
}

export function setLinearDestructor(
  env: Env,
  typeName: string,
  destructorName: string
): void {
  if (!envLinearDestructorMap.has(env))
    envLinearDestructorMap.set(env, new Map());
  envLinearDestructorMap.get(env)!.set(typeName, destructorName);
}

export function getLinearDestructor(
  typeName: string | undefined,
  env?: Env
): string | undefined {
  if (!typeName || !env) return undefined;
  const map = envLinearDestructorMap.get(env);
  if (map && map.has(typeName)) return map.get(typeName);

  // allow aliases to point to linear types and vice-versa
  const aliasMap = envTypeAliasMap.get(env);
  const next = aliasMap?.get(typeName);
  if (!next) return undefined;
  if (next === typeName) return undefined;
  return getLinearDestructor(next, env);
}

export function cloneTypeAliasMap(fromEnv: Env | undefined, toEnv: Env): void {
  const src = fromEnv ? envTypeAliasMap.get(fromEnv) : undefined;
  const dest = new Map<string, string>(src ? Array.from(src.entries()) : []);
  envTypeAliasMap.set(toEnv, dest);

  const lsrc = fromEnv ? envLinearDestructorMap.get(fromEnv) : undefined;
  const ldest = new Map<string, string>(lsrc ? Array.from(lsrc.entries()) : []);
  envLinearDestructorMap.set(toEnv, ldest);
}

function isConcreteTypeName(t: string): boolean {
  if (t === "Bool") return true;
  if (t.startsWith("[")) return true;
  if (t.startsWith("*")) return true;
  if (t.startsWith("(")) return true;
  return isIntegerTypeName(t);
}

export function resolveTypeAlias(typeStr: string, env?: Env): string {
  if (!env) return typeStr;
  const map = envTypeAliasMap.get(env);
  if (!map) return typeStr;

  function resolveRecursive(t: string, depth = 0): string {
    if (depth > 20) return t; // prevent cycles
    t = t.trim();
    if (t.startsWith("*"))
      return `*${resolveRecursive(t.slice(1).trim(), depth + 1)}`;
    if (t.startsWith("[")) {
      // array type: [Elem; Init; Len]
      const inner = t.slice(1, -1);
      const parts = topLevelSplitTrim(inner, ";");
      if (parts.length === 3) {
        const elem = resolveRecursive(parts[0].trim(), depth + 1);
        return `[${elem}; ${parts[1]}; ${parts[2]}]`;
      }
      return t;
    }
    if (t.startsWith("(")) {
      // function signature: (T, T) => R  (allow variants like '() => R' or ')=>R')
      const closeIdx = t.indexOf(")");
      if (closeIdx === -1) return t;
      const after = t.slice(closeIdx + 1);
      const arrowPos = after.indexOf("=>");
      if (arrowPos === -1) return t;
      const paramsContent = t.slice(1, closeIdx).trim();
      const params =
        paramsContent === "" ? [] : topLevelSplitTrim(paramsContent, ",");
      const resolvedParams = params.map((p) =>
        resolveRecursive(p.trim(), depth + 1)
      );
      const ret = after.slice(arrowPos + 2).trim();
      const resolvedRet = resolveRecursive(ret, depth + 1);
      return `(${resolvedParams.join(", ")}) => ${resolvedRet}`;
    }

    // plain identifier: try to resolve alias chain
    let cur = t;
    if (!map) return cur;
    while (map.has(cur)) {
      const mapped = map.get(cur);
      if (!mapped) break;
      cur = mapped;
      if (isConcreteTypeName(cur)) break;
    }
    return cur;
  }

  return resolveRecursive(typeStr);
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

export function startsWithGroup(s: string): boolean {
  return s[0] === "(" || s[0] === "{";
}

export function containsOperator(s: string): boolean {
  return (
    s.includes("+") || s.includes("-") || s.includes("*") || s.includes("/")
  );
}

export interface TwoCharOp {
  op: string;
  idx: number;
}

export function findTopLevelTwoCharOp(
  s: string,
  tokens: string[]
): TwoCharOp | undefined {
  let depth = 0;
  for (let i = 0; i < s.length - 1; i++) {
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
    const two = s.slice(i, i + 2);
    if (tokens.includes(two)) return { op: two, idx: i } as TwoCharOp;
  }
  return undefined;
}

export function inferTypeFromExpr(expr: string, env?: Env): string | undefined {
  const s = expr.trim();
  if (s === "true" || s === "false") return "Bool";
  const addrType = parseAddressOfType(s, env);
  if (addrType) return addrType;

  // function expression -> produce a signature string like '(I32, I32) => I32'
  if (s.startsWith("fn")) return parseFnSignature(s);

  // arrow-function expression types e.g., (I32, I32) => I32
  if (s.startsWith("(")) {
    const sig = parseArrowSignature(s);
    if (sig) return sig;
  }

  // identifier
  if (isIdentifierName(s)) {
    if (env && env.has(s)) return env.get(s)!.type;
    return undefined;
  }
  // numeric literal start or grouping/operators
  const numOrGroup = parseNumericOrGroupType(s);
  if (numOrGroup) return numOrGroup;
  return undefined;
}

function parseNumericOrGroupType(s: string): string | undefined {
  const { numStr } = splitNumberAndSuffix(s);
  if (numStr !== "") return "Number";
  // parenthesized or binary expression assume Number
  if (startsWithGroup(s)) return "Number";
  if (containsOperator(s)) return "Number";
  return undefined;
}

export function parseBoolType(s: string): string | undefined {
  const str = s.trim();
  if (str === "true" || str === "false") return "Bool";
  return undefined;
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

export function ensureExistsInEnv(name: string, env?: Env) {
  if (!env || !env.has(name)) throw new Error("Unknown identifier");
}
export function isIdentifierStartCode(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

export function isIntegerTypeName(typeName: string): boolean {
  if (!typeName || typeName.length < 2) return false;
  const first = typeName[0];
  if (!"IiUu".includes(first)) return false;
  const rest = typeName.slice(1);
  // require remaining characters to be digits (e.g., I32, U16)
  for (let i = 0; i < rest.length; i++) {
    const cc = rest.charCodeAt(i);
    if (cc < 48 || cc > 57) return false;
  }
  return true;
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

export function findTopLevelAssignmentIndex(s: string): number {
  let depth = 0;
  let lastEq = -1;
  for (let i = 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      continue;
    }
    if (depth === 0 && ch === "=") {
      // skip '=' that are part of '=>' arrows (next non-space char is '>')
      let j = i + 1;
      while (j < s.length && " \t\n\r".includes(s[j])) j++;
      if (j < s.length && s[j] === ">") continue;
      lastEq = i;
    }
  }
  return lastEq;
}

export function getEnvOrNew(env?: Env): Env {
  return env ?? new Map();
}

export function splitTopLevelOrEmpty(s: string, delimiter: string): string[] {
  return s === "" ? [] : topLevelSplitTrim(s, delimiter);
}

export function interpretAll(
  items: string[],
  interp: (s: string, env?: Env) => unknown,
  env?: Env
): number[] {
  return items.map((item) => {
    const v = interp(item, env);
    if (typeof v !== "number") throw new Error("Expected numeric expression");
    return v as number;
  });
}

export function interpretAllAny(
  items: string[],
  interp: (s: string, env?: Env) => unknown,
  env?: Env
): unknown[] {
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

export interface MethodCallParse {
  left: string;
  method: string;
  args: string[];
}

export function parseMethodCall(s: string): MethodCallParse | undefined {
  let depth = 0;
  let lastDot = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "." && depth === 0) lastDot = i;
  }
  if (lastDot === -1) return undefined;

  const left = s.slice(0, lastDot).trim();
  const right = s.slice(lastDot + 1).trim();

  const idRes = parseIdentifierAt(right, 0);
  if (!idRes) return undefined;
  const methodName = idRes.name;

  const rest = sliceTrim(right, idRes.next);
  if (!rest.startsWith("(")) return undefined;
  const close = findMatchingParen(rest, 0);
  if (close < 0) return undefined;
  const argsContent = rest.slice(1, close).trim();
  const args = splitTopLevelOrEmpty(argsContent, ",");
  const trailing = rest.slice(close + 1).trim();
  if (trailing !== "") return undefined;
  return { left, method: methodName, args };
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

interface HasType {
  type?: string;
}

export function hasTypeTag(v: unknown, tag: string): boolean {
  return typeof v === "object" && v !== null && (v as HasType).type === tag;
}
