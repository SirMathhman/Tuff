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
  mutable: boolean;
}

export type Environment = Map<string, Variable>;

export interface TypeInfo {
  suffixType?: string | undefined;
  bitDepth?: number | undefined;
}

export interface OpResult {
  ok: boolean;
  result: Result<number, string>;
}

export function interpret(
  input: string,
  env: Environment = new Map()
): Result<number, string> {
  const trimmed = input.trim();
  // console.log(`Interpreting: "${trimmed}"`);
  const statements = splitStatements(trimmed);
  return handleBlockInternal(statements, env, false, true);
}

function interpretLeaf(
  trimmed: string,
  env: Environment
): Result<number, string> {
  if (trimmed === "") return { ok: false, error: "Invalid operand" };
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

function splitStatements(contents: string): string[] {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < contents.length; i++) {
    const char = contents.charAt(i);
    const oldDepth = depth;
    depth += getDepthChange(char);
    if (char === ";" && depth === 0) {
      statements.push(current);
      current = "";
    } else if (
      char === "{" &&
      oldDepth === 0 &&
      shouldSplitBeforeBlock(current)
    ) {
      statements.push(current);
      current = "{";
    } else if (
      char === "}" &&
      depth === 0 &&
      shouldSplitAfterBlock(contents, i)
    ) {
      current += "}";
      statements.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  statements.push(current);
  return statements;
}

function shouldSplitBeforeBlock(current: string): boolean {
  const trimmed = current.trim();
  if (trimmed === "") return false;
  const lastChar = trimmed.charAt(trimmed.length - 1);
  return !"+-*/=".includes(lastChar);
}

function shouldSplitAfterBlock(contents: string, index: number): boolean {
  for (let j = index + 1; j < contents.length; j++) {
    const nextChar = contents.charAt(j);
    if (
      nextChar === " " ||
      nextChar === "\n" ||
      nextChar === "\r" ||
      nextChar === "\t"
    )
      continue;
    return !"+-*/=".includes(nextChar);
  }
  return false;
}

function handleBlockInternal(
  statements: string[],
  env: Environment,
  shouldClone: boolean,
  isTopLevel: boolean = false
): Result<number, string> {
  const blockEnv = shouldClone ? new Map(env) : env;
  const localDecls = new Set<string>();
  let lastRes: Result<number, string> = {
    ok: true,
    value: 0,
    hasSuffix: false,
  };

  // Track if the last statement is empty (trailing semicolon)
  const lastStatement = statements[statements.length - 1];
  const hasTrailingSemicolon =
    lastStatement !== undefined && lastStatement.trim() === "";

  for (let i = 0; i < statements.length; i++) {
    const res = processStatement(
      statements[i],
      i,
      statements.length,
      blockEnv,
      localDecls
    );
    if (!res) continue;
    if (!res.ok) return res;
    lastRes = res;
  }

  // If there's a trailing semicolon at top level, return void (0)
  if (hasTrailingSemicolon && isTopLevel) {
    return {
      ok: true,
      value: 0,
      hasSuffix: false,
    };
  }

  // If there's a trailing semicolon in a nested block, it's an error
  if (hasTrailingSemicolon && !isTopLevel) {
    return {
      ok: false,
      error: "Invalid operand",
    };
  }

  // If the last statement is a bare 'let' declaration (no semicolon, no following expressions)
  if (
    lastStatement !== undefined &&
    lastStatement.trim().startsWith("let ") &&
    !hasTrailingSemicolon
  ) {
    return {
      ok: false,
      error: "Invalid operand",
    };
  }

  return lastRes;
}

function processStatement(
  stmt: string | undefined,
  index: number,
  count: number,
  env: Environment,
  localDecls: Set<string>
): Result<number, string> | undefined {
  if (stmt === undefined) return undefined;
  const trimmed = stmt.trim();
  const isLast = index === count - 1;

  // Skip empty statements (from trailing semicolons)
  if (trimmed === "") return undefined;

  const res = handleStatement(trimmed, env, localDecls);
  if (!res.ok && res.error === "Invalid operand" && !isLast) {
    return undefined;
  }
  return res;
}

function handleStatement(
  stmt: string,
  env: Environment,
  localDecls: Set<string>
): Result<number, string> {
  if (stmt.startsWith("let ")) {
    return handleLet(stmt, env, localDecls);
  }
  const eqIndex = findAssignment(stmt);
  if (eqIndex !== -1) {
    return handleAssignment(stmt, eqIndex, env);
  }
  return interpretLeaf(stmt, env);
}

function findAssignment(stmt: string): number {
  let depth = 0;
  for (let i = 0; i < stmt.length; i++) {
    const char = stmt.charAt(i);
    if (char === "(" || char === "{") depth++;
    if (char === ")" || char === "}") depth--;
    if (depth === 0 && char === "=" && !isEqualsOperator(stmt, i)) {
      return i;
    }
  }
  return -1;
}

function isEqualsOperator(stmt: string, i: number): boolean {
  return i + 1 < stmt.length && stmt.charAt(i + 1) === "=";
}

function handleAssignment(
  stmt: string,
  eqIndex: number,
  env: Environment
): Result<number, string> {
  const name = cut(stmt, 0, eqIndex);
  const existing = env.get(name);
  if (!existing) {
    return { ok: false, error: `Variable not defined: ${name}` };
  }
  if (!existing.mutable) {
    return { ok: false, error: `Variable is immutable: ${name}` };
  }

  const right = part(stmt, eqIndex + 1);
  const res = interpret(right, env);
  if (!res.ok) return res;

  if (existing.hasSuffix) {
    if (res.hasSuffix && !typesMatch(res, existing)) {
      return {
        ok: false,
        error: `Type mismatch: cannot assign ${res.suffixType}${res.bitDepth} to ${existing.suffixType}${existing.bitDepth}`,
      };
    }
    if (
      !isInRange(
        BigInt(Math.floor(res.value)),
        existing.suffixType!,
        existing.bitDepth!
      )
    ) {
      return rangeError(res.value, existing.suffixType!, existing.bitDepth!);
    }
  }

  existing.value = res.value;
  return {
    ok: true,
    value: existing.value,
    hasSuffix: existing.hasSuffix,
    suffixType: existing.suffixType,
    bitDepth: existing.bitDepth,
  };
}

function handleLet(
  stmt: string,
  env: Environment,
  localDecls: Set<string>
): Result<number, string> {
  const eqIndex = stmt.indexOf("=");
  const rawLeft = eqIndex === -1 ? part(stmt, 4) : cut(stmt, 4, eqIndex);
  const isMut = rawLeft.startsWith("mut ");
  const left = isMut ? part(rawLeft, 4) : rawLeft;
  const colonIndex = left.indexOf(":");

  if (eqIndex === -1 && colonIndex === -1) {
    return { ok: false, error: "Missing type or initializer in let" };
  }

  const name = (colonIndex === -1 ? left : cut(left, 0, colonIndex)).trim();
  if (localDecls.has(name)) {
    return { ok: false, error: `Variable already defined: ${name}` };
  }
  localDecls.add(name);

  if (eqIndex === -1) {
    const typeStr = part(left, colonIndex + 1);
    return registerUninitializedVar(name, typeStr, isMut, env);
  }

  const right = part(stmt, eqIndex + 1);
  const res = interpret(right, env);
  if (!res.ok) return res;

  if (colonIndex === -1) {
    return registerVar(name, res, isMut, env);
  }

  return handleTypedLet(name, left, colonIndex, res, isMut, env);
}

function registerUninitializedVar(
  name: string,
  typeStr: string,
  mutable: boolean,
  env: Environment
): Result<number, string> {
  if (typeStr === "Bool") {
    return registerVar(
      name,
      {
        ok: true,
        value: 0,
        hasSuffix: true,
        suffixType: "Bool",
        bitDepth: 1,
      },
      mutable,
      env
    );
  }

  const type = typeStr.charAt(0).toUpperCase();
  const bitDepth = parseInt(part(typeStr, 1), 10);

  return registerVar(
    name,
    {
      ok: true,
      value: 0,
      hasSuffix: true,
      suffixType: type,
      bitDepth,
    },
    mutable,
    env
  );
}

function handleTypedLet(
  name: string,
  left: string,
  colonIndex: number,
  res: Success<number>,
  mutable: boolean,
  env: Environment
): Result<number, string> {
  const typeStr = part(left, colonIndex + 1);

  if (typeStr === "Bool") {
    if (res.value !== 0 && res.value !== 1) {
      return { ok: false, error: `Value ${res.value} is not a boolean` };
    }
    return registerVar(
      name,
      {
        ok: true,
        value: res.value,
        hasSuffix: true,
        suffixType: "Bool",
        bitDepth: 1,
      },
      mutable,
      env
    );
  }

  const type = typeStr.charAt(0).toUpperCase();
  const bitDepth = parseInt(part(typeStr, 1), 10);

  if (res.hasSuffix && res.suffixType !== type) {
    return {
      ok: false,
      error: `Type mismatch: cannot assign ${res.suffixType} to ${typeStr}`,
    };
  }

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
    mutable,
    env
  );
}

function registerVar(
  name: string,
  res: Success<number>,
  mutable: boolean,
  env: Environment
): Result<number, string> {
  env.set(name, {
    value: res.value,
    hasSuffix: res.hasSuffix,
    suffixType: res.suffixType,
    bitDepth: res.bitDepth,
    mutable,
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

function typesMatch(left: TypeInfo, right: TypeInfo): boolean {
  return (
    left.suffixType === right.suffixType && left.bitDepth === right.bitDepth
  );
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
      hasSuffix: true,
      suffixType: "Bool",
      bitDepth: 1,
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
    if (isInvalidCharacter(c, i)) {
      return { ok: false, error: "Invalid operand" };
    }
  }
  if (trimmed.split(".").length > 2) {
    return { ok: false, error: "Invalid operand" };
  }
  return { ok: true, value: val, hasSuffix: false };
}

function isInvalidCharacter(c: string, i: number): boolean {
  return !(
    (c >= "0" && c <= "9") ||
    c === "." ||
    (i === 0 && (c === "-" || c === "+"))
  );
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
