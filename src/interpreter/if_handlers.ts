/**
 * Handlers for if statements extracted from interpretBlockInternal.
 */
import { evaluateReturningOperand, isTruthy } from "../evaluator";
import { runBody } from "./loop_handlers";
import { Env } from "../runtime/env";
import type { InterpretFn } from "../runtime/types";
import { parseControlFlowHeader } from "./control_flow_parser";

export function handleIfStatement(
  stmt: string,
  env: Env,
  interpret: InterpretFn
): boolean {
  if (!/^if\b/.test(stmt)) return false;

  const parsed = parseControlFlowHeader(stmt, {
    type: "if",
    keyword: "if",
    hasElse: true,
  });

  const condOpnd = evaluateReturningOperand(parsed.condition, env);
  if (isTruthy(condOpnd)) {
    runBody(parsed.body, env, interpret);
  } else if (parsed.elseBody) {
    runBody(parsed.elseBody, env, interpret);
  }

  return true;
}
