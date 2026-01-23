import { type Result, ok, err } from "../../core/result";
import { type TuffError } from "../../core/error";
import { type VariableEntry } from "../variables-types";
import {
  extractValueExpression,
  type LoopEvaluator,
  type BreakResult,
} from "./loop-common";

function findBreakValue(stmt: string): {
  hasBreak: boolean;
  valueExpr: string;
} {
  const breakIdx = stmt.indexOf("break");
  if (breakIdx === -1) return { hasBreak: false, valueExpr: "" };

  const afterBreak = stmt.substring(breakIdx + 5).trim();
  const valueExpr = extractValueExpression(afterBreak);

  return { hasBreak: true, valueExpr };
}

function handleIfBreak(
  ifBreakCheck: { hasIf: boolean; condition: string; breakValue: string },
  stmt: string,
  vars: Map<string, VariableEntry>,
  evaluator: LoopEvaluator,
): BreakResult {
  const condResult = evaluator(ifBreakCheck.condition, vars);
  if (!condResult.ok) return condResult;

  if (condResult.value !== 0) {
    if (!ifBreakCheck.breakValue) {
      return err({
        cause: "Break without value",
        context: stmt,
        reason: "Break statement must have return value",
        fix: "Add expression after break",
      });
    }
    const valueResult = evaluator(ifBreakCheck.breakValue, vars);
    if (!valueResult.ok) return valueResult;
    return ok({ shouldBreak: true, breakValue: valueResult.value });
  }
  return ok({ shouldBreak: false });
}

function handleRegularBreak(
  trimmed: string,
  valueExpr: string,
  vars: Map<string, VariableEntry>,
  evaluator: LoopEvaluator,
): BreakResult {
  const beforeBreak = trimmed.substring(0, trimmed.indexOf("break")).trim();
  if (beforeBreak) {
    const beforeResult = evaluator(beforeBreak + ";", vars);
    if (!beforeResult.ok) return beforeResult;
  }

  if (!valueExpr) {
    return err({
      cause: "Break without value",
      context: trimmed,
      reason: "Break statement must have return value",
      fix: "Add expression after break",
    });
  }

  const valueResult = evaluator(valueExpr, vars);
  if (!valueResult.ok) return valueResult;

  return ok({ shouldBreak: true, breakValue: valueResult.value });
}

export function processLoopStatement(
  stmt: string,
  vars: Map<string, VariableEntry>,
  evaluator: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
  findIfBreak: (stmt: string) => {
    hasIf: boolean;
    condition: string;
    breakValue: string;
  },
): Result<{ shouldBreak: boolean; breakValue?: number }, TuffError> {
  const trimmed = stmt.trim();
  const ifBreakCheck = findIfBreak(trimmed);
  if (ifBreakCheck.hasIf) {
    return handleIfBreak(ifBreakCheck, stmt, vars, evaluator);
  }

  const { hasBreak, valueExpr } = findBreakValue(trimmed);
  if (!hasBreak) {
    if (trimmed) {
      const evalResult = evaluator(trimmed + ";", vars);
      if (!evalResult.ok) return evalResult;
    }
    return ok({ shouldBreak: false });
  }

  return handleRegularBreak(trimmed, valueExpr, vars, evaluator);
}
