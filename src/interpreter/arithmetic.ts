import type { Env } from "./types";
import { interpret } from "./interpret";
import {
  findMatchingParen,
  findTopLevel,
  isDigit,
  isIdentifierStartCode,
  isOpeningBracket,
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
  if (typeof lvRaw !== "number" || typeof rvRaw !== "number")
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

export function tryHandleComparison(s: string, env?: Env): number | undefined {
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
function tokenizeAddSub(s: string): string[] | undefined {
  let i = skipSpacesFrom(s, 0);
  const n = s.length;
  const tokens: string[] = [];
  let expectNumber = true;

  while (i < n) {
    i = skipSpacesFrom(s, i);
    if (expectNumber) {
      if (isOpeningBracket(s[i])) {
        const close = findMatchingParen(s, i);
        if (close < 0) return undefined;
        tokens.push(s.slice(i, close + 1).trim());
        i = close + 1;
      } else if (isIdentifierStartCode(s.charCodeAt(i))) {
        // parse identifier tokens as operands, including field access (dots)
        const j = parseIdentifierWithFieldAccess(s, i);
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
