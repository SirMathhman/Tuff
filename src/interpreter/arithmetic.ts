import type { Env } from "./types";
import { interpret } from "./interpret";
import {
  findMatchingParen,
  findTopLevel,
  findTopLevelTwoCharOp,
  isDigit,
  isIdentifierStartCode,
  isOpeningBracket,
  isClosingBracket,
  isPlusMinus,
  parseIdentifierWithFieldAccess,
  skipSpacesFrom,
} from "./shared";
import {
  parseWidthSuffix,
  splitNumberAndSuffix,
  validateWidthBig,
  validateWidthNumber,
  widthUsesNumber,
  type WidthSuffix,
} from "./numbers";

interface TopLevelComparison {
  op: string;
  idx: number;
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

function evalComparisonOp(
  left: string,
  right: string,
  op: string,
  env?: Env
): number | undefined {
  if (left === "" || right === "") return undefined;
  const lvRaw = interpret(left, env);
  const rvRaw = interpret(right, env);

  if (
    typeof lvRaw !== "number" ||
    typeof rvRaw !== "number" ||
    Number.isNaN(lvRaw as number) ||
    Number.isNaN(rvRaw as number)
  )
    throw new Error("Comparison operands must be numbers");
  const lv = lvRaw as number;
  const rv = rvRaw as number;

  function cmp(a: number, b: number, opStr: string): number {
    switch (opStr) {
      case "<=":
        return a <= b ? 1 : 0;
      case ">=":
        return a >= b ? 1 : 0;
      case "==":
        return a === b ? 1 : 0;
      case "!=":
        return a !== b ? 1 : 0;
      case "<":
        return a < b ? 1 : 0;
      case ">":
        return a > b ? 1 : 0;
    }
    return NaN;
  }

  const res = cmp(lv, rv, op);
  if (Number.isNaN(res)) return undefined;
  return res;
}

interface TopLevelLogical {
  op: string;
  idx: number;
}

function findTopLevelLogical(s: string): TopLevelLogical | undefined {
  // prefer '||' then '&&' using shared helper
  const orRes = findTopLevelTwoCharOp(s, ["||"]);
  if (orRes) return orRes as TopLevelLogical;
  const andRes = findTopLevelTwoCharOp(s, ["&&"]);
  if (andRes) return andRes as TopLevelLogical;
  return undefined;
}

function assertNumericValue(v: unknown): void {
  if (typeof v !== "number" || Number.isNaN(v as number))
    throw new Error("Logical operands must be numbers");
}

function evalLogicalOp(
  left: string,
  right: string,
  op: string,
  env?: Env
): number | undefined {
  if (left === "" || right === "") return undefined;

  const lvRaw = interpret(left, env);
  assertNumericValue(lvRaw);
  const lv = lvRaw as number;

  if (op === "&&") {
    // short-circuit: if left is falsey (0), don't evaluate rhs
    if (lv === 0) return 0;
    const rvRaw = interpret(right, env);
    assertNumericValue(rvRaw);
    return (rvRaw as number) !== 0 ? 1 : 0;
  }

  // op === '||'
  if (lv !== 0) return 1;
  const rvRaw = interpret(right, env);
  assertNumericValue(rvRaw);
  return (rvRaw as number) !== 0 ? 1 : 0;
}

export function tryHandleUnaryNot(s: string, env?: Env): number | undefined {
  const ss = s.trim();
  if (!ss.startsWith("!")) return undefined;
  const rest = ss.slice(1).trim();
  if (rest === "") throw new Error("Missing operand for '!'");

  // grouped operand: require the group to cover the entire rest
  if (rest.startsWith("(") || rest.startsWith("{")) {
    const close = findMatchingParen(rest, 0);
    if (close !== rest.length - 1) return undefined; // not a pure unary expression
    const val = interpret(rest, env);
    assertNumericValue(val);
    return (val as number) === 0 ? 1 : 0;
  }

  // If non-group operand contains any top-level operators, decline (let binary handlers split)
  const hasTop = findTopLevel(rest, (str, i) => {
    const ch = str[i];
    if (isOpeningBracket(ch) || isClosingBracket(ch)) return undefined;
    if ("+-*/<>".includes(ch)) return true;
    return undefined;
  });
  if (hasTop !== undefined) return undefined;

  const val = interpret(rest, env);
  assertNumericValue(val);
  return (val as number) === 0 ? 1 : 0;
}

export function tryHandleBinaryOps(s: string, env?: Env): number | undefined {
  const logicalFound = findTopLevelLogical(s);
  const compFound = findTopLevelComparison(s);

  // Choose logical if present (lower precedence); otherwise use comparison
  const chosen = logicalFound
    ? {
        kind: "logical",
        op: logicalFound.op,
        idx: logicalFound.idx,
        rightStart: logicalFound.idx + 2,
      }
    : compFound
    ? {
        kind: "comparison",
        op: compFound.op,
        idx: compFound.idx,
        rightStart: compFound.idx + (compFound.op.length === 2 ? 2 : 1),
      }
    : undefined;

  if (!chosen) return undefined;

  const left = s.slice(0, chosen.idx).trim();
  const right = s.slice(chosen.rightStart).trim();
  if (chosen.kind === "logical")
    return evalLogicalOp(left, right, chosen.op, env);
  return evalComparisonOp(left, right, chosen.op, env);
}

export function tryHandleAddition(s: string, env?: Env): number | undefined {
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

const SUFFIX_CHARS = new Set(["U", "u", "I", "i"]);
const OPERATOR_CHARS = new Set(["+", "-", "*", "/"]);

function isSuffixChar(ch: string): boolean {
  return SUFFIX_CHARS.has(ch);
}

function isOperator(ch: string): boolean {
  return OPERATOR_CHARS.has(ch);
}

interface ParseResult {
  token: string;
  next: number;
}

function at(s: string, pos: number, pred: (ch: string) => boolean): boolean {
  return pos < s.length && pred(s[pos]);
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
  return { token: s.slice(start, j).trim(), next: j } as ParseResult;
}

// eslint-disable-next-line complexity
interface TokenParseResult {
  token: string;
  next: number;
}

function makeTokenFromRange(s: string, start: number, endInclusive: number): TokenParseResult {
  return { token: s.slice(start, endInclusive + 1).trim(), next: endInclusive + 1 };
}

function tryParseBracketAt(s: string, idx: number): TokenParseResult | undefined {
  if (!isOpeningBracket(s[idx])) return undefined;
  const close = findMatchingParen(s, idx);
  if (close < 0) return undefined;
  return makeTokenFromRange(s, idx, close);
}

function parseUnaryDerefAt(s: string, i: number, n: number): TokenParseResult | undefined {
  let k = i + 1;
  while (k < n && s[k] === " ") k++;
  if (k >= n) return undefined;
  const bracket = tryParseBracketAt(s, k);
  if (bracket) return makeTokenFromRange(s, i, bracket.next - 1);
  if (isIdentifierStartCode(s.charCodeAt(k))) {
    const j = parseIdentifierWithFieldAccess(s, k);
    return { token: s.slice(i, j).trim(), next: j };
  }
  return undefined;
}

function parseIdentifierOrCallAt(s: string, i: number, n: number): TokenParseResult | undefined {
  const j = parseIdentifierWithFieldAccess(s, i);
  let k = j;
  while (k < n && s[k] === " ") k++;
  if (k < n && s[k] === "(") {
    const close = findMatchingParen(s, k);
    if (close < 0) return undefined;
    return makeTokenFromRange(s, i, close);
  }
  return { token: s.slice(i, j).trim(), next: j };
}

function parseOperandAt(s: string, i: number, n: number): TokenParseResult | undefined {
    const bracket = tryParseBracketAt(s, i);
    if (bracket) return bracket;
  if (s[i] === "*") return parseUnaryDerefAt(s, i, n);
  if (isIdentifierStartCode(s.charCodeAt(i))) return parseIdentifierOrCallAt(s, i, n);

  const res = parseNumberTokenAt(s, i);
  if (!res) return undefined;
  return { token: res.token, next: res.next };
}

function tokenizeAddSub(s: string): string[] | undefined {
  let i = skipSpacesFrom(s, 0);
  const n = s.length;
  const tokens: string[] = [];
  let expectNumber = true;

  while (i < n) {
    i = skipSpacesFrom(s, i);
    if (expectNumber) {
      const op = parseOperandAt(s, i, n);
      if (!op) return undefined;
      tokens.push(op.token);
      i = op.next;
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
  const accRaw = interpret(tokens[0], env);
  if (typeof accRaw !== "number") throw new Error("Operands must be numbers");
  let acc = accRaw as number;
  for (let idx = 1; idx < tokens.length; idx += 2) {
    const op = tokens[idx];
    const operand = tokens[idx + 1];
    const valRaw = interpret(operand, env);
    if (typeof valRaw !== "number") throw new Error("Operands must be numbers");
    const val = valRaw as number;
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
