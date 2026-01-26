import { isBreakException } from "./loop";
import { findClosingParenthesis, parseLoopBody, skipSpaces } from "./helpers";
import { getLoopCore, type HandlerParams, type LoopCore } from "./types";
import { callInterpreter } from "../types/interpreter";

function parseWhileCondition(
  trimmed: string,
): { conditionStr: string; bodyStartIdx: number } | undefined {
  let idx = 5;
  idx = skipSpaces(trimmed, idx);
  if (idx >= trimmed.length || trimmed[idx] !== "(") return undefined;
  const condEnd = findClosingParenthesis(trimmed, idx);
  if (condEnd === -1) return undefined;
  return {
    conditionStr: trimmed.slice(idx + 1, condEnd),
    bodyStartIdx: condEnd + 1,
  };
}

type WhileContext = LoopCore;

function executeWhileLoop(
  conditionStr: string,
  loopBody: string,
  ctx: WhileContext,
): void {
  for (;;) {
    if (callInterpreter(ctx, conditionStr) === 0) break;
    try {
      callInterpreter(ctx, loopBody);
    } catch (e) {
      if (isBreakException(e)) throw e;
      throw e;
    }
  }
}

function handleAfterWhileExpression(
  whileExprEnd: number,
  trimmed: string,
  ctx: WhileContext,
): number {
  const afterWhileExpr = trimmed.slice(whileExprEnd).trim();
  return afterWhileExpr ? callInterpreter(ctx, afterWhileExpr) : 0;
}

function handleWhileLoopExecution(
  conditionStr: string,
  loopBody: string,
  whileExprEnd: number,
  trimmed: string,
  ctx: WhileContext,
): number {
  try {
    executeWhileLoop(conditionStr, loopBody, ctx);
  } catch (e) {
    if (isBreakException(e)) return e.value;
    throw e;
  }
  return handleAfterWhileExpression(whileExprEnd, trimmed, ctx);
}

export function handleWhile(params: HandlerParams): number | undefined {
  const trimmed = params.s.trim();
  if (!trimmed.startsWith("while")) return undefined;
  const core = getLoopCore(params);
  const parsed = parseWhileCondition(trimmed);
  if (!parsed) return undefined;
  const { conditionStr, bodyStartIdx } = parsed;
  const bodyResult = parseLoopBody(trimmed, bodyStartIdx);
  if (!bodyResult) return undefined;
  const ctx: WhileContext = {
    scope: core.scope,
    typeMap: core.typeMap,
    mutMap: core.mutMap,
    uninitializedSet: core.uninitializedSet,
    unmutUninitializedSet: core.unmutUninitializedSet,
    interpreter: core.interpreter,
    visMap: core.visMap,
  };
  return handleWhileLoopExecution(
    conditionStr,
    bodyResult.body,
    bodyResult.nextIdx,
    trimmed,
    ctx,
  );
}
