import { extractTypedInfo } from "./parser";
import type { TypedInfo } from "./parser";
import { validateUnsignedValue, extractTypeSize } from "./types";

export function findOperatorIndex(s: string): {
  index: number;
  operator: string;
} {
  // Check for 'is' operator (lowest precedence, after comparisons)
  for (let i = s.length - 1; i >= 1; i--) {
    if (
      s[i - 1] === " " &&
      s[i] === "i" &&
      s[i + 1] === "s" &&
      (i + 2 >= s.length || s[i + 2] === " ")
    ) {
      const prev = s[i - 2];
      if (
        prev &&
        ((prev >= "0" && prev <= "9") ||
          prev === ")" ||
          prev === "}" ||
          (prev >= "a" && prev <= "z") ||
          (prev >= "A" && prev <= "Z") ||
          prev === "_")
      ) {
        return { index: i - 1, operator: "is" };
      }
    }
  }

  // Check for comparison operators first (lower precedence than arithmetic)
  for (let i = s.length - 1; i >= 1; i--) {
    const twoChar = s.slice(i - 1, i + 1);

    // Check for <=, >=, ==, !=
    if (
      twoChar === "<=" ||
      twoChar === ">=" ||
      twoChar === "==" ||
      twoChar === "!="
    ) {
      const prev = s[i - 2];
      if (
        !prev ||
        (prev >= "0" && prev <= "9") ||
        prev === " " ||
        prev === ")" ||
        prev === "}"
      ) {
        return { index: i - 1, operator: twoChar };
      }
    }

    // Check for single char comparisons
    const ch = s[i];
    if (ch === "<" || ch === ">") {
      const nextCh = s[i + 1];
      // Make sure it's not <= or >=
      if (nextCh !== "=" && nextCh !== ">") {
        const prev = s[i - 1];
        if (
          prev &&
          ((prev >= "0" && prev <= "9") ||
            prev === " " ||
            prev === ")" ||
            prev === "}")
        ) {
          return { index: i, operator: ch };
        }
      }
    }
  }

  for (let i = s.length - 1; i >= 1; i--) {
    const ch = s[i];
    if (ch === "+" || ch === "-") {
      const prev = s[i - 1];
      if (
        prev &&
        ((prev >= "0" && prev <= "9") || prev === " " || prev === ")")
      ) {
        return { index: i, operator: ch };
      }
    }
  }

  for (let i = s.length - 1; i >= 1; i--) {
    const ch = s[i];
    if (ch === "*" || ch === "/") {
      const prev = s[i - 1];
      if (
        prev &&
        ((prev >= "0" && prev <= "9") || prev === " " || prev === ")")
      ) {
        return { index: i, operator: ch };
      }
    }
  }

  return { index: -1, operator: "" };
}

export function performBinaryOp(
  left: number,
  op: string,
  right: number,
  leftInfo: TypedInfo,
  rightStr: string,
  typeMap?: Map<string, number>,
  leftStr?: string,
): number {
  let result = 0;
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
      if (right === 0) throw new Error("divide by 0");
      result = Math.floor(left / right);
      break;
    case "<":
      result = left < right ? 1 : 0;
      break;
    case ">":
      result = left > right ? 1 : 0;
      break;
    case "<=":
      result = left <= right ? 1 : 0;
      break;
    case ">=":
      result = left >= right ? 1 : 0;
      break;
    case "==":
      result = left === right ? 1 : 0;
      break;
    case "!=":
      result = left !== right ? 1 : 0;
      break;
    case "is": {
      if (!typeMap || !leftStr) throw new Error("invalid 'is' operator usage");
      // Get the type of the left operand
      const leftType = typeMap.get(leftStr) || 0;
      // Extract the expected type from rightStr (e.g., "I32", "U8", "Bool")
      const rightType = extractTypeSize(rightStr);
      result = leftType === rightType ? 1 : 0;
      break;
    }
    default:
      return 0;
  }
  if (
    op !== "is" &&
    leftInfo.typeSize > 0 &&
    !rightStr.includes("+") &&
    !rightStr.includes("-") &&
    !rightStr.includes("*") &&
    !rightStr.includes("/") &&
    !rightStr.includes("<") &&
    !rightStr.includes(">") &&
    !rightStr.includes("=")
  ) {
    const rightInfo = extractTypedInfo(rightStr);
    if (rightInfo.typeSize === leftInfo.typeSize)
      validateUnsignedValue(result, leftInfo.typeSize);
  }
  return result;
}
