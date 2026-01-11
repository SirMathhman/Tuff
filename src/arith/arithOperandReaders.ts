import type { Result, Err } from "../helpers/result";
import type { ParsedNumber } from "../parsers/interpretHelpers";
import { findMatchingParenIndex } from "../parsers/interpretHelpers";
import { findTopLevelElseInString } from "../control/ifHelpers";
import {
  parseMatchArms,
  evaluateMatchArms,
  findMatchingBraceIndex,
} from "../control/matchHelpers";

// Keep in sync with arith.ts' binding shape
interface BindingType {
  value: number;
  suffix?: string;
  assigned?: boolean;
  mutable?: boolean;
}

export interface ReadOperandResult {
  parsed: ParsedNumber;
  operandFull: string;
  nextPos: number;
}

interface ThenElseParse {
  thenText: string;
  elseText: string;
  endPos: number;
}

interface ParenInner {
  inner: string;
  end: number;
}

type ParentEnv<T extends BindingType> = Map<string, T> | undefined;
type EvalExpr<T extends BindingType> = (
  src: string,
  env?: Map<string, T>
) => Result<number, string>;

function findOperandEnd(s: string, start: number): number {
  const n = s.length;
  let j = start;
  while (j < n) {
    const ch = s[j];
    if (ch === "&" && j + 1 < n && s[j + 1] === "&") break;
    if (ch === "|" && j + 1 < n && s[j + 1] === "|") break;
    if (["+", "-", "*", "/", "<", ">"].includes(ch)) break;
    if (ch === "=" && j + 1 < n && s[j + 1] === "=") break;
    if (ch === "!" && j + 1 < n && s[j + 1] === "=") break;
    j++;
  }
  return j;
}

function parseThenElse(
  s: string,
  parenEnd: number
): Result<ThenElseParse, string> {
  const n = s.length;
  const elsePos = findTopLevelElseInString(s, parenEnd + 1);
  if (elsePos === -1) return { ok: false, error: "invalid operand" };

  const thenText = s.slice(parenEnd + 1, elsePos).trim();
  let q = elsePos + 4;
  while (q < n && s[q] === " ") q++;
  const endPos = findOperandEnd(s, q);
  const elseText = s.slice(q, endPos).trim();
  return { ok: true, value: { thenText, elseText, endPos } };
}

function parseParenInner(
  s: string,
  pos: number,
  kwLen: number
): Result<ParenInner, string> {
  let i = pos + kwLen;
  while (i < s.length && s[i] === " ") i++;
  if (i >= s.length || s[i] !== "(")
    return { ok: false, error: "invalid operand" };

  const j = findMatchingParenIndex(s, i);
  if (j === -1) return { ok: false, error: "unmatched parenthesis" };

  return { ok: true, value: { inner: s.slice(i + 1, j).trim(), end: j } };
}

export function readGroupedAt<T extends BindingType>(
  s: string,
  pos: number,
  parentEnv: ParentEnv<T>,
  evalExpr: EvalExpr<T>
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
  const innerRes = evalExpr(inner, parentEnv);
  if (!innerRes.ok) return innerRes as Err<string>;

  const parsed: ParsedNumber = {
    value: innerRes.value,
    raw: String(innerRes.value),
    end: k + 1,
  };
  const operandEnd = findOperandEnd(s, pos + parsed.end);
  const operandFull = s.slice(pos, operandEnd).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: operandEnd } };
}

export function readIfAt<T extends BindingType>(
  s: string,
  pos: number,
  parentEnv: ParentEnv<T>,
  evalExpr: EvalExpr<T>
): Result<ReadOperandResult, string> {
  const parsedParen = parseParenInner(s, pos, 2);
  if (!parsedParen.ok) return parsedParen as Err<string>;
  const { inner: condText, end: j } = parsedParen.value;

  const condRes = evalExpr(condText, parentEnv);
  if (!condRes.ok) return condRes as Err<string>;

  const parseRes = parseThenElse(s, j);
  if (!parseRes.ok) return parseRes as Err<string>;
  const { thenText, elseText, endPos } = parseRes.value;

  const chosenText = condRes.value !== 0 ? thenText : elseText;
  const chosenTrim = chosenText.trim();
  if (chosenTrim === "break") return { ok: false, error: "break" };
  if (chosenTrim === "continue") return { ok: false, error: "continue" };

  const chosenRes = evalExpr(chosenText, parentEnv);
  if (!chosenRes.ok) return chosenRes as Err<string>;

  const parsed: ParsedNumber = {
    value: chosenRes.value,
    raw: String(chosenRes.value),
    end: String(chosenRes.value).length,
  };
  const operandFull = s.slice(pos, endPos).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: endPos } };
}

export function readMatchAt<T extends BindingType>(
  s: string,
  pos: number,
  parentEnv: ParentEnv<T>,
  evalExpr: EvalExpr<T>
): Result<ReadOperandResult, string> {
  const n = s.length;

  const parsedParenSubj = parseParenInner(s, pos, 5);
  if (!parsedParenSubj.ok) return parsedParenSubj as Err<string>;
  const { inner: subjText, end: j } = parsedParenSubj.value;

  const subjRes = evalExpr(subjText, parentEnv);
  if (!subjRes.ok) return subjRes as Err<string>;
  const subjVal = subjRes.value;

  let k = j + 1;
  while (k < n && s[k] === " ") k++;
  if (k >= n || s[k] !== "{") return { ok: false, error: "invalid operand" };

  const m = findMatchingBraceIndex(s, k);
  if (m === -1) return { ok: false, error: "unmatched brace in match" };
  const inner = s.slice(k + 1, m);

  const armsRes = parseMatchArms(inner);
  if (!armsRes.ok) return armsRes as Err<string>;
  const evalRes = evaluateMatchArms(
    armsRes.value,
    subjVal,
    parentEnv,
    (expr: string) => evalExpr(expr, parentEnv)
  );
  if (!evalRes.ok) return evalRes as Err<string>;

  const chosenVal = evalRes.value;
  const parsed: ParsedNumber = {
    value: chosenVal,
    raw: String(chosenVal),
    end: String(chosenVal).length,
  };
  const operandFull = s.slice(pos, m + 1).trim();
  return { ok: true, value: { parsed, operandFull, nextPos: m + 1 } };
}

export { findOperandEnd };
