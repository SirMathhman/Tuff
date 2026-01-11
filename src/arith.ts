import type { Result, Err } from "./result";
import type { ParsedNumber } from "./interpretHelpers";
import {
  parseLeadingNumber,
  validateSizedInteger,
  isSignedSuffix,
} from "./interpretHelpers";
import type { ReadOperandResult } from "./arithOperandReaders";
import {
  readGroupedAt,
  readIfAt,
  readMatchAt,
  findOperandEnd,
} from "./arithOperandReaders";

// Local binding type to match what interpret.ts uses
interface BindingType {
  value: number;
  suffix?: string;
  assigned?: boolean;
  mutable?: boolean;
}
// These are set by interpret.ts after both modules initialize to avoid circular imports
let _interpret:
  | ((
      s: string,
      parentEnv?: Map<string, BindingType>
    ) => Result<number, string>)
  | undefined = undefined;
let _evaluateBlock:
  | ((
      s: string,
      parentEnv?: Map<string, BindingType>
    ) => Result<number, string>)
  | undefined = undefined;
export function setInterpreterFns(
  interpretFn: (
    s: string,
    parentEnv?: Map<string, BindingType>
  ) => Result<number, string>,
  evaluateBlockFn: (
    s: string,
    parentEnv?: Map<string, BindingType>
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
import { findTopLevelChar } from "./interpretHelpers";
import { parseComparisonOp, applyComparisonOp } from "./operators";

function evalExpr<T extends BindingType>(
  src: string,
  parentEnv?: Map<string, T>
): Result<number, string> {
  const eqPos = findTopLevelChar(src, 0, "=");
  const isAssignment =
    eqPos !== -1 &&
    !(
      (eqPos - 1 >= 0 && src[eqPos - 1] === "=") ||
      (eqPos + 1 < src.length && src[eqPos + 1] === "=")
    );

  if (src.indexOf(";") !== -1 || src.startsWith("let ") || isAssignment) {
    if (!_evaluateBlock) return { ok: false, error: "internal error" };
    return _evaluateBlock(src, parentEnv);
  }
  if (!_interpret) return { ok: false, error: "internal error" };
  return _interpret(src, parentEnv);
}

import { tryReadFunctionCallAt } from "./functionHelpers";

function readOperandAt<T extends BindingType>(
  s: string,
  pos: number,
  parentEnv?: Map<string, T>
): Result<ReadOperandResult, string> {
  const substr = s.slice(pos);

  // 'if' expression
  if (substr.startsWith("if") && (substr[2] === " " || substr[2] === "("))
    return readIfAt(s, pos, parentEnv, evalExpr);

  // 'match' expression
  if (substr.startsWith("match") && (substr[5] === " " || substr[5] === "("))
    return readMatchAt(s, pos, parentEnv, evalExpr);

  // grouped expression handled by helper
  if (substr[0] === "(" || substr[0] === "{") {
    return readGroupedAt(s, pos, parentEnv, evalExpr);
  }

  const fnRes = tryReadFunctionCallAt(
    s,
    pos,
    parentEnv as unknown as Map<string, BindingType>,
    (src: string, env?: Map<string, unknown>) =>
      evalExpr(src, env as unknown as Map<string, BindingType>),
    _evaluateBlock
  );
  if (fnRes !== undefined) {
    if (!fnRes.ok) return fnRes as Err<string>;
    return fnRes;
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
  // comparisons: <, >, <=, >=, ==, !=
  // comparison operator parsing delegated to operators.ts
  // parseComparisonOp returns undefined if not a comparison
  const cmp = parseComparisonOp(s, pos);
  if (cmp) return { ok: true, value: cmp };

  if (!isOperator(ch)) return { ok: false, error: "invalid operator" };
  return { ok: true, value: { op: ch, nextPos: pos + 1 } };
}

function parseTokens<T extends BindingType>(
  s2: string,
  parentEnv?: Map<string, T>
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

export function tokenizeAddSub<T extends BindingType>(
  s: string,
  parentEnv?: Map<string, T>
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
    } else if (
      op2 === "<" ||
      op2 === ">" ||
      op2 === "<=" ||
      op2 === ">=" ||
      op2 === "==" ||
      op2 === "!="
    ) {
      cur = applyComparisonOp(op2, cur, next);
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

export function handleAddSubChain<T extends BindingType>(
  s: string,
  parentEnv?: Map<string, T>
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
export { handleSingle } from "./simpleHandlers";
