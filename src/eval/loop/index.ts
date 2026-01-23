import { type Result, ok, err } from "../../core/result";
import { type TuffError } from "../../core/error";
import { type VariableEntry } from "../variables-types";
import {
  parseLoopBlock,
  validateBreakStatement,
  processLoopStatement,
  splitLoopStatements,
} from "./loop-helpers";
import { syncMutableVars } from "./loop-utils";

const MAX_ITERATIONS = 10000;

function processLoopBody(
  body: string,
  loopVars: Map<string, VariableEntry>,
  evaluator: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
): Result<number, TuffError> {
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations = iterations + 1;
    const iterationVars = new Map(loopVars);
    const statements = splitLoopStatements(body);

    for (let i = 0; i < statements.length; i = i + 1) {
      const stmt = statements[i];
      if (stmt === undefined) continue;

      const result = processLoopStatement(stmt, iterationVars, evaluator);
      if (!result.ok) return result;

      if (result.value.shouldBreak) {
        const breakValue = result.value.breakValue;
        if (breakValue === undefined) {
          return err({
            cause: "Break without value",
            context: stmt,
            reason: "Break must return a value",
            fix: "Add expression after break",
          });
        }
        syncMutableVars(iterationVars, loopVars);
        return ok(breakValue);
      }
    }

    syncMutableVars(iterationVars, loopVars);
  }

  return err({
    cause: "Maximum iterations exceeded",
    context: body,
    reason: "Loop ran for too many iterations",
    fix: "Check break condition",
  });
}

export function parseLoop(
  expr: string,
  vars: Map<string, VariableEntry>,
  evaluator: (
    expr: string,
    vars: Map<string, VariableEntry>,
  ) => Result<number, TuffError>,
): Result<number, TuffError> {
  const blockResult = parseLoopBlock(expr);
  if (!blockResult.ok) return blockResult;

  const { bodyStart, bodyEnd } = blockResult.value;
  const body = expr.substring(bodyStart + 1, bodyEnd).trim();

  const validationResult = validateBreakStatement(body);
  if (!validationResult.ok) return validationResult;

  const loopVars = new Map(vars);
  return processLoopBody(body, loopVars, evaluator);
}
