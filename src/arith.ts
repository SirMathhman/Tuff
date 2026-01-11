import type { Result, Err } from "./result";
import type { ParsedNumber } from "./interpretHelpers";
import {
  parseLeadingNumber,
  validateSizedInteger,
  isSignedSuffix,
} from "./interpretHelpers";

// These are set by interpret.ts after both modules initialize to avoid circular imports
let _interpret:
  | ((s: string, parentEnv?: Map<string, any>) => Result<number, string>)
  | undefined = undefined;
let _evaluateBlock:
  | ((s: string, parentEnv?: Map<string, any>) => Result<number, string>)
  | undefined = undefined;

export function setInterpreterFns(
  interpretFn: (
    s: string,
    parentEnv?: Map<string, any>
  ) => Result<number, string>,
  evaluateBlockFn: (
    s: string,
    parentEnv?: Map<string, any>
  ) => Result<number, string>
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
      opnds[i] = {
        value: res,
        raw: String(res),
        end: String(res).length,
      } as ParsedNumber;
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

interface ReadOperandResult {
  parsed: ParsedNumber;
  operandFull: string;
  nextPos: number;
}

interface ThenElseParse {
  thenText: string;
  elseText: string;
  endPos: number;
}

function evaluateInnerExpression(
  inner: string,
  parentEnv?: Map<string, any>
): Result<number, string> {
  if (inner.indexOf(";") !== -1) {
    if (!_evaluateBlock) return { ok: false, error: "internal error" };
    return _evaluateBlock(inner, parentEnv);
  }
  // If the expression is an assignment or declaration, evaluate it as a block so it can
  // mutate the appropriate parent environment (if provided).
  const eqPos = findTopLevelChar(inner, 0, "=");
  if (inner.startsWith("let ") || eqPos !== -1) {
    if (!_evaluateBlock) return { ok: false, error: "internal error" };
    return _evaluateBlock(inner, parentEnv);
  }
  if (!_interpret) return { ok: false, error: "internal error" };
  return _interpret(inner, parentEnv);
}

function readGroupedAt(
  s: string,
  pos: number,
  parentEnv?: Map<string, any>
): Result<ReadOperandResult, string> {
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

  const innerRes = evaluateInnerExpression(inner, parentEnv);
  if (!innerRes.ok) return innerRes;

  const parsed: ParsedNumber = {
    value: innerRes.value,
    raw: String(innerRes.value),
    end: k + 1,
  };
  const operandEnd = findOperandEnd(s, pos + parsed.end);
  const operandFull = s.slice(pos, operandEnd).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: operandEnd } };
}

function findOperandEnd(s: string, start: number): number {
  const n = s.length;
  let j = start;
  while (j < n) {
    const ch = s[j];
    if (ch === "&" && j + 1 < n && s[j + 1] === "&") break;
    if (ch === "|" && j + 1 < n && s[j + 1] === "|") break;
    if (["+", "-", "*", "/"].includes(ch)) break;
    j++;
  }
  return j;
}

import { findMatchingParenIndex, findTopLevelChar } from "./interpretHelpers";

function isStandaloneElseAt(s: string, idx: number): boolean {
  const n = s.length;
  const before = idx - 1 < 0 ? "" : s[idx - 1];
  const after = idx + 4 >= n ? "" : s[idx + 4];
  const validBefore =
    before === "" || before === " " || before === ")" || before === "{";
  const validAfter =
    after === "" ||
    after === " " ||
    after === ";" ||
    after === ")" ||
    after === "{";
  return validBefore && validAfter;
}

function findTopLevelElse(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (depth === 0 && s.startsWith("else", i) && isStandaloneElseAt(s, i))
      return i;
  }
  return -1;
}

function evalExpr(
  src: string,
  parentEnv?: Map<string, any>
): Result<number, string> {
  if (
    src.indexOf(";") !== -1 ||
    src.startsWith("let ") ||
    findTopLevelChar(src, 0, "=") !== -1
  ) {
    if (!_evaluateBlock) return { ok: false, error: "internal error" };
    return _evaluateBlock(src, parentEnv);
  }
  if (!_interpret) return { ok: false, error: "internal error" };
  return _interpret(src, parentEnv);
}

function parseThenElse(
  s: string,
  parenEnd: number
): Result<ThenElseParse, string> {
  const n = s.length;
  const elsePos = findTopLevelElse(s, parenEnd + 1);
  if (elsePos === -1) return { ok: false, error: "invalid operand" };

  const thenText = s.slice(parenEnd + 1, elsePos).trim();
  const elseStart = elsePos + 4;
  let q = elseStart;
  while (q < n && s[q] === " ") q++;
  const endPos = findOperandEnd(s, q);
  const elseText = s.slice(q, endPos).trim();
  return { ok: true, value: { thenText, elseText, endPos } };
}

function readIfAt(
  s: string,
  pos: number,
  parentEnv?: Map<string, any>
): Result<ReadOperandResult, string> {
  const n = s.length;
  let i = pos + 2; // skip 'if'
  while (i < n && s[i] === " ") i++;
  if (i >= n || s[i] !== "(") return { ok: false, error: "invalid operand" };

  const j = findMatchingParenIndex(s, i);
  if (j === -1) return { ok: false, error: "unmatched parenthesis" };

  const condText = s.slice(i + 1, j).trim();

  const condRes = evalExpr(condText);
  if (!condRes.ok) return condRes as Err<string>;

  const parseRes = parseThenElse(s, j);
  if (!parseRes.ok) return parseRes as Err<string>;
  const { thenText, elseText, endPos } = parseRes.value;

  // Short-circuit: evaluate only the chosen branch so side-effects do not occur in the other
  let chosen: number;
  if (condRes.value !== 0) {
    const thenRes = evalExpr(thenText, parentEnv);
    if (!thenRes.ok) return thenRes as Err<string>;
    chosen = thenRes.value;
  } else {
    const elseRes = evalExpr(elseText, parentEnv);
    if (!elseRes.ok) return elseRes as Err<string>;
    chosen = elseRes.value;
  }
  const parsed: ParsedNumber = {
    value: chosen,
    raw: String(chosen),
    end: String(chosen).length,
  };
  const operandFull = s.slice(pos, endPos).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: endPos } };
}

function readOperandAt(
  s: string,
  pos: number,
  parentEnv?: Map<string, any>
): Result<ReadOperandResult, string> {
  const substr = s.slice(pos);

  // 'if' expression
  if (substr.startsWith("if") && (substr[2] === " " || substr[2] === "("))
    return readIfAt(s, pos, parentEnv);

  // grouped expression handled by helper
  if (substr[0] === "(" || substr[0] === "{") {
    return readGroupedAt(s, pos, parentEnv);
  }

  // direct numeric
  const direct = parseLeadingNumber(substr);
  if (!direct) return { ok: false, error: "invalid operand" };
  const operandEnd = findOperandEnd(s, pos + direct.end);
  const operandFull = s.slice(pos, operandEnd).trim();
  return {
    ok: true,
    value: { parsed: direct, operandFull, nextPos: operandEnd },
  };
}

interface Tokenized {
  operands: ParsedNumber[];
  operandStrs: string[];
  ops: string[];
}

interface OpParseResult {
  op: string;
  nextPos: number;
}

function isOperator(ch: string): boolean {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/";
}

function parseNextOperator(
  s: string,
  pos: number
): Result<OpParseResult, string> {
  const n = s.length;
  const ch = s[pos];
  if (ch === "&") {
    if (pos + 1 < n && s[pos + 1] === "&")
      return { ok: true, value: { op: "&&", nextPos: pos + 2 } };
    return { ok: false, error: "invalid operator" };
  }
  if (ch === "|") {
    if (pos + 1 < n && s[pos + 1] === "|")
      return { ok: true, value: { op: "||", nextPos: pos + 2 } };
    return { ok: false, error: "invalid operator" };
  }
  if (!isOperator(ch)) return { ok: false, error: "invalid operator" };
  return { ok: true, value: { op: ch, nextPos: pos + 1 } };
}

function parseTokens(
  s2: string,
  parentEnv?: Map<string, any>
): Result<Tokenized, string> {
  const n2 = s2.length;
  let pos2 = 0;

  function skipSpaces2(): void {
    while (pos2 < n2 && s2[pos2] === " ") pos2++;
  }

  const operands2: ParsedNumber[] = [];
  const operandStrs2: string[] = [];
  const ops2: string[] = [];

  skipSpaces2();
  while (pos2 < n2) {
    const readRes = readOperandAt(s2, pos2, parentEnv);
    if (!readRes.ok) return readRes;
    const { parsed, operandFull, nextPos } = readRes.value;

    const err = validateParsedOperand(parsed, operandFull);
    if (err) return err;

    operands2.push(parsed);
    operandStrs2.push(operandFull);

    pos2 = nextPos;
    skipSpaces2();

    if (pos2 >= n2) break;

    const opParseRes = parseNextOperator(s2, pos2);
    if (!opParseRes.ok) return opParseRes as Err<string>;
    const opInfo = opParseRes.value;
    ops2.push(opInfo.op);
    pos2 = opInfo.nextPos;
    skipSpaces2();
  }

  if (operands2.length === 0) return { ok: false, error: "invalid expression" };
  if (ops2.length !== operands2.length - 1)
    return { ok: false, error: "invalid expression" };

  return {
    ok: true,
    value: { operands: operands2, operandStrs: operandStrs2, ops: ops2 },
  };
}

export function tokenizeAddSub(
  s: string,
  parentEnv?: Map<string, any>
): Result<Tokenized, string> {
  return parseTokens(s, parentEnv);
}

interface FoldResult {
  foldedOperands: number[];
  foldedOps: string[];
  numericResult: number;
}

function foldAddSubToBoolSegments(
  operands: ParsedNumber[],
  ops: string[],
  commonSuffix: string
): Result<FoldResult, string> {
  const foldedOperands: number[] = [];
  const foldedOps: string[] = [];
  let cur = operands[0].value;
  for (let k = 0; k < ops.length; k++) {
    const op2 = ops[k];
    const next = operands[k + 1].value;
    if (op2 === "+" || op2 === "-") {
      cur = op2 === "+" ? cur + next : cur - next;
      if (commonSuffix) {
        const err = validateSizedInteger(String(cur), commonSuffix);
        if (err) return err;
      }
    } else if (op2 === "&&" || op2 === "||") {
      foldedOperands.push(cur);
      foldedOps.push(op2);
      cur = next;
    } else {
      return { ok: false, error: "invalid operator" };
    }
  }
  foldedOperands.push(cur);
  return { ok: true, value: { foldedOperands, foldedOps, numericResult: cur } };
}

export function handleAddSubChain(
  s: string,
  parentEnv?: Map<string, any>
): Result<number, string> {
  const tokens = tokenizeAddSub(s, parentEnv);
  if (!tokens.ok) return tokens;
  const { operands, operandStrs, ops } = tokens.value;

  const commonResult = ensureCommonSuffix(operandStrs, operands);
  if (!commonResult.ok) return commonResult;
  const commonSuffix = commonResult.value;

  const mulDivErr = processMulDiv(operands, ops, commonSuffix);
  if (mulDivErr) return mulDivErr;

  const foldRes = foldAddSubToBoolSegments(operands, ops, commonSuffix);
  if (!foldRes.ok) return foldRes as Result<number, string>;
  const { foldedOperands, foldedOps, numericResult } = foldRes.value;
  if (foldedOps.length === 0) return { ok: true, value: numericResult };

  // Evaluate precedence: '&&' before '||'
  // Build groups separated by '||', each group is an && chain
  const groups: number[][] = [];
  let curGroup: number[] = [foldedOperands[0]];
  for (let i = 0; i < foldedOps.length; i++) {
    const op = foldedOps[i];
    const nextVal = foldedOperands[i + 1];
    if (op === "&&") {
      curGroup.push(nextVal);
    } else if (op === "||") {
      groups.push(curGroup);
      curGroup = [nextVal];
    }
  }
  groups.push(curGroup);

  // Evaluate each group (&&) to a boolean, then OR the group results
  const groupTruths = groups.map((g) => g.every((v) => v !== 0));
  const finalBool = groupTruths.some((b) => b);
  const final = finalBool ? 1 : 0;
  if (commonSuffix) {
    const err = validateSizedInteger(String(final), commonSuffix);
    if (err) return err;
  }

  return { ok: true, value: final };
}

export function handleSingle(s: string): Result<number, string> {
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
