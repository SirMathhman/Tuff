import { findOperatorIndex, performBinaryOp } from "./operators";
import { parseTypedNumber, extractTypedInfo } from "../../parser";
import type { ScopeContext } from "../../types/interpreter";
import { callInterpreter } from "../../types/interpreter";
import {
  toScopeContext,
  type BaseHandlerParams,
} from "../../utils/function/function-call-params";

function getRightOperand(s: string, opIndex: number, op: string): string {
  if (op === "is") return s.slice(opIndex + 3).trim();
  if (op === "&&") return s.slice(opIndex + 2).trim();
  return s.slice(opIndex + op.length).trim();
}

function handleIsOperator(
  leftStr: string,
  rightStr: string,
  ctx: ScopeContext,
): number {
  const leftValue = callInterpreter(ctx, leftStr);
  return performBinaryOp(
    leftValue,
    "is",
    0,
    extractTypedInfo(leftStr),
    rightStr,
    ctx.typeMap,
    leftStr,
    ctx.scope,
  );
}

function handleFieldAccessOperator(
  leftStr: string,
  rightStr: string,
  ctx: ScopeContext,
): number {
  const leftValue = callInterpreter(ctx, leftStr);
  return performBinaryOp(
    leftValue,
    ".",
    0,
    extractTypedInfo(leftStr),
    rightStr,
    ctx.typeMap,
    leftStr,
    ctx.scope,
  );
}

function handleArrayIndexOperator(
  leftStr: string,
  rightStr: string,
  ctx: ScopeContext,
): number {
  const leftValue = callInterpreter(ctx, leftStr);
  const indexExpr = rightStr.endsWith("]") ? rightStr.slice(0, -1) : rightStr;
  const indexValue = callInterpreter(ctx, indexExpr);
  return performBinaryOp(
    leftValue,
    "[",
    indexValue,
    extractTypedInfo(leftStr),
    rightStr,
    ctx.typeMap,
    leftStr,
    ctx.scope,
  );
}

function handleSpecialOperators(
  op: string,
  leftStr: string,
  rightStr: string,
  ctx: ScopeContext,
): number | undefined {
  if (op === "is") return handleIsOperator(leftStr, rightStr, ctx);
  if (op === ".") return handleFieldAccessOperator(leftStr, rightStr, ctx);
  if (op === "[") return handleArrayIndexOperator(leftStr, rightStr, ctx);
  return undefined;
}

function evaluateStandardBinaryOp(
  s: string,
  opIndex: number,
  op: string,
  ctx: ScopeContext,
): number {
  const leftStr = s.slice(0, opIndex).trim();
  const rightStr = getRightOperand(s, opIndex, op);
  return performBinaryOp(
    callInterpreter(ctx, leftStr),
    op,
    callInterpreter(ctx, rightStr),
    extractTypedInfo(leftStr),
    rightStr,
    ctx.typeMap,
    leftStr,
    ctx.scope,
  );
}

export function handleBinaryOperation(p: BaseHandlerParams): number {
  const { index: opIndex, operator: op } = findOperatorIndex(p.s);
  if (opIndex === -1) return parseTypedNumber(p.s);
  const ctx: ScopeContext = toScopeContext(p);
  const leftStr = p.s.slice(0, opIndex).trim();
  const rightStr = getRightOperand(p.s, opIndex, op);
  const specialResult = handleSpecialOperators(op, leftStr, rightStr, ctx);
  if (specialResult !== undefined) return specialResult;
  return evaluateStandardBinaryOp(p.s, opIndex, op, ctx);
}
