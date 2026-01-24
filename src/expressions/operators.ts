import { extractTypedInfo } from "../parser";
import type { TypedInfo } from "../parser";
import { validateUnsignedValue, extractTypeSize } from "../type-utils";
import { getStructField, isStructInstance } from "../types/structs";
import {
  findFieldAccessOperator,
  findLogicalAnd,
  findIsOperator,
  findComparisonOperator,
  findAddSubOperator,
  findMulDivOperator,
} from "./operator-finder";

export function findOperatorIndex(s: string): {
  index: number;
  operator: string;
} {
  // Check in order of precedence (lowest to highest)
  const fieldAccess = findFieldAccessOperator(s);
  if (fieldAccess) return { index: fieldAccess.index, operator: "." };

  const logicalAnd = findLogicalAnd(s);
  if (logicalAnd) return { index: logicalAnd.index, operator: "&&" };

  const isOp = findIsOperator(s);
  if (isOp) return { index: isOp.index, operator: "is" };

  const comparison = findComparisonOperator(s);
  if (comparison)
    return { index: comparison.index, operator: comparison.operator };

  const addSub = findAddSubOperator(s);
  if (addSub) return { index: addSub.index, operator: addSub.operator };

  const mulDiv = findMulDivOperator(s);
  if (mulDiv) return { index: mulDiv.index, operator: mulDiv.operator };

  return { index: -1, operator: "" };
}

function handleIsOperator(
  left: number,
  leftStr: string,
  rightStr: string,
  typeMap: Map<string, number>,
): number {
  // Get the type of the left operand
  const leftType = typeMap.get(leftStr) || 0;
  // Extract the expected type from rightStr (e.g., "I32", "U8", "Bool", or alias)
  let rightType = extractTypeSize(rightStr);
  // Check if it's a type alias
  if (rightType === 0 && typeMap.has("__alias__" + rightStr)) {
    rightType = typeMap.get("__alias__" + rightStr) || 0;
  }
  // Check if it's a union type
  if (rightType === 0 && typeMap.has("__union__" + rightStr)) {
    const unionTypes = (
      typeMap.get("__union__" + rightStr) as unknown as string
    ).split(",");
    return unionTypes.some((t) => leftType === Number(t)) ? 1 : 0;
  }
  return leftType === rightType ? 1 : 0;
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
    case ".": {
      // Field access operator
      if (!isStructInstance(left)) {
        throw new Error(`cannot access field on non-struct value`);
      }
      result = getStructField(left, rightStr);
      break;
    }
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
    case "&&":
      result = left !== 0 && right !== 0 ? 1 : 0;
      break;
    case "is": {
      if (!typeMap || !leftStr) throw new Error("invalid 'is' operator usage");
      result = handleIsOperator(left, leftStr, rightStr, typeMap);
      break;
    }
    default:
      return 0;
  }
  if (
    op !== "is" &&
    op !== "." &&
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
