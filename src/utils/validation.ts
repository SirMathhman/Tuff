import { type Result, ok, err } from "../core/result";
import { type TuffError, makeError } from "../core/error";

export function isArithmeticOperator(op: string): boolean {
  return op === "+" || op === "-" || op === "*" || op === "/";
}

function isLogicalOperator(op: string): boolean {
  return op === "||" || op === "&&";
}

function isOperator(token: string): boolean {
  return isArithmeticOperator(token) || isLogicalOperator(token);
}

export function checkOperatorTypeCompat(
  op: string,
  suffix: string,
): Result<void, TuffError> {
  if (isArithmeticOperator(op) && suffix === "Bool") {
    return err(
      makeError(
        "Type error",
        `Operator: ${op}, Type: Bool`,
        "Cannot use arithmetic operators on boolean types",
        `Use logical operators (||, &&) for booleans instead`,
      ),
    );
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

  return ok();
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
