import type { Result, CompileError, Expression, TypeCheckCtx } from "./types";

interface CheckerFn {
  (
    expr: Expression,
    ctx: TypeCheckCtx,
  ): Result<string | undefined, CompileError>;
}

export function checkLogicalExpr(
  expr: Expression,
  checkFn: CheckerFn,
  ctx: TypeCheckCtx,
): Result<string | undefined, CompileError> {
  const lexpr = expr as {
    operator: string;
    left: Expression;
    right: Expression;
  };
  const leftResult = checkFn(lexpr.left, ctx);
  if (!leftResult.isOk) return leftResult;
  if (leftResult.value !== "Bool")
    return typeMismatchError(leftResult.value, "Bool", ctx.loc);
  const rightResult = checkFn(lexpr.right, ctx);
  if (!rightResult.isOk) return rightResult;
  if (rightResult.value !== "Bool")
    return typeMismatchError(rightResult.value, "Bool", ctx.loc);
  return { isOk: true, value: "Bool" };
}

export function checkNotExpr(
  expr: Expression,
  checkFn: CheckerFn,
  ctx: TypeCheckCtx,
): Result<string | undefined, CompileError> {
  const nexpr = expr as { operand: Expression };
  const operandResult = checkFn(nexpr.operand, ctx);
  if (!operandResult.isOk) return operandResult;
  if (operandResult.value !== "Bool")
    return typeMismatchError(operandResult.value, "Bool", ctx.loc);
  return { isOk: true, value: "Bool" };
}

function typeMismatchError(
  actual: string | undefined,
  expected: string,
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  return {
    isOk: false,
    error: {
      message:
        "Type mismatch: got '" +
        (actual || "unknown") +
        "' but expected '" +
        expected +
        "'",
      reason:
        actual === "Bool"
          ? "! requires a Bool operand"
          : "&& and || require Bool operands",
      suggestedFix: "Use a Bool value.",
      line: loc.line,
      column: loc.column,
    },
  };
}
