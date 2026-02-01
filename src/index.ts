type Result<T, E> = { success: true; data: T } | { success: false; error: E };

type Range = { min: number | bigint; max: number | bigint; unsigned: boolean };

const TYPE_RANGES: Record<string, Range> = {
  U8: { min: 0, max: 255, unsigned: true },
  U16: { min: 0, max: 65535, unsigned: true },
  U32: { min: 0, max: 4294967295, unsigned: true },
  U64: { min: 0n, max: 18446744073709551615n, unsigned: true },
  I8: { min: -128, max: 127, unsigned: false },
  I16: { min: -32768, max: 32767, unsigned: false },
  I32: { min: -2147483648, max: 2147483647, unsigned: false },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n, unsigned: false },
};

const TYPE_ORDER: string[] = ["U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

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

function performUntypedOperation(left: number | bigint, right: number | bigint, operation: string): number | bigint {
  const left_num = left as number;
  const right_num = right as number;
  if (operation === "add") {
    return left_num + right_num;
  } else if (operation === "subtract") {
    return left_num - right_num;
  } else if (operation === "multiply") {
    return left_num * right_num;
  } else if (operation === "divide") {
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

function performOperation(left: number | bigint, right: number | bigint, leftPart: string, rightPart: string, operation: string): Result<number | bigint, string> {
  const leftType = getTypeForValue(leftPart.trim());
  const rightType = getTypeForValue(rightPart.trim());

  if (leftType === null && rightType === null) {
    return { success: true, data: performUntypedOperation(left, right, operation) };
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

function tokenizeExpression(input: string): Array<{ type: "operand" | "operator"; value: string }> {
  const tokens: Array<{ type: "operand" | "operator"; value: string }> = [];
  let current = "";
  let i = 0;

  while (i < input.length) {
    if (i < input.length - 1 && input[i] === " " && (input[i + 1] === "+" || input[i + 1] === "-" || input[i + 1] === "*" || input[i + 1] === "/") && input[i + 2] === " ") {
      if (current.trim()) {
        tokens.push({ type: "operand", value: current.trim() });
        current = "";
      }
      tokens.push({ type: "operator", value: input[i + 1] });
      i += 3;
    } else {
      current += input[i];
      i += 1;
    }
  }

  if (current.trim()) {
    tokens.push({ type: "operand", value: current.trim() });
  }

  return tokens;
}

function parseAndApplyOperation(tokens: Array<{ type: "operand" | "operator"; value: string }>, leftData: number | bigint, operatorIndex: number, opName: string): Result<number | bigint, string> {
  if (operatorIndex + 1 >= tokens.length || tokens[operatorIndex + 1].type !== "operand") {
    return { success: false, error: "Invalid expression" };
  }

  const rightResult = interpret(tokens[operatorIndex + 1].value);
  if (!rightResult.success) {
    return rightResult;
  }

  const rightData: number | bigint = (rightResult as { success: true; data: number | bigint }).data;
  return performOperation(leftData, rightData, tokens[operatorIndex - 1].value, tokens[operatorIndex + 1].value, opName);
}

function shouldStopOperatorParsing(operator: string, allowedOps: string[]): boolean {
  return !allowedOps.includes(operator);
}

function interpretMultiplyDivide(tokens: Array<{ type: "operand" | "operator"; value: string }>, startIndex: number): Result<{ value: number | bigint; nextIndex: number }, string> {
  let result = interpret(tokens[startIndex].value);

  if (!result.success) {
    return result;
  }

  let i = startIndex + 1;
  while (i < tokens.length) {
    if (tokens[i].type !== "operator") {
      return { success: false, error: "Invalid expression" };
    }

    const operator = tokens[i].value;
    if (shouldStopOperatorParsing(operator, ["*", "/"])) {
      return { success: true, data: { value: (result as { success: true; data: number | bigint }).data, nextIndex: i } };
    }

    const opName = operator === "*" ? "multiply" : "divide";
    const resultData: number | bigint = (result as { success: true; data: number | bigint }).data;
    const opResult: Result<number | bigint, string> = parseAndApplyOperation(tokens, resultData, i, opName);

    if (!opResult.success) {
      return opResult;
    }

    result = opResult;
    tokens[i + 1].value = String((result as { success: true; data: number | bigint }).data);
    i += 2;
  }

  return { success: true, data: { value: (result as { success: true; data: number | bigint }).data, nextIndex: tokens.length } };
}

function interpretAddSubtract(tokens: Array<{ type: "operand" | "operator"; value: string }>, startIndex: number): Result<number | bigint, string> {
  const mdResult = interpretMultiplyDivide(tokens, startIndex);

  if (!mdResult.success) {
    return mdResult;
  }

  let result_data: number | bigint = (mdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.value;
  let i: number = (mdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.nextIndex;

  while (i < tokens.length) {
    if (tokens[i].type !== "operator") {
      return { success: false, error: "Invalid expression" };
    }

    const operator = tokens[i].value;
    if (i + 1 >= tokens.length || tokens[i + 1].type !== "operand") {
      return { success: false, error: "Invalid expression" };
    }

    const rightMdResult = interpretMultiplyDivide(tokens, i + 1);
    if (!rightMdResult.success) {
      return rightMdResult;
    }

    const right_data: number | bigint = (rightMdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.value;
    const opName = operator === "+" ? "add" : "subtract";

    const opResult: Result<number | bigint, string> = performOperation(result_data, right_data, tokens[i - 1].value, tokens[i + 1].value, opName);

    if (!opResult.success) {
      return opResult;
    }

    result_data = (opResult as { success: true; data: number | bigint }).data;
    tokens[i + 1].value = String(result_data);
    i = (rightMdResult as { success: true; data: { value: number | bigint; nextIndex: number } }).data.nextIndex;
  }

  return { success: true, data: result_data };
}

export function interpret(input: string): Result<number | bigint, string> {
  const trimmedInput = input.trim();

  if (trimmedInput.includes(" + ") || trimmedInput.includes(" - ") || trimmedInput.includes(" * ") || trimmedInput.includes(" / ")) {
    const tokens = tokenizeExpression(trimmedInput);

    if (tokens.length >= 3 && tokens[0].type === "operand") {
      const result = interpretAddSubtract(tokens, 0);

      if (!result.success) {
        return result;
      }

      return result;
    }
  }

  for (const [typeName, range] of Object.entries(TYPE_RANGES)) {
    if (trimmedInput.endsWith(typeName)) {
      const numberStr = trimmedInput.slice(0, -typeName.length);

      if (typeName === "U64" || typeName === "I64") {
        const value = BigInt(numberStr);
        return validateNumber(value, range, typeName);
      }

      const value = Number(numberStr);
      return validateNumber(value, range, typeName);
    }
  }

  return { success: true, data: Number(trimmedInput) };
}

function getTypeForValue(value: string): string | null {
  for (const typeName of Object.keys(TYPE_RANGES)) {
    if (value.endsWith(typeName)) {
      return typeName;
    }
  }
  return null;
}


