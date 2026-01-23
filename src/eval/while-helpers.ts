import { type Result } from "../core/result";
import { type TuffError } from "../core/error";
import { type VariableEntry } from "./variables-types";
import { parseWhile } from "./loop/while";
import { findClosingParen, findMatchingBrace } from "./loop/loop-utils";

export function findWhileEnd(expr: string): number {
  const whileIdx = expr.indexOf("while");
  const openParen = expr.indexOf("(", whileIdx + 5);

  const closeParen = findClosingParen(expr, openParen);

  const afterCondition = closeParen + 1;
  const remaining = expr.substring(afterCondition);
  const trimmed = remaining.trimStart();
  const whitespace = remaining.length - trimmed.length;

  if (trimmed.startsWith("{")) {
    const braceEnd = findMatchingBrace(trimmed, "{", "}");
    return afterCondition + whitespace + braceEnd + 1;
  }

  const semiIdx = trimmed.indexOf(";");
  if (semiIdx === -1) return expr.length;
  return afterCondition + whitespace + semiIdx + 1;
}

export function handleWhileExpression(
  trimmedExpr: string,
  newVars: Map<string, VariableEntry>,
  evaluateExpression: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
): Result<number, TuffError> {
  const whileResult = parseWhile(trimmedExpr, newVars, evaluateExpression);
  if (!whileResult.ok) return whileResult;

  const whileEnd = findWhileEnd(trimmedExpr);
  const remaining = trimmedExpr.substring(whileEnd).trim();

  if (remaining && remaining !== ";") {
    if (remaining.startsWith(";")) {
      return evaluateExpression(remaining.substring(1).trim(), newVars);
    }
    return evaluateExpression(remaining, newVars);
  }

  return whileResult;
}
