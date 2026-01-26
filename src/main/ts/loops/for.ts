import { isBreakException } from "./loop";
import { findClosingParenthesis, parseLoopBody, skipSpaces } from "./helpers";
import { getLoopCore, type HandlerParams, type LoopCore } from "./types";
import {
  parseRange,
  parseArrayIdentifier,
  extractLoopVarName,
  findInKeywordPosition,
  type RangeInfo,
  type ArrayInfo,
} from "./for-parsing";

type LoopContext = LoopCore;

function createLoopScope(ctx: LoopContext): {
  loopScope: Map<string, number>;
  loopTypeMap: Map<string, number>;
  loopMutMap: Map<string, boolean>;
  loopUninitializedSet: Set<string>;
  loopUnmutUninitializedSet: Set<string>;
} {
  return {
    loopScope: new Map(ctx.scope),
    loopTypeMap: new Map(ctx.typeMap),
    loopMutMap: new Map(ctx.mutMap),
    loopUninitializedSet: new Set(ctx.uninitializedSet),
    loopUnmutUninitializedSet: new Set(ctx.unmutUninitializedSet),
  };
}

function executeLoopIteration(
  loopVarName: string,
  value: number,
  loopBody: string,
  loopScope: Map<string, number>,
  loopTypeMap: Map<string, number>,
  loopMutMap: Map<string, boolean>,
  loopUninitializedSet: Set<string>,
  loopUnmutUninitializedSet: Set<string>,
  ctx: LoopContext,
): void {
  loopScope.set(loopVarName, value);
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

function updateOuterScope(
  loopScope: Map<string, number>,
  ctx: LoopContext,
): void {
  for (const [key, value] of loopScope.entries()) {
    if (ctx.scope.has(key)) ctx.scope.set(key, value);
  }
}

function executeGenericForLoop(
  iterable: number[] | { start: number; end: number },
  loopVarName: string,
  loopBody: string,
  ctx: LoopContext,
): void {
  const {
    loopScope,
    loopTypeMap,
    loopMutMap,
    loopUninitializedSet,
    loopUnmutUninitializedSet,
  } = createLoopScope(ctx);
  loopMutMap.set(loopVarName, true);

  if (Array.isArray(iterable)) {
    for (const value of iterable) {
      executeLoopIteration(
        loopVarName,
        value,
        loopBody,
        loopScope,
        loopTypeMap,
        loopMutMap,
        loopUninitializedSet,
        loopUnmutUninitializedSet,
        ctx,
      );
    }
  } else {
    for (let i = iterable.start; i < iterable.end; i++) {
      executeLoopIteration(
        loopVarName,
        i,
        loopBody,
        loopScope,
        loopTypeMap,
        loopMutMap,
        loopUninitializedSet,
        loopUnmutUninitializedSet,
        ctx,
      );
    }
  }

  updateOuterScope(loopScope, ctx);
}

function executeForLoop(
  range: RangeInfo,
  loopVarName: string,
  loopBody: string,
  ctx: LoopContext,
): void {
  executeGenericForLoop(range, loopVarName, loopBody, ctx);
}

function executeForArrayLoop(
  arrayInfo: ArrayInfo,
  loopVarName: string,
  loopBody: string,
  ctx: LoopContext,
): void {
  executeGenericForLoop(arrayInfo.values, loopVarName, loopBody, ctx);
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
  idx = skipSpaces(trimmed, idx);
  if (idx >= trimmed.length || trimmed[idx] !== "(") return undefined;
  idx++;
  const inIdx = findInKeywordPosition(trimmed, idx);
  if (inIdx === -1) return undefined;
  const varDeclStr = trimmed.slice(idx, inIdx).trim();
  idx = inIdx + 2;
  idx = skipSpaces(trimmed, idx);
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
  range: RangeInfo | undefined,
  arrayInfo: ArrayInfo | undefined,
  loopVarName: string,
  loopBody: string,
  forExprEnd: number,
  trimmed: string,
  ctx: LoopContext,
): number | undefined {
  try {
    if (arrayInfo) {
      executeForArrayLoop(arrayInfo, loopVarName, loopBody, ctx);
    } else if (range) {
      executeForLoop(range, loopVarName, loopBody, ctx);
    } else {
      return undefined;
    }
  } catch (e) {
    if (isBreakException(e)) return e.value;
    throw e;
  }
  return handleAfterForExpression(forExprEnd, trimmed, ctx);
}

export function handleFor(params: HandlerParams): number | undefined {
  const trimmed = params.s.trim();
  const parsed = parseForLoopComponents(trimmed);
  if (!parsed) return undefined;
  const { varDeclStr, rangeStr, loopBody, forExprEnd } = parsed;
  const loopVarName = extractLoopVarName(varDeclStr);
  if (!loopVarName) return undefined;

  const ctx: LoopContext = getLoopCore(params);

  // Try parsing as array first
  const arrayInfo = parseArrayIdentifier(rangeStr, ctx.scope);
  if (arrayInfo) {
    return handleForLoopExecution(
      undefined,
      arrayInfo,
      loopVarName,
      loopBody,
      forExprEnd,
      trimmed,
      ctx,
    );
  }

  // Fall back to range parsing
  const range = parseRange(rangeStr);
  if (!range) return undefined;

  return handleForLoopExecution(
    range,
    undefined,
    loopVarName,
    loopBody,
    forExprEnd,
    trimmed,
    ctx,
  );
}
