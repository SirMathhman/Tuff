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
export function replaceOperandRange(
  operands: RuntimeValue[],
  ops: string[],
  startIdx: number,
  count: number,
  replacement: RuntimeValue
): void {
  operands.splice(startIdx, count, replacement);
  ops.splice(startIdx, count - 1);
}

/**
 * Apply operand replacement considering directionality (left vs right)
 */
export function applyOperandReplacement(
  ctx: OperandResolutionCtx,
  sourceIdx: number,
  targetIdx: number,
  operand: RuntimeValue,
  isLeftSide: boolean
): void {
  if (isLeftSide) {
    const count = sourceIdx - targetIdx + 1;
    replaceOperandRange(ctx.operands, ctx.ops, targetIdx, count, operand);
  } else {
    const count = targetIdx - sourceIdx + 1;
    replaceOperandRange(ctx.operands, ctx.ops, sourceIdx, count, operand);
  }
}
