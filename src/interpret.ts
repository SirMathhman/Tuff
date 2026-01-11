/**
 * Minimal interpret implementation: parse a leading integer (optional sign).
 * Behavior required by tests:
 * - accept leading integer and ignore trailing text for non-negative numbers
 * - throw if a negative integer has trailing text
 */
export interface EnvItem {
  value: number;
  mutable: boolean;
  type?: string;
}
export type Env = Map<string, EnvItem>;

export function interpret(input: string, env?: Env): number {
  let s = input.trim();
  if (s === "") return NaN;

  s = stripOuterParens(s);

  // block with statements e.g., "let x : I32 = 1; x"
  const topParts = splitTopLevel(s, ";");
  if (topParts.length > 1 || s.trim().startsWith("let "))
    return evalBlock(s, env);

  const additionResult = tryHandleAddition(s);
  if (additionResult !== undefined) return additionResult;

  const numOrIdent = tryParseNumberOrIdentifier(s, env);
  if (numOrIdent !== undefined) return numOrIdent;

  return NaN;
}

function isIdentifierStartCode(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

function isIdentifierPartCode(c: number): boolean {
  return isIdentifierStartCode(c) || (c >= 48 && c <= 57);
}

function isIdentifierName(s: string): boolean {
  if (s.length === 0) return false;
  const c = s.charCodeAt(0);
  if (!isIdentifierStartCode(c)) return false;
  for (let i = 1; i < s.length; i++) {
    const cc = s.charCodeAt(i);
    if (!isIdentifierPartCode(cc)) return false;
  }
  return true;
}

function parseBooleanLiteral(id: string): number | undefined {
  if (id === "true") return 1;
  if (id === "false") return 0;
  return undefined;
}

function tryParseNumberOrIdentifier(s: string, env?: Env): number | undefined {
  const { numStr, rest } = splitNumberAndSuffix(s);
  if (numStr === "") {
    const id = s.trim();
    if (isIdentifierName(id)) {
      const bool = parseBooleanLiteral(id);
      if (bool !== undefined) return bool;

      if (env && env.has(id)) return env.get(id)!.value;
      throw new Error("Unknown identifier");
    }
    return undefined;
  }

  const value = Number(numStr);
  if (!Number.isFinite(value)) return undefined;

  function handleSuffixValidation(
    rest: string,
    value: number,
    numStr: string
  ): boolean {
    const suffix = parseWidthSuffix(rest);
    if (!suffix) return false;
    if (
      suffix.bits !== 8 &&
      suffix.bits !== 16 &&
      suffix.bits !== 32 &&
      suffix.bits !== 64
    ) {
      throw new Error("Invalid bit width");
    }

    if (widthUsesNumber(suffix.bits)) {
      validateWidthNumber(suffix.signed, suffix.bits, value);
    } else {
      validateWidthBig(suffix.signed, suffix.bits, numStr);
    }
    return true;
  }

  const hasSuffix = handleSuffixValidation(rest, value, numStr);

  if (rest !== "" && value < 0 && !hasSuffix) {
    throw new Error("Invalid trailing characters after negative number");
  }

  return value;
}

function tryHandleAddition(s: string): number | undefined {
  const tokens = tokenizeAddSub(s);
  if (!tokens) return undefined;
  const suffix = ensureConsistentSuffix(tokens);
  const result = evaluateTokens(tokens);

  // validate result fits the width if operands used typed width
  if (suffix) {
    if (widthUsesNumber(suffix.bits)) {
      validateWidthNumber(suffix.signed, suffix.bits, result);
    } else {
      validateWidthBig(suffix.signed, suffix.bits, String(result));
    }
  }

  return result;
}

const BRACKET_PAIRS = new Map<string, string>([
  ["(", ")"],
  ["{", "}"],
]);

function findMatchingParen(s: string, start: number): number {
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

function stripOuterParens(s: string): string {
  let out = s.trim();
  while (BRACKET_PAIRS.has(out[0])) {
    const close = findMatchingParen(out, 0);
    if (close === out.length - 1) out = out.slice(1, -1).trim();
    else break;
  }
  return out;
}

function isDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

const SUFFIX_CHARS = new Set(["U", "u", "I", "i"]);
const OPERATOR_CHARS = new Set(["+", "-", "*", "/"]);

function isPlusMinus(ch: string): boolean {
  return ch === "+" || ch === "-";
}

function isSuffixChar(ch: string): boolean {
  return SUFFIX_CHARS.has(ch);
}

function tokenizeAddSub(s: string): string[] | undefined {
  let i = skipSpacesFrom(s, 0);
  const n = s.length;
  const tokens: string[] = [];
  let expectNumber = true;

  while (i < n) {
    i = skipSpacesFrom(s, i);
    if (expectNumber) {
      if (s[i] === "(" || s[i] === "{") {
        const close = findMatchingParen(s, i);
        if (close < 0) return undefined;
        tokens.push(s.slice(i, close + 1));
        i = close + 1;
      } else {
        const res = parseNumberTokenAt(s, i);
        if (!res) return undefined;
        tokens.push(res.token);
        i = res.next;
      }
      expectNumber = false;
    } else {
      if (!isOperator(s[i])) return undefined;
      tokens.push(s[i]);
      i++;
      expectNumber = true;
    }
    i = skipSpacesFrom(s, i);
  }
  if (expectNumber) return undefined; // dangling operator
  if (tokens.length < 3) return undefined;
  return tokens;
}

function skipSpacesFrom(s: string, pos: number): number {
  let i = pos;
  const n = s.length;
  while (i < n && s[i] === " ") i++;
  return i;
}

interface ParseResult {
  token: string;
  next: number;
}

function at(s: string, pos: number, pred: (ch: string) => boolean): boolean {
  return pos < s.length && pred(s[pos]);
}

function isOperator(ch: string): boolean {
  return OPERATOR_CHARS.has(ch);
}

function consumeDigitsFrom(s: string, pos: number): number {
  let j = pos;
  while (at(s, j, isDigit)) j++;
  return j;
}

function parseNumberTokenAt(s: string, pos: number): ParseResult | undefined {
  let j = pos;
  const start = j;
  if (at(s, j, isPlusMinus)) j++;
  const digitsStart = j;
  j = consumeDigitsFrom(s, j);
  if (j === digitsStart) return undefined;
  if (at(s, j, isSuffixChar)) {
    j++;
    const sufStart = j;
    j = consumeDigitsFrom(s, j);
    if (j === sufStart) return undefined;
  }
  return { token: s.slice(start, j).trim(), next: j };
}

function ensureConsistentSuffix(tokens: string[]): WidthSuffix | undefined {
  let common: WidthSuffix | undefined;
  let seenAnySuffix = false;
  for (let idx = 0; idx < tokens.length; idx += 2) {
    const part = tokens[idx];
    const { rest } = splitNumberAndSuffix(part);
    const suffix = parseWidthSuffix(rest);
    if (suffix) {
      seenAnySuffix = true;
      if (!common) common = suffix;
      else if (suffix.bits !== common.bits || suffix.signed !== common.signed)
        throw new Error("Mixed widths in addition");
    } else {
      if (seenAnySuffix) throw new Error("Missing or mixed width in addition");
    }
  }
  return common;
}

function evaluateTokens(tokens: string[]): number {
  // first handle * and / (higher precedence)
  const reduced: string[] = [];
  let acc = interpret(tokens[0]);
  for (let idx = 1; idx < tokens.length; idx += 2) {
    const op = tokens[idx];
    const operand = tokens[idx + 1];
    const val = interpret(operand);
    if (op === "*") {
      acc = acc * val;
    } else if (op === "/") {
      // integer division truncate toward zero
      if (val === 0) throw new Error("Division by zero");
      acc = Math.trunc(acc / val);
    } else {
      reduced.push(String(acc));
      reduced.push(op);
      acc = val;
    }
  }
  reduced.push(String(acc));

  // now do left-to-right + and -
  let result = Number(reduced[0]);
  for (let idx = 1; idx < reduced.length; idx += 2) {
    const op = reduced[idx];
    const operand = Number(reduced[idx + 1]);
    if (op === "+") result = result + operand;
    else result = result - operand;
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

function validateWidthBig(signed: boolean, bits: number, numStr: string): void {
  // bits === 64
  try {
    const big = BigInt(numStr);
    const base = BigInt(1) << BigInt(bits - 1);
    const bigMax = signed ? base - BigInt(1) : (base << BigInt(1)) - BigInt(1);
    const bigMin = signed ? -base : BigInt(0);
    if (big < bigMin || big > bigMax) throw new Error("Integer out of range");
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

function widthUsesNumber(bits: number): boolean {
  return bits <= 53 && bits !== 64;
}

function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (ch === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

interface IdentifierParseResult {
  name: string;
  next: number;
}

function parseIdentifierAt(
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
  return { name: s.slice(pos, i), next: i };
}

function sliceTrim(s: string, n: number): string {
  return s.slice(n).trim();
}

function inferTypeFromExpr(
  expr: string,
  env?: Env
): "Bool" | "Number" | undefined {
  const s = expr.trim();
  if (s === "true" || s === "false") return "Bool";
  // identifier
  if (isIdentifierName(s)) {
    if (env && env.has(s))
      return env.get(s)!.type as "Bool" | "Number" | undefined;
    return undefined;
  }
  // numeric literal start
  const { numStr } = splitNumberAndSuffix(s);
  if (numStr !== "") return "Number";
  // parenthesized or binary expression assume Number
  if (s[0] === "(" || s[0] === "{") return "Number";
  if (containsOperator(s)) return "Number";
  return undefined;
}

interface AnnotationResult {
  annotatedType?: string;
  initializer: string;
}

function extractAnnotationAndInitializer(str: string): AnnotationResult {
  let s = str.trim();
  let annotatedType: string | undefined = undefined;
  if (s.startsWith(":")) {
    const eq = s.indexOf("=");
    if (eq === -1) return { annotatedType: s.slice(1).trim(), initializer: "" };
    annotatedType = s.slice(1, eq).trim();
    s = sliceTrim(s, eq + 1);
  }
  if (s.startsWith("=")) s = sliceTrim(s, 1);
  return { annotatedType, initializer: s };
}

function isIntegerTypeName(typeName: string): boolean {
  const first = typeName[0];
  return first === "I" || first === "i" || first === "U" || first === "u";
}

function containsOperator(s: string): boolean {
  return s.includes("+") || s.includes("-") || s.includes("*") || s.includes("/");
}

function validateAnnotatedTypeCompatibility(
  annotatedType: string,
  initType: string | undefined
) {
  if (isIntegerTypeName(annotatedType)) {
    if (initType === "Bool")
      throw new Error("Type mismatch: cannot assign Bool to integer type");
  }
  if (annotatedType === "Bool") {
    if (initType !== "Bool")
      throw new Error("Type mismatch: cannot assign non-Bool to Bool");
  }
}

function startsWithIf(s: string): boolean {
  return s.indexOf("if ") === 0 || s.indexOf("if(") === 0;
}
function handleLetStatement(
  stmt: string,
  env: Env,
  localDeclared: Set<string>
): number {
  let rest = sliceTrim(stmt, 4);
  // optional `mut` modifier
  let mutable = false;
  if (rest.startsWith("mut ")) {
    mutable = true;
    rest = sliceTrim(rest, 4);
  }
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid let declaration");
  const name = nameRes.name;
  if (localDeclared.has(name)) throw new Error("Duplicate declaration");
  localDeclared.add(name);

  const rest2 = sliceTrim(rest, nameRes.next);
  const { annotatedType, initializer } = extractAnnotationAndInitializer(rest2);
  if (initializer !== "") {
    const initType = inferTypeFromExpr(initializer, env);
    const val = interpret(initializer, env);

    if (annotatedType)
      validateAnnotatedTypeCompatibility(annotatedType, initType);

    const item = {
      value: val,
      mutable,
      type: annotatedType || initType,
    } as EnvItem;
    env.set(name, item);
    return val;
  }

  // an uninitialized declaration (no initializer):
  // - if it has a type annotation and no `mut`, it is write-once (not mutable)
  // - if it has `mut`, it is mutable
  // - if it has no annotation, it is mutable
  const item = {
    value: NaN,
    mutable: annotatedType ? mutable : true,
    type: annotatedType,
  } as EnvItem;
  env.set(name, item);
  return NaN;
}

function tryHandleAssignmentStatement(
  stmt: string,
  env: Env
): number | undefined {
  const idRes = parseIdentifierAt(stmt, 0);
  if (!idRes) return undefined;
  let restAssign = sliceTrim(stmt, idRes.next);
  if (!restAssign.startsWith("=")) return undefined;
  restAssign = sliceTrim(restAssign, 1);
  if (restAssign === "") throw new Error("Invalid assignment");
  if (!env.has(idRes.name)) throw new Error("Unknown identifier");
  const cur = env.get(idRes.name)!;
  // allow assignment if variable is mutable OR if it is uninitialized
  if (!cur.mutable && !Number.isNaN(cur.value))
    throw new Error("Cannot assign to immutable variable");

  const rhsType = inferTypeFromExpr(restAssign, env);
  if (cur.type) {
    if (isIntegerTypeName(cur.type)) {
      if (rhsType === "Bool")
        throw new Error("Type mismatch: cannot assign Bool to integer type");
    }
    if (cur.type === "Bool") {
      if (rhsType !== "Bool")
        throw new Error("Type mismatch: cannot assign non-Bool to Bool");
    }
  }

  const val = interpret(restAssign, env);
  cur.value = val;
  env.set(idRes.name, cur);
  return val;
}



interface IfResult { consumed: number; last: number }

function handleIfAt(idx: number, stmts: string[], env: Env): IfResult {
  const stmt = stmts[idx];
  const paren = stmt.indexOf("(");
  if (paren === -1) throw new Error("Invalid if statement");
  const close = findMatchingParen(stmt, paren);
  if (close < 0) throw new Error("Unterminated if condition");
  const condStr = stmt.slice(paren + 1, close);
  let thenPart = stmt.slice(close + 1).trim();

  let consumed = 0;
  // if thenPart is empty, maybe the next top-level stmt is the then-part
  if (thenPart === "" && idx + 1 < stmts.length && !stmts[idx + 1].trim().startsWith("else")) {
    consumed = 1;
    thenPart = stmts[idx + 1];
  }

  // check for else in the following stmt (either same stmt or next)
  let elsePart: string | undefined;
  if (thenPart.startsWith("else")) {
    // no then part was present, else is attached directly
    elsePart = thenPart.slice(4).trim();
    thenPart = "";
  } else if (idx + 1 + consumed < stmts.length && stmts[idx + 1 + consumed].trim().startsWith("else")) {
    consumed += 1;
    elsePart = stmts[idx + consumed].trim().slice(4).trim();
  }

  const condVal = interpret(condStr, env);
  let lastLocal = NaN;
  const part = condVal !== 0 ? thenPart : elsePart;
  if (part !== undefined && part !== "") lastLocal = evalBlock(part, env);
  return { consumed, last: lastLocal };
}

function evalBlock(s: string, envIn?: Env): number {
  const env = envIn ?? new Map<string, EnvItem>();
  const rawStmts = splitTopLevel(s, ";");

  // collect trimmed non-empty statements
  const stmts = rawStmts.map((r) => r.trim()).filter((r) => r !== "");
  if (stmts.length === 0) return NaN;

  // If the final non-empty statement is a declaration, the block does not
  // produce a value and should be treated as an error when used in an
  // expression context.
  const lastStmt = stmts[stmts.length - 1];
  if (lastStmt.startsWith("let ")) {
    throw new Error("Block does not produce a value");
  }

  let last = NaN;
  const localDeclared = new Set<string>();
  for (let idx = 0; idx < stmts.length; idx++) {
    const stmt = stmts[idx];

    if (startsWithIf(stmt)) {
      const res = handleIfAt(idx, stmts, env);
      last = res.last;
      idx += res.consumed;
      continue;
    }

    if (stmt.startsWith("let ")) {
      last = handleLetStatement(stmt, env, localDeclared);
    } else {
      const assigned = tryHandleAssignmentStatement(stmt, env);
      if (assigned !== undefined) {
        last = assigned;
        continue;
      }
      last = interpret(stmt, env);
    }
  }
  return last;
}
