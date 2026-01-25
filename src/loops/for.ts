import { isBreakException } from "./loop";
import { findClosingParenthesis, parseLoopBody } from "./helpers";
import type { HandlerParams } from "./types";

interface RangeInfo {
  start: number;
  end: number;
}

function parseRange(rangeStr: string): RangeInfo | undefined {
  const trimmed = rangeStr.trim();
  const dotsIdx = trimmed.indexOf("..");
  if (dotsIdx === -1) return undefined;
  const startStr = trimmed.slice(0, dotsIdx).trim();
  const endStr = trimmed.slice(dotsIdx + 2).trim();
  const start = Number(startStr);
  const end = Number(endStr);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return { start, end };
}

function extractLoopVarName(varDeclStr: string): string | undefined {
  const declTokens: string[] = [];
  let currentToken = "";
  for (const ch of varDeclStr) {
    if (ch === " " || ch === ":" || ch === "\t") {
      if (currentToken) {
        declTokens.push(currentToken);
        currentToken = "";
      }
    } else {
      currentToken += ch;
    }
  }
  if (currentToken) declTokens.push(currentToken);
  if (declTokens[0] === "let") {
    return declTokens[1] === "mut" ? declTokens[2] : declTokens[1];
  }
  return undefined;
}

function findInKeywordPosition(trimmed: string, startIdx: number): number {
  for (let i = startIdx; i < trimmed.length - 1; i++) {
    if (
      trimmed[i] === " " &&
      trimmed[i + 1] === "i" &&
      trimmed[i + 2] === "n" &&
      (i + 3 >= trimmed.length ||
        trimmed[i + 3] === " " ||
        trimmed[i + 3] === "(")
    ) {
      return i + 1;
    }
  }
  return -1;
}

interface LoopContext {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  interpreter: HandlerParams["interpreter"];
}

function executeForLoop(
  range: RangeInfo,
  loopVarName: string,
  loopBody: string,
  ctx: LoopContext,
): void {
  const loopScope = new Map(ctx.scope);
  const loopTypeMap = new Map(ctx.typeMap);
  const loopMutMap = new Map(ctx.mutMap);
  const loopUninitializedSet = new Set(ctx.uninitializedSet);
  const loopUnmutUninitializedSet = new Set(ctx.unmutUninitializedSet);
  loopScope.set(loopVarName, range.start);
  loopMutMap.set(loopVarName, true);
  for (let i = range.start; i < range.end; i++) {
    loopScope.set(loopVarName, i);
    try {
      ctx.interpreter(
        loopBody,
        loopScope,
        loopTypeMap,
        loopMutMap,
        loopUninitializedSet,
        loopUnmutUninitializedSet,
      );
    } catch (e) {
      if (isBreakException(e)) throw e;
      throw e;
    }
  }
  for (const [key, value] of loopScope.entries()) {
    if (ctx.scope.has(key)) ctx.scope.set(key, value);
  }
}

function parseForLoopComponents(trimmed: string):
  | {
      varDeclStr: string;
      rangeStr: string;
      loopBody: string;
      forExprEnd: number;
    }
  | undefined {
  if (!trimmed.startsWith("for")) return undefined;
  let idx = 3;
  while (idx < trimmed.length && trimmed[idx] === " ") idx++;
  if (idx >= trimmed.length || trimmed[idx] !== "(") return undefined;
  idx++;
  const inIdx = findInKeywordPosition(trimmed, idx);
  if (inIdx === -1) return undefined;
  const varDeclStr = trimmed.slice(idx, inIdx).trim();
  idx = inIdx + 2;
  while (idx < trimmed.length && trimmed[idx] === " ") idx++;
  const rangeEnd = findClosingParenthesis(trimmed, idx - 1);
  if (rangeEnd === -1) return undefined;
  const rangeStr = trimmed.slice(idx, rangeEnd);
  const bodyResult = parseLoopBody(trimmed, rangeEnd + 1);
  if (!bodyResult) return undefined;
  return {
    varDeclStr,
    rangeStr,
    loopBody: bodyResult.body,
    forExprEnd: bodyResult.nextIdx,
  };
}

function handleAfterForExpression(
  forExprEnd: number,
  trimmed: string,
  ctx: LoopContext,
): number {
  const afterForExpr = trimmed.slice(forExprEnd).trim();
  if (afterForExpr) {
    return ctx.interpreter(
      afterForExpr,
      ctx.scope,
      ctx.typeMap,
      ctx.mutMap,
      ctx.uninitializedSet,
      ctx.unmutUninitializedSet,
    );
  }
  return 0;
}

function handleForLoopExecution(
  range: RangeInfo,
  loopVarName: string,
  loopBody: string,
  forExprEnd: number,
  trimmed: string,
  ctx: LoopContext,
): number {
  try {
    executeForLoop(range, loopVarName, loopBody, ctx);
  } catch (e) {
    if (isBreakException(e)) return e.value;
    throw e;
  }
  return handleAfterForExpression(forExprEnd, trimmed, ctx);
}

export function handleFor(params: HandlerParams): number | undefined {
  const {
    s,
    scope,
    typeMap,
    mutMap,
    interpreter,
    uninitializedSet = new Set(),
    unmutUninitializedSet = new Set(),
  } = params;
  const trimmed = s.trim();
  const parsed = parseForLoopComponents(trimmed);
  if (!parsed) return undefined;
  const { varDeclStr, rangeStr, loopBody, forExprEnd } = parsed;
  const loopVarName = extractLoopVarName(varDeclStr);
  if (!loopVarName) return undefined;
  const range = parseRange(rangeStr);
  if (!range) return undefined;
  const ctx: LoopContext = {
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter,
  };
  return handleForLoopExecution(
    range,
    loopVarName,
    loopBody,
    forExprEnd,
    trimmed,
    ctx,
  );
}
