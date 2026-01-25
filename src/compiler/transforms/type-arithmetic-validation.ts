import { isDigit, isWhitespace } from "../parsing/string-helpers";
import { getTypeRange } from "../validation/type-utils";

/**
 * Validate arithmetic operations with typed operands for overflow
 * e.g., 1U8 + 255U8 should throw because result exceeds U8 max (255)
 */
export function validateTypedArithmetic(source: string): void {
  let i = 0;

  while (i < source.length) {
    if (isDigit(source[i])) {
      const numStart = i;
      while (i < source.length && isDigit(source[i])) i++;
      const numStr = source.slice(numStart, i);

      if (i < source.length && (source[i] === "U" || source[i] === "I")) {
        const typeStart = i;
        i++;
        while (i < source.length && isDigit(source[i])) i++;
        const suffix = source.slice(typeStart, i);
        validateBinaryOpIfPresent(source, i, numStr, suffix);
      }
    } else {
      i++;
    }
  }
}

/**
 * Check if typed numeric is part of a binary operation and validate it
 */
function validateBinaryOpIfPresent(
  source: string,
  pos: number,
  leftNumStr: string,
  leftSuffix: string,
): void {
  let j = pos;
  while (j < source.length && isWhitespace(source[j])) j++;

  if (j >= source.length || !isOperator(source[j] as string)) {
    return;
  }

  const op = source[j];
  j++;
  while (j < source.length && isWhitespace(source[j])) j++;

  const negativeRight = source[j] === "-";
  if (negativeRight) {
    j++;
    while (j < source.length && isWhitespace(source[j])) j++;
  }

  if (j >= source.length || !isDigit(source[j])) {
    return;
  }

  const rightStart = j;
  while (j < source.length && isDigit(source[j])) j++;
  const rightNumStr = source.slice(rightStart, j);
  const rightNum = negativeRight ? -BigInt(rightNumStr) : BigInt(rightNumStr);

  if (
    j < source.length &&
    (source[j] === "U" || source[j] === "I") &&
    op &&
    ["+", "-", "*", "/"].includes(op)
  ) {
    const rightTypeStart = j;
    j++;
    while (j < source.length && isDigit(source[j])) j++;
    const rightSuffix = source.slice(rightTypeStart, j);

    if (leftSuffix === rightSuffix) {
      validateOperation(BigInt(leftNumStr), op, rightNum, leftSuffix);
    }
  }
}

/**
 * Check if a character is an arithmetic operator
 */
function isOperator(ch: string | undefined): boolean {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/";
}

/**
 * Validate that an arithmetic operation doesn't overflow the type
 */
function validateOperation(
  left: bigint,
  op: string,
  right: bigint,
  typeStr: string,
): void {
  let result: bigint;

  try {
    switch (op) {
      case "+":
        result = left + right;
        break;
      case "-":
        result = left - right;
        break;
      case "*":
        result = left * right;
        break;
      case "/":
        if (right === 0n) {
          throw new Error("division by zero");
        }
        result = left / right;
        break;
      default:
        return;
    }
  } catch {
    return; // Skip validation if operation fails
  }

  const range = getTypeRange(typeStr);
  if (!range) {
    return; // Unknown type, skip validation
  }

  if (result < range.min || result > range.max) {
    const operator =
      op === "+"
        ? "addition"
        : op === "-"
          ? "subtraction"
          : op === "*"
            ? "multiplication"
            : "division";
    throw new Error(
      `${operator} overflow: result ${result} exceeds ${typeStr} range (${range.min} to ${range.max})`,
    );
  }
}
