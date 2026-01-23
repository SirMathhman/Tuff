import { type Result, ok, err } from "../../core/result";
import { type TuffError } from "../../core/error";
import { type VariableEntry } from "../variables-types";
import { processLoopStatement as processStmt } from "./loop-break";
import { findIfBreak } from "./loop-ifbreak";
import { type LoopEvaluator, type BreakResult } from "./loop-common";

export interface BreakException {
  type: "break";
  value: number;
}

export function createBreakException(value: number): BreakException {
  return { type: "break", value };
}

export function isBreakException(obj: unknown): obj is BreakException {
  return (
    typeof obj === "object" &&
    obj !== undefined &&
    "type" in obj &&
    obj.type === "break"
  );
}

export function parseLoopBlock(
  expr: string,
): Result<{ bodyStart: number; bodyEnd: number }, TuffError> {
  const loopStart = expr.indexOf("loop");
  if (loopStart === -1) {
    return err({
      cause: "Loop keyword not found",
      context: expr,
      reason: "Expected loop expression",
      fix: "Use 'loop { ... }' syntax",
    });
  }

  const bodyStartIdx = expr.indexOf("{", loopStart + 4);
  if (bodyStartIdx === -1) {
    return err({
      cause: "Missing opening brace",
      context: expr,
      reason: "Loop body must be enclosed in braces",
      fix: "Add { before loop body",
    });
  }

  const bodyEndIdx = findMatchingBrace(expr, bodyStartIdx);
  if (bodyEndIdx === -1) {
    return err({
      cause: "Missing closing brace",
      context: expr,
      reason: "Loop body must be enclosed in braces",
      fix: "Add } after loop body",
    });
  }

  return ok({ bodyStart: bodyStartIdx, bodyEnd: bodyEndIdx });
}

function findMatchingBrace(expr: string, start: number): number {
  let depth = 0;
  for (let i = start; i < expr.length; i = i + 1) {
    const ch = expr.charAt(i);
    if (ch === "{") depth = depth + 1;
    if (ch === "}") {
      depth = depth - 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function validateBreakStatement(body: string): Result<void, TuffError> {
  if (body.indexOf("break") === -1) {
    return err({
      cause: "Loop without break statement",
      context: body,
      reason: "Infinite loop detected",
      fix: "Add break statement with value",
    });
  }
  return ok(undefined);
}

export function processLoopStatement(
  stmt: string,
  vars: Map<string, VariableEntry>,
  evaluator: LoopEvaluator,
): BreakResult {
  return processStmt(stmt, vars, evaluator, findIfBreak);
}

export function splitLoopStatements(body: string): Array<string> {
  const statements: Array<string> = [];
  let currentStmt = "";
  let depth = 0;

  for (let i = 0; i < body.length; i = i + 1) {
    const ch = body.charAt(i);

    if (ch === "{" || ch === "(") depth = depth + 1;
    if (ch === "}" || ch === ")") depth = depth - 1;

    if (ch === ";" && depth === 0) {
      const trimmed = currentStmt.trim();
      if (trimmed) statements.push(trimmed);
      currentStmt = "";
    } else {
      currentStmt = currentStmt + ch;
    }
  }

  const trimmed = currentStmt.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}
