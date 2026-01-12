import type { Env } from "./types";
import { interpret } from "./interpret";
import {
  ensureCloseParen,
  ensureExists,
  ensureNonEmptyPair,
  findMatchingParen,
  isWhitespace,
  sliceTrimRange,
  startsWithIf,
} from "./shared";

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
  return { cond, thenPart, elsePart } as IfParts;
}

export function tryHandleIfExpression(
  s: string,
  env?: Env
): number | undefined {
  const ss = s.trim();
  if (!startsWithIf(ss)) return undefined;
  const { cond, thenPart, elsePart } = parseIfParts(ss);
  ensureNonEmptyPair(thenPart, elsePart, "Invalid if expression branches");
  const condValRaw = interpret(cond, env);
  if (typeof condValRaw !== "number") throw new Error("If condition must be numeric");
  const condVal = condValRaw as number;
  if (condVal !== 0) {
    const res = interpret(thenPart, env);
    if (typeof res !== "number") throw new Error("If branch must return number");
    return res as number;
  }
  const res = interpret(elsePart, env);
  if (typeof res !== "number") throw new Error("If branch must return number");
  return res as number;
}
