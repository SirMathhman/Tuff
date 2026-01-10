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

function validateParsedOperand(
  parsed: ParsedNumber,
  operandStr: string
): Err<string> | undefined {
  const neg = checkNegativeSuffix(operandStr, parsed);
  if (neg) return neg;
  return validateOperandSuffix(parsed, operandStr);
}

function ensureCommonSuffix(
  operandStrs: string[],
  opnds: ParsedNumber[]
): Result<string, string> {
  let common = "";
  for (let i = 0; i < opnds.length; i++) {
    const suf = operandStrs[i].slice(opnds[i].end);
    if (suf) {
      if (common && suf !== common)
        return { ok: false, error: "mixed suffixes not supported" };
      common = suf;
    }
  }
  return { ok: true, value: common };
}

function processMulDiv(
  opnds: ParsedNumber[],
  opList: string[],
  suffix: string
): Err<string> | undefined {
  let i = 0;
  while (i < opList.length) {
    const op = opList[i];
    if (op === "*" || op === "/") {
      const a = opnds[i].value;
      const b = opnds[i + 1].value;
      if (op === "/" && b === 0)
        return { ok: false, error: "division by zero" };
      const res = op === "*" ? a * b : a / b;
      opnds[i] = { value: res, raw: String(res), end: String(res).length };
      opnds.splice(i + 1, 1);
      opList.splice(i, 1);
      if (suffix) {
        const err = validateSizedInteger(String(res), suffix);
        if (err) return err;
      }
      continue;
    }
    i++;
  }
  return undefined;
}

interface Tokenized {
  operands: ParsedNumber[];
  operandStrs: string[];
  ops: string[];
}

function isAlphaNum(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

interface Binding {
  value: number;
  suffix?: string;
}

interface ReadOperandResult {
  parsed: ParsedNumber;
  operandFull: string;
  nextPos: number;
}

function splitStatements(src: string): string[] {
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

function findTopLevelChar(src: string, start: number, target: string): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === target && depth === 0) return i;
  }
  return -1;
}

// Check that the declaration annotation matches the initializer.
// Accepts a numeric literal annotation (e.g., '2U8') or a sized type like 'U8'.
function checkAnnotationMatch(
  annText: string,
  rhs: string,
  value: number | bigint
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

  const allowed = new Set([
    "U8",
    "U16",
    "U32",
    "U64",
    "I8",
    "I16",
    "I32",
    "I64",
  ]);
  if (allowed.has(annText)) {
    const rhsParsed = parseLeadingNumber(rhs);
    if (!rhsParsed)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    const rhsSuffix = rhs.slice(rhsParsed.end);
    if (rhsSuffix !== annText)
      return {
        ok: false,
        error: "declaration initializer does not match annotation",
      };
    const rangeErr = validateSizedInteger(String(value), annText);
    if (rangeErr) return rangeErr;
  }
  return undefined;
}

function parseDeclaration(
  stmt: string,
  env: Map<string, Binding>
): Result<void, string> {
  let p = 4;
  while (p < stmt.length && stmt[p] === " ") p++;
  const start = p;
  function isIdentCharCode(c: number): boolean {
    return (
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122) ||
      (c >= 48 && c <= 57) ||
      c === 95
    );
  }
  while (p < stmt.length) {
    const c = stmt.charCodeAt(p);
    if (isIdentCharCode(c)) p++;
    else break;
  }
  const ident = stmt.slice(start, p);
  if (!ident) return { ok: false, error: "invalid declaration" };

  const eq = findTopLevelChar(stmt, p, "=");
  if (eq === -1) return { ok: false, error: "invalid declaration" };

  const rhs = stmt.slice(eq + 1).trim();
  const valRes = interpret(rhs);
  if (!valRes.ok) return valRes;

  // check annotation (optional) between identifier end and '=': e.g., ': 2U8' or ': U8'
  const colonPos = findTopLevelChar(stmt, p, ":");
  if (colonPos !== -1 && colonPos < eq) {
    const annText = stmt.slice(colonPos + 1, eq).trim();
    const annErr = checkAnnotationMatch(annText, rhs, valRes.value);
    if (annErr) return annErr;
  }

  const parsedNum = parseLeadingNumber(rhs);
  const suffix =
    parsedNum && parsedNum.end < rhs.length
      ? rhs.slice(parsedNum.end)
      : undefined;
  env.set(ident, { value: valRes.value, suffix });
  return { ok: true, value: undefined };
}

function isIdentifierOnly(stmt: string): boolean {
  if (stmt.length === 0) return false;
  for (let k = 0; k < stmt.length; k++) {
    const c = stmt.charCodeAt(k);
    if (
      !(
        (c >= 65 && c <= 90) ||
        (c >= 97 && c <= 122) ||
        (c >= 48 && c <= 57) ||
        c === 95 ||
        stmt[k] === " "
      )
    )
      return false;
  }
  return true;
}

function evaluateBlock(inner: string): Result<number, string> {
  const stmts = splitStatements(inner);
  const env = new Map<string, Binding>();

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (stmt.length === 0) continue;

    if (stmt.startsWith("let ")) {
      const r = parseDeclaration(stmt, env);
      if (!r.ok) return r as Err<string>;
      continue;
    }

    if (isIdentifierOnly(stmt)) {
      const name = stmt.split(" ")[0];
      const binding = env.get(name);
      if (!binding) return { ok: false, error: `unknown identifier ${name}` };
      if (i === stmts.length - 1) return { ok: true, value: binding.value };
      continue;
    }

    const exprRes = interpret(stmt);
    if (!exprRes.ok) return exprRes;
    if (i === stmts.length - 1) return exprRes;
  }

  return { ok: true, value: 0 };
}

function readGroupedAt(
  s: string,
  pos: number
): Result<ReadOperandResult, string> {
  const n = s.length;
  const substr = s.slice(pos);
  const opening = substr[0];
  const closing = opening === "(" ? ")" : "}";

  let depth = 0;
  let k = 0;
  while (k < substr.length) {
    if (substr[k] === opening) depth++;
    else if (substr[k] === closing) {
      depth--;
      if (depth === 0) break;
    }
    k++;
  }
  if (k >= substr.length || substr[k] !== closing)
    return { ok: false, error: "unmatched parenthesis" };
  const inner = substr.slice(1, k);
  // support block statements separated by ';'
  let innerRes: Result<number, string>;
  if (inner.indexOf(";") !== -1) innerRes = evaluateBlock(inner);
  else innerRes = interpret(inner);
  if (!innerRes.ok) return innerRes;
  const parsed = {
    value: innerRes.value,
    raw: String(innerRes.value),
    end: k + 1,
  } as ParsedNumber;
  let j = pos + parsed.end;
  while (j < n && isAlphaNum(s[j])) j++; // suffix chars
  const operandFull = s.slice(pos, j).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: j } };
}

function readOperandAt(
  s: string,
  pos: number
): Result<ReadOperandResult, string> {
  const n = s.length;
  const substr = s.slice(pos);

  // grouped expression handled by helper
  if (substr[0] === "(" || substr[0] === "{") {
    return readGroupedAt(s, pos);
  }

  // direct numeric
  const direct = parseLeadingNumber(substr);
  if (!direct) return { ok: false, error: "invalid operand" };
  let j = pos + direct.end;
  while (j < n && !["+", "-", "*", "/"].includes(s[j])) j++;
  const operandFull = s.slice(pos, j).trim();
  return { ok: true, value: { parsed: direct, operandFull, nextPos: j } };
}

function tokenizeAddSub(s: string): Result<Tokenized, string> {
  const n = s.length;
  let pos = 0;

  function skipSpaces(): void {
    while (pos < n && s[pos] === " ") pos++;
  }

  function isOperator(ch: string): boolean {
    return ch === "+" || ch === "-" || ch === "*" || ch === "/";
  }

  const operands: ParsedNumber[] = [];
  const operandStrs: string[] = [];
  const ops: string[] = [];

  skipSpaces();
  while (pos < n) {
    const opRes = readOperandAt(s, pos);
    if (!opRes.ok) return opRes;
    const { parsed, operandFull, nextPos } = opRes.value;

    const err = validateParsedOperand(parsed, operandFull);
    if (err) return err;

    operands.push(parsed);
    operandStrs.push(operandFull);

    pos = nextPos;
    skipSpaces();

    if (pos >= n) break;

    const ch = s[pos];
    if (!isOperator(ch)) return { ok: false, error: "invalid operator" };
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

  const commonResult = ensureCommonSuffix(operandStrs, operands);
  if (!commonResult.ok) return commonResult;
  const commonSuffix = commonResult.value;

  const mulDivErr = processMulDiv(operands, ops, commonSuffix);
  if (mulDivErr) return mulDivErr;

  // Left-associative evaluation for + and -
  let acc = operands[0].value;
  for (let k = 0; k < ops.length; k++) {
    const op2 = ops[k];
    const next = operands[k + 1].value;
    acc = op2 === "+" ? acc + next : acc - next;
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

  // binary operators: + - * / (supports chained expressions)
  if (
    s.indexOf("+") !== -1 ||
    s.indexOf("-") !== -1 ||
    s.indexOf("*") !== -1 ||
    s.indexOf("/") !== -1
  ) {
    return handleAddSubChain(s);
  }

  return handleSingle(s);
}
