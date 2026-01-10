import type { Result, Err } from "./result";
import type { ParsedNumber } from "./interpretHelpers";
import {
  parseLeadingNumber,
  validateSizedInteger,
  isSignedSuffix,
} from "./interpretHelpers";

// These are set by interpret.ts after both modules initialize to avoid circular imports
let _interpret:
  | ((s: string) => Result<number, string>)
  | undefined = undefined;
let _evaluateBlock:
  | ((s: string, parentEnv?: Map<string, any>) => Result<number, string>)
  | undefined = undefined;

export function setInterpreterFns(
  interpretFn: (s: string) => Result<number, string>,
  evaluateBlockFn: (s: string, parentEnv?: Map<string, any>) => Result<number, string>
): void {
  _interpret = interpretFn;
  _evaluateBlock = evaluateBlockFn;
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
      if (common && suf !== common) return { ok: false, error: "mixed suffixes not supported" };
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
      if (op === "/" && b === 0) return { ok: false, error: "division by zero" };
      const res = op === "*" ? a * b : a / b;
      opnds[i] = { value: res, raw: String(res), end: String(res).length } as ParsedNumber;
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

function isAlphaNum(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

interface ReadOperandResult {
  parsed: ParsedNumber;
  operandFull: string;
  nextPos: number;
}

function readGroupedAt(s: string, pos: number): Result<ReadOperandResult, string> {
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
  if (inner.indexOf(";") !== -1) {
    if (!_evaluateBlock) return { ok: false, error: "internal error" };
    innerRes = _evaluateBlock(inner);
  } else {
    if (!_interpret) return { ok: false, error: "internal error" };
    innerRes = _interpret(inner);
  }
  if (!innerRes.ok) return innerRes;
  const parsed: ParsedNumber = {
    value: innerRes.value,
    raw: String(innerRes.value),
    end: k + 1,
  };
  let j = pos + parsed.end;
  while (j < n && isAlphaNum(s[j])) j++; // suffix chars
  const operandFull = s.slice(pos, j).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: j } };
}

function readOperandAt(s: string, pos: number): Result<ReadOperandResult, string> {
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

interface Tokenized {
  operands: ParsedNumber[];
  operandStrs: string[];
  ops: string[];
}

export function tokenizeAddSub(s: string): Result<Tokenized, string> {
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

export function handleAddSubChain(s: string): Result<number, string> {
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

export function handleSingle(s: string): Result<number, string> {
  const parsed = parseLeadingNumber(s);
  if (parsed === undefined) return { ok: true, value: 0 };

  if (parsed.end < s.length && s[0] === "-") {
    const suffix = s.slice(parsed.end);
    if (!(
      suffix === "I8" ||
      suffix === "I16" ||
      suffix === "I32" ||
      suffix === "I64"
    )) {
      return { ok: false, error: "negative numeric prefix with suffix is not allowed" };
    }
  }

  const suffix = s.slice(parsed.end);
  const err = validateSizedInteger(parsed.raw, suffix);
  if (err) return err;

  return { ok: true, value: parsed.value };
}
