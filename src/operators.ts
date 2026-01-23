import { extractTypedInfo } from "./parser";
import type { TypedInfo } from "./parser";
import { validateUnsignedValue } from "./types";

export function findOperatorIndex(s: string): {
  index: number;
  operator: string;
} {
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
    default:
      return 0;
  }
  if (
    leftInfo.typeSize > 0 &&
    !rightStr.includes("+") &&
    !rightStr.includes("-") &&
    !rightStr.includes("*") &&
    !rightStr.includes("/")
  ) {
    const rightInfo = extractTypedInfo(rightStr);
    if (rightInfo.typeSize === leftInfo.typeSize)
      validateUnsignedValue(result, leftInfo.typeSize);
  }
  return result;
}
