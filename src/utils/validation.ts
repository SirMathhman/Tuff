import { type Result, ok, err } from "../core/result";
import { type TuffError, makeError } from "../core/error";

const ARITHMETIC_OPS = new Set(["+", "-", "*", "/"]);
const LOGICAL_OPS = new Set(["||" , "&&"]);
const COMPARISON_OPS = new Set(["==", "!=", "<", ">", "<=", ">="]);

export function isArithmeticOperator(op: string): boolean {
  return ARITHMETIC_OPS.has(op);
}

function isLogicalOperator(op: string): boolean {
  return LOGICAL_OPS.has(op);
}

export function isComparisonOperator(op: string): boolean {
  return COMPARISON_OPS.has(op);
}

function isOperator(token: string): boolean {
  return (
    isArithmeticOperator(token) ||
    isLogicalOperator(token) ||
    isComparisonOperator(token)
  );
}

function makeBooleanTypeError(op: string, operatorType: string): TuffError {
  return makeError(
    "Type error",
    `Operator: ${op}, Type: Bool`,
    `Cannot use ${operatorType} operators on boolean types`,
    `Use logical operators (||, &&) for booleans instead`,
  );
}

export function checkOperatorTypeCompat(
  op: string,
  suffix: string,
): Result<void, TuffError> {
  const isNonBoolOp = isArithmeticOperator(op) || isComparisonOperator(op);
  if (isNonBoolOp && suffix === "Bool") {
    const opType = isArithmeticOperator(op) ? "arithmetic" : "comparison";
    return err(makeBooleanTypeError(op, opType));
  }

  if (isLogicalOperator(op) && suffix !== "Bool") {
    return err(
      makeError(
        "Type error",
        `Operator: ${op}, Type: ${suffix}`,
        "Cannot use logical operators on numeric types",
        `Use arithmetic operators (+, -, *, /) for numeric types instead`,
      ),
    );
  }

  return ok(undefined);
}

export function createMixedSuffixError(
  commonSuffix: string,
  foundSuffix: string,
): TuffError {
  return makeError(
    "Mixed type suffixes",
    `Common: ${commonSuffix}, Found: ${foundSuffix}`,
    "Cannot mix different type suffixes in expression",
    `Use the same suffix for all numbers (e.g., all U8 or all I32)`,
  );
}

export function isOperatorToken(token: string): boolean {
  return isOperator(token);
}

export function updateDepth(ch: string, currentDepth: number): number {
  if (ch === "(" || ch === "{") return currentDepth + 1;
  if (ch === ")" || ch === "}") return currentDepth - 1;
  return currentDepth;
}
