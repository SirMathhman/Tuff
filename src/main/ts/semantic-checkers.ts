import type {
  Result,
  CompileError,
  Expression,
  VarEntry,
  StructDef,
  TypeAliasDef,
} from "./types";

interface CheckerFn {
  (
    expr: Expression,
    scope: VarEntry[],
    structs: StructDef[],
    aliases: TypeAliasDef[],
    loc: { line: number; column: number },
  ): Result<string | undefined, CompileError>;
}

export function checkLogicalExpr(
  expr: Expression,
  checkFn: CheckerFn,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const lexpr = expr as {
    operator: string;
    left: Expression;
    right: Expression;
  };
  const leftResult = checkFn(lexpr.left, scope, structs, aliases, loc);
  if (!leftResult.isOk) return leftResult;
  if (leftResult.value !== "Bool")
    return typeMismatchError(leftResult.value, "Bool", loc);
  const rightResult = checkFn(lexpr.right, scope, structs, aliases, loc);
  if (!rightResult.isOk) return rightResult;
  if (rightResult.value !== "Bool")
    return typeMismatchError(rightResult.value, "Bool", loc);
  return { isOk: true, value: "Bool" };
}

export function checkNotExpr(
  expr: Expression,
  checkFn: CheckerFn,
  scope: VarEntry[],
  structs: StructDef[],
  aliases: TypeAliasDef[],
  loc: { line: number; column: number },
): Result<string | undefined, CompileError> {
  const nexpr = expr as { operand: Expression };
  const operandResult = checkFn(nexpr.operand, scope, structs, aliases, loc);
  if (!operandResult.isOk) return operandResult;
  if (operandResult.value !== "Bool")
    return typeMismatchError(operandResult.value, "Bool", loc);
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
