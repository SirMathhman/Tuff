import { type Result } from "../core/result";
import { type TuffError } from "../core/error";
import { type VariableEntry } from "./variables";
import { parseVariableDeclarations } from "./variables";
import {
  validateIfStart,
  extractCondition,
  extractBranches,
  evaluateIfCondition,
  checkIfNotStartsWith,
} from "./ifelse-helpers";

interface IfExpressionParams {
  exprToProcess: string;
  vars: Map<string, VariableEntry>;
  evaluateExpression: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>;
}

function evaluateIfExpression({
  exprToProcess,
  vars,
  evaluateExpression,
}: IfExpressionParams): Result<number, TuffError> {
  const check = checkIfNotStartsWith(exprToProcess);
  if (!check.ok) return check;
  const posResult = validateIfStart(exprToProcess);
  if (!posResult.ok) return posResult;
  const condResult = extractCondition(exprToProcess, posResult.value);
  if (!condResult.ok) return condResult;
  const { condition, pos } = condResult.value,
    evalCond = evaluateExpression(condition, vars);
  if (!evalCond.ok) return evalCond;
  const evalIfResult = evaluateIfCondition(exprToProcess, pos);
  if (!evalIfResult.ok) return evalIfResult;
  const { elseIdx, searchPos } = evalIfResult.value,
    branchResult = extractBranches(exprToProcess, searchPos, elseIdx);
  if (!branchResult.ok) return branchResult;
  const { thenBranch, elseBranch } = branchResult.value;
  return evalCond.value !== 0
    ? evaluateExpression(thenBranch, vars)
    : evaluateExpression(elseBranch, vars);
}

export function parseIfElseTopLevel(
  expr: string,
  vars: Map<string, VariableEntry>,
  evaluateExpression: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
): Result<number, TuffError> {
  const check = checkIfNotStartsWith(expr);
  if (!check.ok) return check;
  const parsed = parseVariableDeclarations(expr, vars, evaluateExpression);
  if (!parsed.ok) return parsed;
  const { finalExpr, vars: newVars } = parsed.value,
    trimmed = finalExpr.trim();
  return evaluateIfExpression({
    exprToProcess: trimmed,
    vars: newVars,
    evaluateExpression,
  });
}

export function parseIfElse(
  expr: string,
  vars: Map<string, VariableEntry>,
  evaluateExpression: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
): Result<number, TuffError> {
  return evaluateIfExpression({
    exprToProcess: expr,
    vars,
    evaluateExpression,
  });
}
