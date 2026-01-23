import { type Result, ok, err } from "../core/result";
import { type TuffError } from "../core/error";

export function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

function skipWhitespace(expr: string, pos: number): number {
  while (pos < expr.length && expr[pos] === " ") pos += 1;
  return pos;
}

export function checkIfNotStartsWith(expr: string): Result<void, TuffError> {
  if (!expr.startsWith("if")) return err(makeError("Not if", "", "", ""));
  return ok();
}

function isAtDepthZeroWithKeyword(
  expr: string,
  i: number,
  parenDepth: number,
  keyword: string,
): boolean {
  const keywordLen = keyword.length;
  return (
    parenDepth === 0 &&
    expr[i] === " " &&
    i + keywordLen + 1 < expr.length &&
    expr.substring(i + 1, i + 1 + keywordLen) === keyword &&
    expr[i + 1 + keywordLen] === " "
  );
}

export function validateIfStart(expr: string): Result<number, TuffError> {
  const check = checkIfNotStartsWith(expr);
  if (!check.ok) return check;
  const pos = skipWhitespace(expr, 2);
  if (pos >= expr.length || expr[pos] !== "(")
    return err(
      makeError(
        "Syntax error",
        "if expression",
        "Expected '(' after if",
        "Use: if (condition) then-branch else else-branch",
      ),
    );
  return ok(pos);
}

export function extractCondition(
  expr: string,
  startPos: number,
): Result<{ condition: string; pos: number }, TuffError> {
  let pos = startPos + 1,
    parenCount = 1;
  const condStart = startPos + 1;
  while (pos < expr.length && parenCount > 0) {
    if (expr[pos] === "(") parenCount = parenCount + 1;
    else if (expr[pos] === ")") parenCount = parenCount - 1;
    pos = pos + 1;
  }
  if (parenCount !== 0)
    return err(
      makeError(
        "Syntax error",
        "if condition",
        "Mismatched parentheses",
        "Ensure all parentheses are properly closed",
      ),
    );
  return ok({ condition: expr.substring(condStart, pos - 1), pos });
}

export function findElseKeyword(
  expr: string,
  startPos: number,
): Result<number, TuffError> {
  let elseIdx = -1,
    parenDepth = 0,
    nestedIfCount = 0,
    i = startPos;
  const tempPos = skipWhitespace(expr, startPos);
  if (isAtDepthZeroWithKeyword(expr, tempPos - 1, 0, "if")) nestedIfCount = 1;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === "(" || ch === "{") parenDepth += 1;
    if (ch === ")" || ch === "}") parenDepth -= 1;
    if (isAtDepthZeroWithKeyword(expr, i, parenDepth, "if")) {
      const checkPos = skipWhitespace(expr, i + 4);
      if (checkPos < expr.length && expr[checkPos] === "(") nestedIfCount += 1;
    }
    if (isAtDepthZeroWithKeyword(expr, i, parenDepth, "else")) {
      if (nestedIfCount === 0) {
        elseIdx = i;
        break;
      }
      nestedIfCount -= 1;
    }
    i += 1;
  }
  return ok(elseIdx);
}

export function extractBranches(
  expr: string,
  pos: number,
  elseIdx: number,
): Result<{ thenBranch: string; elseBranch: string }, TuffError> {
  const thenBranch = expr.substring(pos, elseIdx).trim(),
    elseBranch = expr.substring(elseIdx + 6).trim();
  if (!thenBranch)
    return err(
      makeError(
        "Syntax error",
        "if expression",
        "Empty then-branch",
        "Provide an expression after if condition",
      ),
    );
  if (!elseBranch)
    return err(
      makeError(
        "Syntax error",
        "if expression",
        "Empty else-branch",
        "Provide an expression after else",
      ),
    );
  return ok({ thenBranch, elseBranch });
}

export function evaluateIfCondition(
  expr: string,
  searchPosStart: number,
): Result<{ elseIdx: number; searchPos: number }, TuffError> {
  const searchPos = skipWhitespace(expr, searchPosStart);
  const elseResult = findElseKeyword(expr, searchPos);
  if (!elseResult.ok) return elseResult;
  const elseIdx = elseResult.value;
  if (elseIdx === -1)
    return err(
      makeError(
        "Syntax error",
        "if expression",
        "Missing 'else' clause",
        "Use: if (condition) then-branch else else-branch",
      ),
    );
  return ok({ elseIdx, searchPos });
}
