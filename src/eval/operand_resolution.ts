/**
 * Unified operand resolution framework for expression evaluation.
 * Eliminates duplicated search and replacement patterns.
 */
import type { RuntimeValue } from "../types";

export interface OperandResolutionCtx {
  operands: RuntimeValue[];
  ops: string[];
  currentIndex: number;
}

export interface OperandResolutionResult {
  foundIndex: number;
  isLeft: boolean;
  operand: RuntimeValue;
}

interface RangeReplacement {
  operands: RuntimeValue[];
  ops: string[];
  startIdx: number;
  count: number;
  replacement: RuntimeValue;
}

interface DirectionalReplacement {
  ctx: OperandResolutionCtx;
  sourceIdx: number;
  targetIdx: number;
  operand: RuntimeValue;
  isLeftSide: boolean;
}

/**
 * Find an operand matching a predicate, searching bidirectionally from current position
 */
export function findOperandMatching(
  ctx: OperandResolutionCtx,
  predicate: (v: RuntimeValue) => boolean
): OperandResolutionResult | undefined {
  // Search backward from current position
  for (let j = ctx.currentIndex - 1; j >= 0; j--) {
    if (ctx.operands[j] !== undefined && predicate(ctx.operands[j])) {
      return {
        foundIndex: j,
        isLeft: true,
        operand: ctx.operands[j],
      };
    }
  }

  // Search forward from current position
  for (let j = ctx.currentIndex + 1; j < ctx.operands.length; j++) {
    if (ctx.operands[j] !== undefined && predicate(ctx.operands[j])) {
      return {
        foundIndex: j,
        isLeft: false,
        operand: ctx.operands[j],
      };
    }
  }

  return undefined;
}

/**
 * Replace a range of operands with a single replacement value
 */
export function replaceOperandRange(params: RangeReplacement): void {
  const { operands, ops, startIdx, count, replacement } = params;
  operands.splice(startIdx, count, replacement);
  ops.splice(startIdx, count - 1);
}

/**
 * Apply operand replacement considering directionality (left vs right)
 */
export function applyOperandReplacement(params: DirectionalReplacement): void {
  const { ctx, sourceIdx, targetIdx, operand, isLeftSide } = params;
  if (isLeftSide) {
    const count = sourceIdx - targetIdx + 1;
    replaceOperandRange({
      operands: ctx.operands,
      ops: ctx.ops,
      startIdx: targetIdx,
      count,
      replacement: operand,
    });
  } else {
    const count = targetIdx - sourceIdx + 1;
    replaceOperandRange({
      operands: ctx.operands,
      ops: ctx.ops,
      startIdx: sourceIdx,
      count,
      replacement: operand,
    });
  }
}
