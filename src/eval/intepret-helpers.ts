import { type Result, ok } from "../core/result";
import { type TuffError } from "../core/error";
import { parseLiteral } from "../parse/parser";
import { type VariableEntry } from "./variables";
import {
  isOperatorToken,
  isComparisonOperator,
  updateDepth,
} from "../utils/validation";

export function makeError(
  cause: string,
  context: string,
  reason: string,
  fix: string,
): TuffError {
  return { cause, context, reason, fix };
}

export function errorUndefinedToken(label: string): TuffError {
  return makeError(
    "Invalid token",
    label,
    "Token is undefined",
    "Ensure all tokens are valid",
  );
}

export function determineSuffix(
  tokens: Array<string>,
  vars: Map<string, VariableEntry>,
): Result<string, TuffError> {
  for (let i = 0; i < tokens.length; i = i + 1) {
    const token = tokens[i];
    if (!isOperatorToken(token)) {
      if (vars.has(token)) {
        const entry = vars.get(token);
        if (entry) {
          return ok(entry.suffix);
        }
      } else {
        const parsed = parseLiteral(token);
        if (!parsed.ok) return parsed;
        return ok(parsed.value.suffix);
      }
    }
  }
  return ok("");
}

export function hasComparisonOperator(tokens: Array<string>): boolean {
  for (let i = 0; i < tokens.length; i = i + 1) {
    if (isComparisonOperator(tokens[i] || "")) return true;
  }
  return false;
}

function findStatementSemicolon(expr: string): number {
  let depth = 0;
  for (let i = 0; i < expr.length; i = i + 1) {
    const ch = expr.charAt(i);
    depth = updateDepth(ch, depth);
    if (ch === ";" && depth === 0) return i;
  }
  return -1;
}

export function splitIfStatement(
  trimmedExpr: string,
): { ifPart: string; remaining: string } | undefined {
  const semicolonIdx = findStatementSemicolon(trimmedExpr);
  if (semicolonIdx === -1) return undefined;
  return {
    ifPart: trimmedExpr.substring(0, semicolonIdx).trim(),
    remaining: trimmedExpr.substring(semicolonIdx + 1).trim(),
  };
}

const LOGICAL_PAIR_CHARS = new Set(["|", "&"]);
const COMPARISON_DOUBLE_CHARS = new Set(["<", ">", "=", "!"]);
const COMPARISON_SINGLE_CHARS = new Set(["<", ">"]);

export function tokenizeExpression(expr: string): Array<string> {
  const tokens = [];
  let current = "";
  for (let i = 0; i < expr.length; i = i + 1) {
    const c = expr[i],
      nextC = i + 1 < expr.length ? expr[i + 1] : "";
    if (LOGICAL_PAIR_CHARS.has(c) && nextC === c) {
      if (current) tokens.push(current);
      tokens.push(c + c);
      current = "";
      i = i + 1;
    } else if (COMPARISON_DOUBLE_CHARS.has(c) && nextC === "=") {
      if (current) tokens.push(current);
      tokens.push(c + nextC);
      current = "";
      i = i + 1;
    } else if (COMPARISON_SINGLE_CHARS.has(c)) {
      if (current) tokens.push(current);
      tokens.push(c);
      current = "";
    } else if (c === " ") {
      if (current) tokens.push(current);
      current = "";
    } else current = current + c;
  }
  if (current) tokens.push(current);
  return tokens;
}
