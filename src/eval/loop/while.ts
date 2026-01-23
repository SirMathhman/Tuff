import { type Result, ok, err } from "../../core/result";
import { type TuffError } from "../../core/error";
import { type VariableEntry } from "../variables-types";
import { type LoopEvaluator } from "./loop-common";
import { syncMutableVars, findClosingParen, findMatchingBrace } from "./loop-utils";

const MAX_ITERATIONS = 10000;

function parseWhileCondition(
  expr: string,
): Result<{ condStart: number; condEnd: number }, TuffError> {
  const whileIdx = expr.indexOf("while");
  if (whileIdx === -1) {
    return err({
      cause: "While keyword not found",
      context: expr,
      reason: "Expected while expression",
      fix: "Use 'while (condition) body' syntax",
    });
  }

  const openParen = expr.indexOf("(", whileIdx + 5);
  if (openParen === -1) {
    return err({
      cause: "Missing condition",
      context: expr,
      reason: "While loop must have condition in parentheses",
      fix: "Add (condition) after while",
    });
  }

  const closeParen = findClosingParen(expr, openParen);

  if (closeParen === -1) {
    return err({
      cause: "Missing closing parenthesis",
      context: expr,
      reason: "While condition must be enclosed in parentheses",
      fix: "Add ) after condition",
    });
  }

  return ok({ condStart: openParen + 1, condEnd: closeParen });
}

function parseWhileBody(
  expr: string,
  bodyStart: number,
): { body: string; bodyEnd: number } {
  const remaining = expr.substring(bodyStart).trim();

  if (remaining.startsWith("{")) {
    const bodyEnd = findMatchingBrace(remaining, "{", "}");
    const body = remaining.substring(1, bodyEnd).trim();
    const actualBodyEnd =
      bodyStart +
      remaining.length -
      remaining.trimStart().length +
      bodyEnd +
      1;
    return { body, bodyEnd: actualBodyEnd };
  }

  let semiIdx = remaining.indexOf(";");
  if (semiIdx === -1) semiIdx = remaining.length;
  const body = remaining.substring(0, semiIdx).trim();
  const actualBodyEnd =
    bodyStart + remaining.length - remaining.trimStart().length + semiIdx;
  return { body, bodyEnd: actualBodyEnd };
}

function syncMutableVarsFromIteration(
  iterationVars: Map<string, VariableEntry>,
  loopVars: Map<string, VariableEntry>,
): void {
  syncMutableVars(iterationVars, loopVars);
}

function syncMutableVarsToParent(
  loopVars: Map<string, VariableEntry>,
  vars: Map<string, VariableEntry>,
): void {
  syncMutableVars(loopVars, vars);
}

function executeWhileLoop(
  condition: string,
  body: string,
  loopVars: Map<string, VariableEntry>,
  evaluator: LoopEvaluator,
): Result<number, TuffError> {
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations = iterations + 1;

    const condEval = evaluator(condition, loopVars);
    if (!condEval.ok) return condEval;

    if (condEval.value === 0) break;

    const iterationVars = new Map(loopVars);
    const needsSemi = !body.trim().endsWith(";");
    const bodyExpr = needsSemi ? body + ";" : body;
    const bodyEval = evaluator(bodyExpr, iterationVars);
    if (!bodyEval.ok) return bodyEval;

    syncMutableVarsFromIteration(iterationVars, loopVars);
  }

  if (iterations >= MAX_ITERATIONS) {
    return err({
      cause: "Maximum iterations exceeded",
      context: body,
      reason: "While loop ran for too many iterations",
      fix: "Check loop condition",
    });
  }

  return ok(0);
}

export function parseWhile(
  expr: string,
  vars: Map<string, VariableEntry>,
  evaluator: LoopEvaluator,
): Result<number, TuffError> {
  const condResult = parseWhileCondition(expr);
  if (!condResult.ok) return condResult;

  const { condStart, condEnd } = condResult.value;
  const condition = expr.substring(condStart, condEnd).trim();

  const { body } = parseWhileBody(expr, condEnd + 1);

  if (!body || body.trim() === "") {
    return err({
      cause: "Empty while body",
      context: expr,
      reason: "While loop must have a body",
      fix: "Add statements to the while loop body",
    });
  }

  const loopVars = new Map(vars);
  const result = executeWhileLoop(condition, body, loopVars, evaluator);
  if (!result.ok) return result;

  syncMutableVarsToParent(loopVars, vars);
  return ok(0);
}
