import { extractTypedInfo } from "../parser";
import type { TypedInfo } from "../parser";
import { validateUnsignedValue, extractTypeSize } from "../type-utils";
import { getStructField, isStructInstance } from "../types/structs";
import {
  getArrayElement,
  getArrayMetadata,
  isArrayInstance,
  getStringLength,
  isStringInstance,
} from "../utils/array";
import { getPointerTarget } from "../handlers/pointer-operations";
import {
  findFieldAccessOperator,
  findArrayIndexOperator,
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

  const fieldAccess = findFieldAccessOperator(s);
  if (fieldAccess) return { index: fieldAccess.index, operator: "." };

  const arrayIndex = findArrayIndexOperator(s);
  if (arrayIndex) return { index: arrayIndex.index, operator: "[" };

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
  scope?: Map<string, number>,
): number {
  let result = 0;
  const resolvePointerValue = (): number | undefined => {
    if (!scope) return undefined;
    const targetVar = getPointerTarget(left);
    if (!targetVar) return undefined;
    if (!scope.has(targetVar)) {
      throw new Error(`pointer target '${targetVar}' not found`);
    }
    return scope.get(targetVar);
  };

  switch (op) {
    case ".": {
      // Field access operator
      const resolvedPointerValue = resolvePointerValue();
      const arrayValue = isArrayInstance(left) ? left : resolvedPointerValue;
      if (arrayValue !== undefined && isArrayInstance(arrayValue)) {
        const meta = getArrayMetadata(arrayValue);
        if (!meta) throw new Error("array metadata missing");
        if (rightStr === "length" || rightStr === "init") {
          result = meta.initialized;
          break;
        }
        throw new Error(`cannot access '${rightStr}' on array value`);
      }
      const stringValue = isStringInstance(left)
        ? left
        : resolvedPointerValue && isStringInstance(resolvedPointerValue)
          ? resolvedPointerValue
          : undefined;
      if (stringValue !== undefined && isStringInstance(stringValue)) {
        if (rightStr === "length") {
          const len = getStringLength(stringValue);
          result = len !== undefined ? len : 0;
          break;
        }
        throw new Error(`cannot access '${rightStr}' on string value`);
      }
      const structValue = isStructInstance(left) ? left : resolvedPointerValue;
      if (!structValue || !isStructInstance(structValue)) {
        throw new Error(`cannot access field on non-struct value`);
      }
      result = getStructField(structValue, rightStr);
      break;
    }
    case "[": {
      // Array indexing operator
      const resolvedPointerValue = resolvePointerValue();
      const arrayValue = isArrayInstance(left) ? left : resolvedPointerValue;
      if (!arrayValue || !isArrayInstance(arrayValue)) {
        throw new Error(`cannot index non-array value`);
      }
      const element = getArrayElement(arrayValue, right);
      if (element === undefined) {
        throw new Error(`array index ${right} out of bounds`);
      }
      result = element;
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
