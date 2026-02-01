import { Result, Range, TYPE_RANGES, TYPE_ORDER, isPointerType, getBaseType } from "./types";

function isInRange(value: number | bigint, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

function getWiderType(leftType: string, rightType: string): string | null {
  if (leftType === rightType) {
    return leftType;
  }
  const leftIndex = TYPE_ORDER.indexOf(leftType);
  const rightIndex = TYPE_ORDER.indexOf(rightType);
  if (leftIndex === -1 || rightIndex === -1) {
    return null;
  }
  return leftIndex > rightIndex ? leftType : rightType;
}

function getRangeExceededError(typeName: string, prefix: string = "Number"): string {
  const rangeInfo = TYPE_RANGES[typeName];
  return prefix + " exceeds " + typeName + " range (" + rangeInfo.min + "-" + rangeInfo.max + ")";
}

function validateNumber(value: number | bigint, range: Range, typeName: string): Result<number | bigint, string> {
  if (range.unsigned && (typeof value === "number" ? value < 0 : value < 0n)) {
    return { success: false, error: "Negative numbers cannot have " + typeName + " suffix" };
  }

  if (!isInRange(value, range)) {
    return { success: false, error: getRangeExceededError(typeName) };
  }

  return { success: true, data: value };
}

function checkOperationRange(result: number | bigint, typeName: string, operation: string = "Operation"): Result<number | bigint, string> {
  if (!isInRange(result, TYPE_RANGES[typeName])) {
    return { success: false, error: getRangeExceededError(typeName, operation) };
  }
  return { success: true, data: result };
}

function getCommonTypeForOperation(leftType: string | null, rightType: string | null, operation: string): { commonType: string | null; error: string | null } {
  if (leftType === null && rightType === null) {
    return { commonType: null, error: null };
  }

  if (leftType === null || rightType === null) {
    return { commonType: null, error: "Cannot " + operation + " typed and untyped numbers together" };
  }

  const commonType = getWiderType(leftType, rightType);
  if (commonType === null) {
    return { commonType: null, error: "Cannot " + operation + " different types together" };
  }

  return { commonType, error: null };
}

function performUntypedOperation(left: number | bigint, right: number | bigint, operation: string): number | bigint | null {
  const left_num = left as number;
  const right_num = right as number;
  if (operation === "add") {
    return left_num + right_num;
  } else if (operation === "subtract") {
    return left_num - right_num;
  } else if (operation === "multiply") {
    return left_num * right_num;
  } else if (operation === "divide") {
    if (right_num === 0) {
      return null;
    }
    return left_num / right_num;
  }
  return 0;
}

function resolveCommonType(leftType: string | null, rightType: string | null, operation: string): { commonType: string | null; errorResult: Result<number | bigint, string> | null } {
  const typeCheck = getCommonTypeForOperation(leftType, rightType, operation);
  if (typeCheck.error) {
    return { commonType: null, errorResult: { success: false, error: typeCheck.error } };
  }

  const commonType = typeCheck.commonType;
  if (commonType === null) {
    return { commonType: null, errorResult: { success: false, error: "Invalid type" } };
  }

  return { commonType, errorResult: null };
}

function addNumbers(left: number | bigint, right: number | bigint, typeName: string): Result<number | bigint, string> {
  if ((typeof left === "bigint") !== (typeof right === "bigint")) {
    return { success: false, error: "Cannot add number and bigint together" };
  }

  const sum = (typeof left === "bigint")
    ? (left as bigint) + (right as bigint)
    : (left as number) + (right as number);

  return checkOperationRange(sum, typeName, "Addition");
}

export function canCoerceType(sourceType: string, targetType: string): boolean {
  if (sourceType === targetType) {
    return true;
  }

  // Handle pointer types - allow coercion if pointer depths and base types match
  const sourceIsPointer = isPointerType(sourceType);
  const targetIsPointer = isPointerType(targetType);

  if (sourceIsPointer && targetIsPointer) {
    // Both are pointers - they must have same base type
    const sourceBase = getBaseType(sourceType);
    const targetBase = getBaseType(targetType);
    return sourceBase === targetBase;
  }

  if (sourceIsPointer || targetIsPointer) {
    // One is pointer, one is not - cannot coerce
    return false;
  }

  // Handle regular numeric types
  const sourceIndex = TYPE_ORDER.indexOf(sourceType);
  const targetIndex = TYPE_ORDER.indexOf(targetType);

  if (sourceIndex === -1 || targetIndex === -1) {
    return false;
  }

  const sourceRange = TYPE_RANGES[sourceType];
  const targetRange = TYPE_RANGES[targetType];

  if (sourceRange.unsigned !== targetRange.unsigned) {
    return false;
  }

  return targetIndex > sourceIndex;
}

export function getTypeForValue(value: string): string | null {
  for (const typeName of Object.keys(TYPE_RANGES)) {
    if (value.endsWith(typeName)) {
      return typeName;
    }
  }
  return null;
}

export function performOperation(left: number | bigint, right: number | bigint, leftPart: string, rightPart: string, operation: string): Result<number | bigint, string> {
  const leftType = getTypeForValue(leftPart.trim());
  const rightType = getTypeForValue(rightPart.trim());

  if (leftType === null && rightType === null) {
    const untypedResult = performUntypedOperation(left, right, operation);
    if (untypedResult === null) {
      return { success: false, error: "Cannot divide by zero" };
    }
    return { success: true, data: untypedResult };
  }

  const typeResolve = resolveCommonType(leftType, rightType, operation);
  if (typeResolve.errorResult) {
    return typeResolve.errorResult;
  }

  const commonType = typeResolve.commonType as string;

  if (operation === "add") {
    return addNumbers(left, right, commonType);
  }

  if ((typeof left === "bigint") !== (typeof right === "bigint")) {
    return { success: false, error: "Cannot perform " + operation + " on number and bigint together" };
  }

  if (operation === "divide") {
    if ((typeof right === "bigint" ? right === 0n : right === 0)) {
      return { success: false, error: "Cannot divide by zero" };
    }
  }

  let result_value: number | bigint;
  if (operation === "subtract") {
    result_value = (typeof left === "bigint")
      ? (left as bigint) - (right as bigint)
      : (left as number) - (right as number);
  } else if (operation === "multiply") {
    result_value = (typeof left === "bigint")
      ? (left as bigint) * (right as bigint)
      : (left as number) * (right as number);
  } else if (operation === "divide") {
    result_value = (typeof left === "bigint")
      ? (left as bigint) / (right as bigint)
      : (left as number) / (right as number);
  } else {
    return { success: false, error: "Unknown operation: " + operation };
  }

  return checkOperationRange(result_value, commonType, operation);
}

export { isInRange, validateNumber, getWiderType };
