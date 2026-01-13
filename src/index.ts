export interface Success<T> {
  ok: true;
  value: T;
  hasSuffix: boolean;
  suffixType?: string | undefined;
  bitDepth?: number | undefined;
}

export interface Failure<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Success<T> | Failure<E>;

export interface Variable {
  value: number;
  hasSuffix: boolean;
  suffixType?: string | undefined;
  bitDepth?: number | undefined;
}

export type Environment = Map<string, Variable>;

export interface OpResult {
  ok: boolean;
  result: Result<number, string>;
}

export function interpret(
  input: string,
  env: Environment = new Map()
): Result<number, string> {
  const trimmed = input.trim();
  const statements = splitStatements(trimmed);
  if (statements.length > 1) {
    return handleBlockInternal(statements, env, false);
  }

  const resOp = tryOps(trimmed, env);
  if (resOp) return resOp;

  const resWrap = tryWrap(trimmed, env);
  if (resWrap) return resWrap;

  return interpretOperand(trimmed, env);
}

function tryWrap(
  trimmed: string,
  env: Environment
): Result<number, string> | undefined {
  const res1 = runWrap(trimmed, "(", ")", interpret, env);
  if (res1) return res1;
  return runWrap(trimmed, "{", "}", handleBlock, env);
}

function runWrap(
  str: string,
  open: string,
  close: string,
  fn: (s: string, e: Environment) => Result<number, string>,
  env: Environment
): Result<number, string> | undefined {
  if (isWrapped(str, open, close)) return fn(strip(str), env);
  return undefined;
}

function tryOps(
  trimmed: string,
  env: Environment
): Result<number, string> | undefined {
  const res1 = tryHandleOps(trimmed, ["+", "-"], env);
  if (res1.ok) return res1.result;
  const res2 = tryHandleOps(trimmed, ["*", "/"], env);
  if (res2.ok) return res2.result;
  return undefined;
}

function strip(str: string): string {
  return str.substring(1, str.length - 1);
}

function isWrapped(str: string, open: string, close: string): boolean {
  return str.startsWith(open) && str.endsWith(close);
}

function handleBlock(
  contents: string,
  env: Environment
): Result<number, string> {
  const statements = splitStatements(contents);
  return handleBlockInternal(statements, env, true);
}

function handleBlockInternal(
  statements: string[],
  env: Environment,
  shouldClone: boolean
): Result<number, string> {
  const blockEnv = shouldClone ? new Map(env) : env;
  const loopRes = runBlockLoop(statements, blockEnv);
  if (!loopRes.ok) return loopRes;

  const lastStmt = (statements[statements.length - 1] || "").trim();
  return interpret(lastStmt, blockEnv);
}

function splitStatements(contents: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < contents.length; i++) {
    const char = contents.charAt(i);
    depth += getDepthChange(char);
    if (char === ";" && depth === 0) {
      statements.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  statements.push(current);
  return statements;
}

function runBlockLoop(
  statements: string[],
  env: Environment
): Result<number, string> {
  const localDecls = new Set<string>();
  for (let i = 0; i < statements.length - 1; i++) {
    const stmt = (statements[i] || "").trim();
    const res = handleStatement(stmt, env, localDecls);
    if (!res.ok) return res;
  }
  return { ok: true, value: 0, hasSuffix: false };
}

function handleStatement(
  stmt: string,
  env: Environment,
  localDecls: Set<string>
): Result<number, string> {
  if (stmt.startsWith("let ")) {
    return handleLet(stmt, env, localDecls);
  }
  return interpret(stmt, env);
}

function handleLet(
  stmt: string,
  env: Environment,
  localDecls: Set<string>
): Result<number, string> {
  const eqIndex = stmt.indexOf("=");
  const errEq = failIf(eqIndex === -1, "Missing = in let");
  if (errEq) return errEq;

  const left = cut(stmt, 4, eqIndex);
  const right = part(stmt, eqIndex + 1);

  const colonIndex = left.indexOf(":");
  const name = (colonIndex === -1 ? left : cut(left, 0, colonIndex)).trim();

  if (localDecls.has(name)) {
    return { ok: false, error: `Variable already defined: ${name}` };
  }
  localDecls.add(name);

  const res = interpret(right, env);
  if (!res.ok) return res;

  if (colonIndex === -1) {
    return registerVar(name, res, env);
  }

  return handleTypedLet(left, colonIndex, res, env);
}

function handleTypedLet(
  left: string,
  colonIndex: number,
  res: Success<number>,
  env: Environment
): Result<number, string> {
  const name = cut(left, 0, colonIndex);
  const typeStr = part(left, colonIndex + 1);
  const type = typeStr.charAt(0).toUpperCase();
  const bitDepth = parseInt(part(typeStr, 1), 10);

  if (!isInRange(BigInt(Math.floor(res.value)), type, bitDepth)) {
    return rangeError(res.value, type, bitDepth);
  }

  return registerVar(
    name,
    {
      ok: true,
      value: res.value,
      hasSuffix: true,
      suffixType: type,
      bitDepth,
    },
    env
  );
}

function registerVar(
  name: string,
  res: Success<number>,
  env: Environment
): Result<number, string> {
  env.set(name, {
    value: res.value,
    hasSuffix: res.hasSuffix,
    suffixType: res.suffixType,
    bitDepth: res.bitDepth,
  });
  return res;
}

function cut(str: string, start: number, end: number): string {
  return str.substring(start, end).trim();
}

function part(str: string, start: number): string {
  return str.substring(start).trim();
}

function failIf(cond: boolean, error: string): Failure<string> | undefined {
  if (cond) return { ok: false, error };
  return undefined;
}

function findOperator(input: string, ops: string[]): number {
  let depth = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    depth += getDepthChange(input.charAt(i));
    if (depth === 0 && isOperatorMatch(input, i, ops)) {
      return i - 1;
    }
  }
  return -1;
}

function getDepthChange(char: string): number {
  if (char === ")" || char === "}") return 1;
  if (char === "(" || char === "{") return -1;
  return 0;
}

function isOperatorMatch(input: string, i: number, ops: string[]): boolean {
  if (i < 1 || i > input.length - 2) return false;
  if (input.charAt(i - 1) !== " " || input.charAt(i + 1) !== " ") return false;
  return ops.includes(input.charAt(i));
}

function tryHandleOps(
  trimmed: string,
  ops: string[],
  env: Environment
): OpResult {
  const index = findOperator(trimmed, ops);
  if (index !== -1) {
    return { ok: true, result: handleBinaryAtIndex(trimmed, index, env) };
  }
  return { ok: false, result: { ok: false, error: "" } };
}

function handleBinaryAtIndex(
  input: string,
  index: number,
  env: Environment
): Result<number, string> {
  const operator = input.charAt(index + 1);
  return handleBinaryExpression(input, index, operator, env);
}

function handleBinaryExpression(
  input: string,
  index: number,
  operator: string,
  env: Environment
): Result<number, string> {
  const left = interpret(input.substring(0, index), env);
  if (!left.ok) {
    return left;
  }
  const right = interpret(input.substring(index + 3), env);
  if (!right.ok) {
    return right;
  }

  if (left.hasSuffix && right.hasSuffix) {
    if (
      left.suffixType !== right.suffixType ||
      left.bitDepth !== right.bitDepth
    ) {
      return { ok: false, error: "Suffix mismatch" };
    }
  }

  if (operator === "/" && right.value === 0) {
    return { ok: false, error: "Division by zero" };
  }

  const value = applyOperator(left.value, right.value, operator);
  const hasSuffix = left.hasSuffix || right.hasSuffix;

  if (hasSuffix) {
    const type = left.suffixType || right.suffixType!;
    const bitDepth = left.bitDepth || right.bitDepth!;
    if (!isInRange(BigInt(Math.floor(value)), type, bitDepth)) {
      return rangeError(value, type, bitDepth);
    }
    return { ok: true, value, hasSuffix, suffixType: type, bitDepth };
  }

  return { ok: true, value, hasSuffix: false };
}

function applyOperator(left: number, right: number, operator: string): number {
  if (operator === "+") {
    return left + right;
  }
  if (operator === "-") {
    return left - right;
  }
  if (operator === "/") {
    return left / right;
  }
  return left * right;
}

function interpretOperand(
  input: string,
  env: Environment
): Result<number, string> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, error: "Invalid operand" };
  }
  if (trimmed === "true" || trimmed === "false") {
    return {
      ok: true,
      value: trimmed === "true" ? 1 : 0,
      hasSuffix: false,
    };
  }
  const variable = env.get(trimmed);
  if (variable) {
    return { ok: true, ...variable };
  }

  const upper = trimmed.toUpperCase();
  const suffixInfo = getSuffixInfo(upper);
  const numericPart = suffixInfo.found
    ? trimmed.substring(0, suffixInfo.index)
    : "";

  if (!suffixInfo.found || !isValidInteger(numericPart)) {
    return handleNonSuffixedLiteral(trimmed);
  }

  const { type, bitDepth } = suffixInfo;
  if (type === "U" && numericPart.includes("-")) {
    return { ok: false, error: "Unsigned integer cannot be negative" };
  }

  const bigValue = BigInt(numericPart);
  if (!isInRange(bigValue, type, bitDepth)) {
    return rangeError(bigValue, type, bitDepth);
  }

  return {
    ok: true,
    value: Number(bigValue),
    hasSuffix: true,
    suffixType: type,
    bitDepth,
  };
}

function handleNonSuffixedLiteral(trimmed: string): Result<number, string> {
  const val = parseFloat(trimmed);
  if (isNaN(val)) {
    return { ok: false, error: "Invalid operand" };
  }
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charAt(i);
    if (
      !(
        (c >= "0" && c <= "9") ||
        c === "." ||
        (i === 0 && (c === "-" || c === "+"))
      )
    ) {
      return { ok: false, error: "Invalid operand" };
    }
  }
  if (trimmed.split(".").length > 2) {
    return { ok: false, error: "Invalid operand" };
  }
  return { ok: true, value: val, hasSuffix: false };
}

function isValidInteger(str: string): boolean {
  if (str.length === 0) {
    return false;
  }
  let start = 0;
  if (str.charAt(0) === "-" || str.charAt(0) === "+") {
    start = 1;
  }
  return start < str.length && isNumeric(str.substring(start));
}

interface SuffixInfo {
  found: boolean;
  type: string;
  bitDepth: number;
  index: number;
}

function getSuffixInfo(upper: string): SuffixInfo {
  const uIndex = upper.lastIndexOf("U");
  const iIndex = upper.lastIndexOf("I");
  const index = Math.max(uIndex, iIndex);
  const failure: SuffixInfo = {
    found: false,
    type: "",
    bitDepth: 0,
    index: -1,
  };

  if (index === -1) {
    return failure;
  }

  const suffixStr = upper.substring(index + 1);
  if (!isNumeric(suffixStr) || suffixStr.length === 0) {
    return failure;
  }

  return {
    found: true,
    type: upper.charAt(index),
    bitDepth: parseInt(suffixStr, 10),
    index,
  };
}

function isInRange(value: bigint, type: string, bitDepth: number): boolean {
  if (type === "U") {
    const max = BigInt(2) ** BigInt(bitDepth);
    return value >= 0 && value < max;
  }
  const limit = BigInt(2) ** BigInt(bitDepth - 1);
  return value >= -limit && value < limit;
}

function isNumeric(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    if (char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}

function rangeError(
  value: number | bigint,
  type: string,
  bitDepth: number
): Failure<string> {
  return {
    ok: false,
    error: `Value ${value} is out of range for ${type}${bitDepth}`,
  };
}
