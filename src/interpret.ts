/**
 * Minimal interpret implementation: parse a leading integer (optional sign).
 * Behavior required by tests:
 * - accept leading integer and ignore trailing text for non-negative numbers
 * - throw if a negative integer has trailing text
 */
interface FunctionValue {
  params: string[];
  body: string;
  env: Env; // closure capture
}

export interface EnvItem {
  value: number | FunctionValue;
  mutable: boolean;
  type?: string;
}
export type Env = Map<string, EnvItem>;

// track transient shadowed names per-env so constructs like for-loops can
// prevent loop-scoped names from being visible after the loop
const blockShadow: WeakMap<Env, Set<string>> = new WeakMap();

export function interpret(input: string, env?: Env): number {
  let s = input.trim();
  if (s === "") return NaN;

  s = stripOuterParens(s);

  // block with statements e.g., "let x : I32 = 1; x"
  const topParts = splitTopLevel(s, ";");
  if (topParts.length > 1 || s.trim().startsWith("let "))
    return evalBlock(s, env);

  const ifResult = tryHandleIfExpression(s, env);
  if (ifResult !== undefined) return ifResult;

  const matchResult = tryHandleMatchExpression(s, env);
  if (matchResult !== undefined) return matchResult;

  const fnExprResult = tryHandleFnExpression(s, env);
  if (fnExprResult !== undefined) return fnExprResult;

  const callResult = tryHandleCall(s, env);
  if (callResult !== undefined) return callResult;

  const comparisonResult = tryHandleComparison(s, env);
  if (comparisonResult !== undefined) return comparisonResult;

  const additionResult = tryHandleAddition(s, env);
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

      if (env) {
        const shadow = blockShadow.get(env);
        if (shadow && shadow.has(id)) throw new Error("Unknown identifier");
      }

      if (env && env.has(id)) {
        const item = env.get(id)!;
        if (item.type === "__deleted__") throw new Error("Unknown identifier");
        if (typeof item.value === "number") return item.value;
        throw new Error("Unknown identifier");
      }
      throw new Error("Unknown identifier");
    }
    return undefined;
  }

  const value = Number(numStr);
  if (!Number.isFinite(value)) return undefined;

  const hasSuffix = validateNumberSuffix(rest, value, numStr);

  if (rest !== "" && value < 0 && !hasSuffix) {
    throw new Error("Invalid trailing characters after negative number");
  }

  return value;
}

function validateNumberSuffix(
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

function evalComparisonOp(
  left: string,
  right: string,
  op: string,
  env?: Env
): number | undefined {
  if (left === "" || right === "") return undefined;
  const lv = interpret(left, env);
  const rv = interpret(right, env);
  switch (op) {
    case "<=":
      return lv <= rv ? 1 : 0;
    case ">=":
      return lv >= rv ? 1 : 0;
    case "==":
      return lv === rv ? 1 : 0;
    case "!=":
      return lv !== rv ? 1 : 0;
    case "<":
      return lv < rv ? 1 : 0;
    case ">":
      return lv > rv ? 1 : 0;
    default:
      return undefined;
  }
}

interface TopLevelComparison {
  op: string;
  idx: number;
}

function findTopLevel(
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

function findTopLevelComparison(s: string): TopLevelComparison | undefined {
  const twoCharOps = ["<=", ">=", "==", "!="];
  const res = findTopLevel(s, (str, i) => {
    const two = str.slice(i, i + 2);
    if (twoCharOps.includes(two))
      return { op: two, idx: i } as TopLevelComparison;
    const ch = str[i];
    if (ch === "<" || ch === ">")
      return { op: ch, idx: i } as TopLevelComparison;
    return undefined;
  });
  return res as TopLevelComparison | undefined;
}

function tryHandleMatchExpression(s: string, env?: Env): number | undefined {
  const ss = s.trim();
  if (!startsWithKeyword(ss, "match")) return undefined;

  // parse 'match (scrutinee) { case p => expr; case _ => expr; }'
  const paren = ss.indexOf("(");
  ensure(paren !== -1, "Invalid match expression");
  const close = findMatchingParen(ss, paren);
  ensure(close >= 0, "Unterminated match condition");
  const scrutineeStr = ss.slice(paren + 1, close).trim();

  // find brace block after condition
  const rest = ss.slice(close + 1).trim();
  ensure(rest.startsWith("{"), "Invalid match expression body");
  const braceClose = findMatchingParen(rest, 0);
  ensure(braceClose >= 0, "Unterminated match body");
  const body = rest.slice(1, braceClose).trim();

  const armsRaw = topLevelSplitTrim(body, ";");
  ensure(armsRaw.length !== 0, "Match has no arms");

  interface MatchArm {
    pattern: string;
    expr: string;
  }
  const arms: MatchArm[] = armsRaw.map((arm) => {
    ensure(arm.startsWith("case "), "Invalid match arm");
    const after = sliceTrim(arm, 4);
    const arrowIdx = after.indexOf("=>");
    ensure(arrowIdx !== -1, "Invalid match arm");
    const pattern = after.slice(0, arrowIdx).trim();
    const expr = after.slice(arrowIdx + 2).trim();
    return { pattern, expr } as MatchArm;
  });

  const scrVal = interpret(scrutineeStr, env);
  for (const a of arms) {
    if (a.pattern === "_") return interpret(a.expr, env);
    const patVal = interpret(a.pattern, env);
    if (scrVal === patVal) return interpret(a.expr, env);
  }

  throw new Error("No match arm matched");
}

function tryHandleComparison(s: string, env?: Env): number | undefined {
  const found = findTopLevelComparison(s);
  if (!found) return undefined;
  const { op, idx } = found;
  const rightStart = idx + (op.length === 2 ? 2 : 1);
  return evalComparisonOp(
    s.slice(0, idx).trim(),
    s.slice(rightStart).trim(),
    op,
    env
  );
}

function tryHandleAddition(s: string, env?: Env): number | undefined {
  const tokens = tokenizeAddSub(s);
  if (!tokens) return undefined;
  const suffix = ensureConsistentSuffix(tokens);
  const result = evaluateTokens(tokens, env);

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

function ensure(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
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
        tokens.push(s.slice(i, close + 1).trim());
        i = close + 1;
      } else if (isIdentifierStartCode(s.charCodeAt(i))) {
        // parse identifier tokens as operands
        let j = i + 1;
        while (j < n && isIdentifierPartCode(s.charCodeAt(j))) j++;
        tokens.push(s.slice(i, j).trim());
        i = j;
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

function evaluateTokens(tokens: string[], env?: Env): number {
  // first handle * and / (higher precedence)
  const reduced: string[] = [];
  let acc = interpret(tokens[0], env);
  for (let idx = 1; idx < tokens.length; idx += 2) {
    const op = tokens[idx];
    const operand = tokens[idx + 1];
    const val = interpret(operand, env);
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
      parts.push(s.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function topLevelSplitTrim(s: string, sep: string): string[] {
  return splitTopLevel(s, sep)
    .map((r) => r.trim())
    .filter((r) => r !== "");
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
  if (startsWithGroup(s)) return "Number";
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
    annotatedType = s.substring(1, eq).trim();
    s = s.substring(eq + 1).trim();
  }
  if (s.startsWith("=")) s = sliceTrim(s, 1);
  return { annotatedType, initializer: s };
}

function isIntegerTypeName(typeName: string): boolean {
  const first = typeName[0];
  return "IiUu".includes(first);
}

function containsOperator(s: string): boolean {
  return (
    s.includes("+") || s.includes("-") || s.includes("*") || s.includes("/")
  );
}

function startsWithGroup(s: string): boolean {
  return s[0] === "(" || s[0] === "{";
}

function validateTypeCompatibility(
  annotatedType: string | undefined,
  otherType: string | undefined
) {
  if (!annotatedType) return;
  if (isIntegerTypeName(annotatedType)) {
    if (otherType === "Bool")
      throw new Error("Type mismatch: cannot assign Bool to integer type");
    return;
  }
  if (annotatedType === "Bool") {
    if (otherType !== "Bool")
      throw new Error("Type mismatch: cannot assign non-Bool to Bool");
  }
}

function validateAnnotatedTypeCompatibility(
  annotatedType: string,
  initType: string | undefined
) {
  validateTypeCompatibility(annotatedType, initType);
}

function isWhitespace(ch: string | undefined): boolean {
  return ch !== undefined && " \t\n\r".includes(ch);
}

function startsWithKeyword(s: string, kw: string): boolean {
  return s.indexOf(kw + " ") === 0 || s.indexOf(kw + "(") === 0;
}

function startsWithIf(s: string): boolean {
  return startsWithKeyword(s, "if");
}

function startsWithWhile(s: string): boolean {
  return startsWithKeyword(s, "while");
}

function startsWithFor(s: string): boolean {
  return startsWithKeyword(s, "for");
}

function ensureExists(idx: number, msg: string): void {
  if (idx === -1) throw new Error(msg);
}

function sliceTrimRange(s: string, a: number, b: number): string {
  return s.slice(a, b).trim();
}
function ensureCloseParen(close: number, msg: string): void {
  if (close < 0) throw new Error(msg);
}

interface IfParts {
  cond: string;
  thenPart: string;
  elsePart: string;
}

function parseIfParts(s: string): IfParts {
  const paren = s.indexOf("(");
  ensureExists(paren, "Invalid if expression");
  const close = findMatchingParen(s, paren);
  ensureCloseParen(close, "Unterminated if condition");
  const cond = sliceTrimRange(s, paren + 1, close);

  // find top-level 'else'
  let depth = 0;
  let elseIdx = -1;
  for (let i = close + 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") depth--;
    else if (depth === 0 && s.startsWith("else", i)) {
      const after = s[i + 4];
      if (
        after === undefined ||
        isWhitespace(after) ||
        after === "(" ||
        after === "{"
      ) {
        elseIdx = i;
        break;
      }
    }
  }
  ensureExists(elseIdx, "If expression missing else branch");
  const thenPart = sliceTrimRange(s, close + 1, elseIdx);
  const elsePart = s.slice(elseIdx + 4).trim();
  return { cond, thenPart, elsePart };
}

function tryHandleIfExpression(s: string, env?: Env): number | undefined {
  const ss = s.trim();
  if (!startsWithIf(ss)) return undefined;
  const { cond, thenPart, elsePart } = parseIfParts(ss);
  ensureNonEmptyPair(thenPart, elsePart, "Invalid if expression branches");
  const condVal = interpret(cond, env);
  if (condVal !== 0) return interpret(thenPart, env);
  return interpret(elsePart, env);
}
function handleLetStatement(
  stmt: string,
  env: Env,
  localDeclared: Set<string>
): number {
  let rest = sliceTrim(stmt, 4);
  // optional `mut` modifier
  const mutRes = parseMutPrefix(rest);
  const mutable = mutRes.mutable;
  rest = mutRes.rest;
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid let declaration");
  const name = nameRes.name;
  ensureUniqueDeclaration(localDeclared, name);

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

function ensureIdentifierExists(name: string, env: Env) {
  if (!env.has(name)) throw new Error("Unknown identifier");
}

function computeCompoundResult(
  op: string,
  left: number,
  right: number
): number {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) throw new Error("Division by zero");
      return Math.trunc(left / right);
    default:
      throw new Error("Unsupported compound assignment");
  }
}

function tryHandleCompoundAssignment(
  stmt: string,
  env: Env
): number | undefined {
  const idRes = parseIdentifierAt(stmt, 0);
  if (!idRes) return undefined;
  let rest = sliceTrim(stmt, idRes.next);
  if (rest.length < 2) return undefined;
  const op = rest[0];
  const eq = rest[1];
  if (eq !== "=") return undefined;
  if (op !== "+" && op !== "-" && op !== "*" && op !== "/") return undefined;
  rest = sliceTrim(rest, 2);
  if (rest === "") throw new Error("Invalid assignment");
  ensureIdentifierExists(idRes.name, env);

  const cur = env.get(idRes.name)!;
  if (typeof cur.value !== "number" || Number.isNaN(cur.value))
    throw new Error(
      "Cannot compound-assign uninitialized or non-number variable"
    );
  if (!cur.mutable) throw new Error("Cannot assign to immutable variable");

  const rhsType = inferTypeFromExpr(rest, env);
  validateTypeCompatibility(cur.type, rhsType);

  const rhsVal = interpret(rest, env);
  const newVal = computeCompoundResult(op, cur.value, rhsVal);
  cur.value = newVal;
  env.set(idRes.name, cur);
  return newVal;
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
  ensureIdentifierExists(idRes.name, env);
  const cur = env.get(idRes.name)!;
  // allow assignment if variable is mutable OR if it is uninitialized
  if (!cur.mutable && typeof cur.value === "number" && !Number.isNaN(cur.value))
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

function processNonLetStatement(stmt: string, env: Env): number {
  let lastLocal = NaN;
  let rem = stmt;
  while (rem !== "") {
    rem = rem.trim();
    if (rem === "") break;
    if (startsWithGroup(rem)) {
      const close = findMatchingParen(rem, 0);
      if (close < 0) throw new Error("Unterminated grouping");
      const part = rem.slice(0, close + 1);
      lastLocal = interpret(part, env);
      rem = rem.substring(close + 1);
      rem = rem.trim();
      continue;
    }

    const assignedCompound = tryHandleCompoundAssignment(rem, env);
    if (assignedCompound !== undefined) lastLocal = assignedCompound;
    else {
      const assigned = tryHandleAssignmentStatement(rem, env);
      if (assigned !== undefined) lastLocal = assigned;
      else lastLocal = interpret(rem, env);
    }
    rem = "";
  }
  return lastLocal;
}

interface IfResult {
  consumed: number;
  last: number;
}

interface AttachResult {
  part: string;
  consumed: number;
}

function attachNextIfEmptyAt(
  part: string,
  idx: number,
  stmts: string[],
  forbidElse: boolean
): AttachResult {
  let consumed = 0;
  if (part === "" && idx + 1 < stmts.length) {
    const next = stmts[idx + 1].trim();
    if (!(forbidElse && next.startsWith("else"))) {
      consumed = 1;
      part = stmts[idx + 1];
    }
  }
  return { part, consumed };
}

function handleIfAt(idx: number, stmts: string[], env: Env): IfResult {
  const stmt = stmts[idx];
  const { content: condStr, close } = extractParenContent(stmt, "if");
  let thenPart = stmt.slice(close + 1).trim();

  let consumed = 0;
  // if thenPart is empty, maybe the next top-level stmt is the then-part
  ({ part: thenPart, consumed } = attachNextIfEmptyAt(
    thenPart,
    idx,
    stmts,
    true
  ));

  // check for else in the following stmt (either same stmt or next)
  let elsePart: string | undefined;
  if (thenPart.startsWith("else")) {
    // no then part was present, else is attached directly
    elsePart = sliceAfterKeyword(thenPart, 4);
    thenPart = "";
  } else if (
    idx + 1 + consumed < stmts.length &&
    stmts[idx + 1 + consumed].trim().startsWith("else")
  ) {
    consumed += 1;
    elsePart = sliceAfterKeyword(stmts[idx + consumed].trim(), 4);
  }

  const condVal = interpret(condStr, env);
  let lastLocal = NaN;
  const part = condVal !== 0 ? thenPart : elsePart;
  if (part !== undefined && part !== "") lastLocal = evalBlock(part, env);
  return { consumed, last: lastLocal };
}

interface ControlFlowResult {
  handled: boolean;
  last: number;
  consumed: number;
}

function extractParenContent(stmt: string, kind: string) {
  const paren = stmt.indexOf("(");
  if (paren === -1) throw new Error(`Invalid ${kind} statement`);
  const close = findMatchingParen(stmt, paren);
  if (close < 0) throw new Error(`Unterminated ${kind} condition`);
  const content = stmt.slice(paren + 1, close);
  return { content, paren, close };
}

function findTopLevelRangeIndex(rest: string): number {
  const res = findTopLevel(rest, (s, i) =>
    s[i] === "." && s[i + 1] === "." ? i : undefined
  );
  return res === undefined ? -1 : (res as number);
}

function sliceAfterKeyword(s: string, n: number): string {
  return s.slice(n).trim();
}

interface ForHeader {
  name: string;
  mutable: boolean;
  left: string;
  right: string;
}

function ensureStartsWith(s: string, prefix: string, msg: string) {
  if (!s.startsWith(prefix)) throw new Error(msg);
}

function ensureNonEmptyPair(a: string, b: string, msg: string) {
  if (a === "" || b === "") throw new Error(msg);
}

function parseForHeader(h: string): ForHeader {
  let s = h.trim();
  ensureStartsWith(s, "let ", "Invalid for header");
  s = sliceAfterKeyword(s, 4);
  const mutRes = parseMutPrefix(s);
  const mutable = mutRes.mutable;
  s = mutRes.rest;
  const idRes = parseIdentifierAt(s, 0);
  if (!idRes) throw new Error("Invalid for header");
  const name = idRes.name;
  let rest = sliceTrim(s, idRes.next);
  ensureStartsWith(rest, "in", "Invalid for header");
  rest = sliceTrim(rest, 2);
  const dotIdx = findTopLevelRangeIndex(rest);
  ensure(dotIdx !== -1, "Invalid for range");
  const left = rest.slice(0, dotIdx).trim();
  const right = rest.slice(dotIdx + 2).trim();
  ensureNonEmptyPair(left, right, "Invalid for range");
  return { name, mutable, left, right };
}

interface MutPrefixResult {
  mutable: boolean;
  rest: string;
}

function parseMutPrefix(s: string): MutPrefixResult {
  if (s.startsWith("mut "))
    return { mutable: true, rest: sliceAfterKeyword(s, 4) } as MutPrefixResult;
  return { mutable: false, rest: s } as MutPrefixResult;
}

function resolveBodyAfterClose(
  stmt: string,
  close: number,
  idx: number,
  stmts: string[],
  forbidElse: boolean
) {
  let body = stmt.slice(close + 1).trim();
  let consumed = 0;
  ({ part: body, consumed } = attachNextIfEmptyAt(
    body,
    idx,
    stmts,
    forbidElse
  ));
  return { body, consumed };
}

function handleWhileAt(
  idx: number,
  stmts: string[],
  env: Env
): ControlFlowResult {
  const { content: condStr, close } = extractParenContent(stmts[idx], "while");
  const stmt = stmts[idx];
  const { body, consumed } = resolveBodyAfterClose(
    stmt,
    close,
    idx,
    stmts,
    false
  );

  let lastLocal = NaN;
  while (interpret(condStr, env) !== 0) {
    lastLocal = evalBlock(body, env);
  }
  return { handled: true, last: lastLocal, consumed };
}

function handleForAt(
  idx: number,
  stmts: string[],
  env: Env
): ControlFlowResult {
  const { content: header, close } = extractParenContent(stmts[idx], "for");
  const { body, consumed } = resolveBodyAfterClose(
    stmts[idx],
    close,
    idx,
    stmts,
    false
  );

  const { name, mutable, left, right } = parseForHeader(header);
  const startVal = interpret(left, env);
  const endVal = interpret(right, env);
  let lastLocal = NaN;

  // preserve any outer binding of the same name; ensure loop variable does not leak
  const outerHas = env.has(name);
  const outerItem = outerHas ? env.get(name) : undefined;

  for (let i = startVal; i < endVal; i++) {
    // create shallow env and declare loop variable
    const loopEnv = new Map<string, EnvItem>(env);
    loopEnv.set(name, { value: i, mutable, type: undefined } as EnvItem);
    lastLocal = evalBlock(body, loopEnv);
  }

  // ensure loop-declared name is not visible after the loop
  if (!outerHas) {
    // ensure not present and mark as deleted so identifier lookup throws
    while (env.has(name)) env.delete(name);
    env.set(name, makeDeletedEnvItem());
  } else {
    // restore outer binding if it existed
    env.set(name, outerItem!);
  }

  return { handled: true, last: lastLocal, consumed };
}

function makeDeletedEnvItem(): EnvItem {
  return { value: NaN, mutable: false, type: "__deleted__" } as EnvItem;
}

function tryHandleControlFlow(
  idx: number,
  stmts: string[],
  env: Env
): ControlFlowResult {
  const stmt = stmts[idx];
  if (startsWithIf(stmt)) {
    const res = handleIfAt(idx, stmts, env);
    return { handled: true, last: res.last, consumed: res.consumed };
  }

  const flowHandlers: Array<
    [
      (s: string) => boolean,
      (i: number, st: string[], e: Env) => ControlFlowResult
    ]
  > = [
    [startsWithWhile, handleWhileAt],
    [startsWithFor, handleForAt],
  ];
  for (const [check, fn] of flowHandlers) {
    if (check(stmt)) return fn(idx, stmts, env);
  }

  return { handled: false, last: NaN, consumed: 0 };
}

function evalBlock(s: string, envIn?: Env): number {
  const trimmed = s.trim();
  // If this eval is for a brace-delimited block (e.g., "{ ... }"), create
  // a shallow copy of the parent environment so that declarations in the
  // inner block don't leak to the outer scope, but assignments to existing
  // outer variables still update the same EnvItem objects by reference.
  const isBraceBlock =
    trimmed.startsWith("{") &&
    findMatchingParen(trimmed, 0) === trimmed.length - 1;
  const env = isBraceBlock
    ? new Map<string, EnvItem>(envIn ?? new Map<string, EnvItem>())
    : envIn ?? new Map<string, EnvItem>();
  // create a shadow set for this evaluation scope
  blockShadow.set(env, new Set<string>());
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

    const ctrl = tryHandleControlFlow(idx, stmts, env);
    if (ctrl.handled) {
      last = ctrl.last;
      idx += ctrl.consumed;
      continue;
    }

    if (stmt.startsWith("let ")) {
      last = handleLetStatement(stmt, env, localDeclared);
    } else if (stmt.startsWith("fn ")) {
      last = handleFnStatement(stmt, env, localDeclared);
    } else {
      last = processNonLetStatement(stmt, env);
    }
  }
  return last;
}

function handleFnStatement(stmt: string, env: Env, localDeclared: Set<string>) {
  let rest = sliceTrim(stmt, 3);
  const nameRes = parseIdentifierAt(rest, 0);
  if (!nameRes) throw new Error("Invalid fn declaration");
  const name = nameRes.name;
  ensureUniqueDeclaration(localDeclared, name);

  rest = sliceTrim(rest, nameRes.next);
  const { content: paramsContent, close } = extractParenContent(rest, "fn");
  const paramsRaw = paramsContent
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r !== "");
  const params = paramsRaw.map((p) => {
    const colonIdx = p.indexOf(":");
    const pname = colonIdx === -1 ? p : p.slice(0, colonIdx).trim();
    if (!isIdentifierName(pname)) throw new Error("Invalid fn parameter");
    return pname;
  });

  let restAfterParams = rest.slice(close + 1).trim();
  // accept optional return type annotation
  const arrowIdx = restAfterParams.indexOf("=>");
  if (arrowIdx === -1) throw new Error("Invalid fn declaration");
  restAfterParams = sliceTrim(restAfterParams, arrowIdx + 2);

  let body = restAfterParams;
  if (body.startsWith("{")) {
    const bc = findMatchingParen(body, 0);
    if (bc < 0) throw new Error("Unterminated fn body");
    body = body.slice(0, bc + 1);
  }

  const func: FunctionValue = { params, body, env: new Map(env) };
  const item: EnvItem = { value: func, mutable: false, type: "Fn" };
  env.set(name, item);
  return NaN;
}

function ensureUniqueDeclaration(localDeclared: Set<string>, name: string) {
  if (localDeclared.has(name)) throw new Error("Duplicate declaration");
  localDeclared.add(name);
}

function extractAfterArrow(s: string, msg: string) {
  const arrowIdx = s.indexOf("=>");
  ensure(arrowIdx !== -1, msg);
  return sliceTrim(s, arrowIdx + 2);
}

function tryHandleCall(s: string, env?: Env): number | undefined {
  const idRes = parseIdentifierAt(s, 0);
  if (!idRes) return undefined;
  const rest = sliceTrim(s, idRes.next);
  if (!rest.startsWith("(")) return undefined;
  const close = findMatchingParen(rest, 0);
  if (close < 0) throw new Error("Unterminated call");
  const argsContent = rest.slice(1, close).trim();
  const args = argsContent === "" ? [] : topLevelSplitTrim(argsContent, ",");
  const trailing = rest.slice(close + 1).trim();
  if (trailing !== "") return undefined; // not a pure call expression

  if (!env || !env.has(idRes.name)) throw new Error("Unknown identifier");
  const item = env.get(idRes.name)!;
  if (typeof item.value === "number") throw new Error("Not a function");
  const func = item.value as FunctionValue;
  if (func.params.length !== args.length)
    throw new Error("Argument count mismatch");

  const argVals = args.map((a) => interpret(a, env));
  const callEnv = new Map<string, EnvItem>(func.env);
  // bind params
  for (let i = 0; i < func.params.length; i++) {
    callEnv.set(func.params[i], {
      value: argVals[i],
      mutable: false,
    } as EnvItem);
  }

  // evaluate body
  const res = evalBlock(func.body, callEnv);
  return res;
}

function tryHandleFnExpression(s: string, env?: Env): number | undefined {
  const ss = s.trim();
  if (!startsWithKeyword(ss, "fn")) return undefined;

  // find the param list and body boundaries without re-parsing params (reuse existing statement parser)
  const rest = sliceTrim(ss, 3);
  const paren = rest.indexOf("(");
  ensure(paren !== -1, "Invalid fn declaration");
  const close = findMatchingParen(rest, paren);
  ensureCloseParen(close, "Unterminated fn params");

  let restAfterParams = sliceTrim(rest, close + 1);
  restAfterParams = extractAfterArrow(
    restAfterParams,
    "Invalid fn declaration"
  );

  // only support braced body for expression form (simple and safe)
  if (!restAfterParams.startsWith("{")) return undefined;
  const bc = findMatchingParen(restAfterParams, 0);
  if (bc < 0) throw new Error("Unterminated fn body");
  const body = restAfterParams.slice(0, bc + 1);
  const trailing = restAfterParams.slice(bc + 1).trim();

  const fnStmt = ss.slice(0, ss.indexOf(body) + body.length);
  const actualEnv = env ?? new Map<string, EnvItem>();
  // reuse the existing statement handler to register the function and avoid duplication
  handleFnStatement(fnStmt, actualEnv, new Set<string>());

  if (trailing === "") return NaN;
  return interpret(trailing, actualEnv);
}
