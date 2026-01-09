/**
 * Handlers for specific statement types extracted from interpretBlockInternal.
 * This module contains handlers for loop-related statements (while, for).
 */
import {
  evaluateReturningOperand,
  evaluateFlatExpression,
  isTruthy,
} from "../evaluator";
import { Env, envHas, envGet, envSet, envDelete } from "../runtime/env";
import type { InterpretFn } from "../runtime/types";
import { parseControlFlowHeader } from "./control_flow_parser";

/**
 * Extract the trailing loop body and validate presence
 */
export function extractTrailingBody(
  stmtLocal: string,
  endIdx: number,
  kind: string
): string {
  const body = stmtLocal.slice(endIdx + 1).trim();
  if (!body) throw new Error(`missing ${kind} body`);
  return body;
}

/**
 * Execute a loop/if body that may be braced or a single statement
 */
export function runBody(
  body: string,
  localEnv: Env,
  interpret: InterpretFn
): void {
  if (/^\s*\{[\s\S]*\}\s*$/.test(body)) {
    const inner = body.replace(/^\{\s*|\s*\}$/g, "");
    interpret(inner, localEnv);
  } else {
    interpret(body + ";", localEnv);
  }
}

/**
 * Handle while loop statement
 * Returns true if the statement was handled
 */
export function handleWhileStatement(
  stmt: string,
  localEnv: Env,
  interpret: InterpretFn
): boolean {
  if (!/^while\b/.test(stmt)) return false;

  const parsed = parseControlFlowHeader(stmt, {
    type: "while",
    keyword: "while",
    hasElse: false,
  });
  const cond = parsed.condition;
  const body = parsed.body;

  while (true) {
    const condOpnd = evaluateReturningOperand(cond, localEnv);
    if (!isTruthy(condOpnd)) break;
    runBody(body, localEnv, interpret);
  }
  return true;
}

/**
 * Handle for loop statement
 * Returns true if the statement was handled
 */
export function handleForStatement(
  stmt: string,
  localEnv: Env,
  interpret: InterpretFn
): boolean {
  if (!/^for\b/.test(stmt)) return false;

  const parsed = parseControlFlowHeader(stmt, {
    type: "for",
    keyword: "for",
    hasElse: false,
  });
  const cond = parsed.condition;
  const body = parsed.body;

  // cond should be: let [mut] <name> in <start>.. <end>
  const m = cond.match(/^let\s+(mut\s+)?([a-zA-Z_]\w*)\s+in\s+([\s\S]+)$/);
  if (!m) throw new Error("invalid for loop header");
  const mutFlag = !!m[1];
  const iterName = m[2];
  const rangeExpr = m[3].trim();
  const rm = rangeExpr.match(/^([\s\S]+?)\s*\.\.\s*([\s\S]+)$/);
  if (!rm) throw new Error("invalid for range expression");
  const startExpr = rm[1].trim();
  const endExpr = rm[2].trim();

  const startVal = evaluateFlatExpression(startExpr, localEnv);
  const endVal = evaluateFlatExpression(endExpr, localEnv);

  const hadPrev = envHas(localEnv, iterName);
  const prev = hadPrev ? envGet(localEnv, iterName) : undefined;

  for (let i = startVal; i < endVal; i++) {
    // bind the loop variable in the same env so body can see and update outer vars
    if (mutFlag) envSet(localEnv, iterName, { mutable: true, value: i });
    else envSet(localEnv, iterName, i);

    runBody(body, localEnv, interpret);
  }

  // restore previous binding
  if (hadPrev) envSet(localEnv, iterName, prev);
  else envDelete(localEnv, iterName);

  return true;
}
