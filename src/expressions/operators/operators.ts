import { extractTypedInfo } from "../../parser";
import type { TypedInfo } from "../../parser";
import { validateUnsignedValue, extractTypeSize } from "../../type-utils";
import { getPointerTarget } from "../../handlers/access/pointer-operations";
import {
  findFieldAccessOperator,
  findArrayIndexOperator,
  findLogicalAnd,
  findIsOperator,
  findAddSubOperator,
  findMulDivOperator,
} from "./operator-finder";
import {
  findComparisonOperator,
  handleFieldAccessOp,
  handleIndexingOp,
} from "./op-helpers";

function isPointerValue(value: number): boolean {
  return getPointerTarget(value) !== undefined;
}

function performArithmeticOp(op: string, left: number, right: number): number {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0) throw new Error("divide by 0");
      return Math.floor(left / right);
    default:
      return 0;
  }
}

function performComparisonOp(op: string, left: number, right: number): number {
  switch (op) {
    case "<":
      return left < right ? 1 : 0;
    case ">":
      return left > right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
    case ">=":
      return left >= right ? 1 : 0;
    case "==":
      return left === right ? 1 : 0;
    case "!=":
      return left !== right ? 1 : 0;
    default:
      return 0;
  }
}

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
  const leftType = typeMap.get(leftStr) || 0;
  let rightType = extractTypeSize(rightStr);
  if (rightType === 0 && typeMap.has("__alias__" + rightStr)) {
    rightType = typeMap.get("__alias__" + rightStr) || 0;
  }
  if (rightType === 0 && typeMap.has("__union__" + rightStr)) {
    const unionTypes = (
      typeMap.get("__union__" + rightStr) as unknown as string
    ).split(",");
    return unionTypes.some((t) => leftType === Number(t)) ? 1 : 0;
  }
  return leftType === rightType ? 1 : 0;
}

function resolvePointerValue(
  left: number,
  scope?: Map<string, number>,
): number | undefined {
  if (!scope) return undefined;
  const targetVar = getPointerTarget(left);
  if (!targetVar) return undefined;
  if (!scope.has(targetVar)) {
    throw new Error(`pointer target '${targetVar}' not found`);
  }
  return scope.get(targetVar);
}

function performOperationLogic(p: {
  left: number;
  op: string;
  right: number;
  rightStr: string;
  typeMap?: Map<string, number>;
  leftStr?: string;
  scope?: Map<string, number>;
}): number {
  const resolvedPointerValue = resolvePointerValue(p.left, p.scope);
  switch (p.op) {
    case ".":
      return handleFieldAccessOp(p.left, p.rightStr, resolvedPointerValue);
    case "[":
      return handleIndexingOp(p.left, p.right, resolvedPointerValue);
    case "+":
    case "-":
    case "*":
    case "/":
      return performArithmeticOp(p.op, p.left, p.right);
    case "<":
    case ">":
    case "<=":
    case ">=":
    case "==":
    case "!=":
      return performComparisonOp(p.op, p.left, p.right);
    case "&&":
      return p.left !== 0 && p.right !== 0 ? 1 : 0;
    case "is": {
      if (!p.typeMap || !p.leftStr)
        throw new Error("invalid 'is' operator usage");
      return handleIsOperator(p.left, p.leftStr, p.rightStr, p.typeMap);
    }
    default:
      return 0;
  }
}

function shouldValidateUnsigned(
  op: string,
  leftInfo: TypedInfo,
  rightStr: string,
): boolean {
  return (
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
  );
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
  // Validate pointer arithmetic: scalar pointers cannot be used in arithmetic
  if (
    (op === "+" || op === "-" || op === "*" || op === "/") &&
    isPointerValue(left)
  ) {
    const target = getPointerTarget(left);
    if (target) {
      // Check if target variable is an array or scalar type
      const targetType = typeMap?.get(target) || 0;
      // Scalar types are positive (e.g., 32 for I32, 8 for I8)
      // If targetType > 0, it's a scalar - reject arithmetic
      if (targetType > 0) {
        throw new Error(
          `cannot perform '${op}' on pointer to scalar type '${target}'`,
        );
      }
    }
  }

  const result = performOperationLogic({
    left,
    op,
    right,
    rightStr,
    typeMap,
    leftStr,
    scope,
  });
  if (shouldValidateUnsigned(op, leftInfo, rightStr)) {
    const rightInfo = extractTypedInfo(rightStr);
    if (rightInfo.typeSize === leftInfo.typeSize)
      validateUnsignedValue(result, leftInfo.typeSize);
  }
  return result;
}
