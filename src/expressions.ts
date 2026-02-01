import { Result, VariableScope } from "./types";
import { performOperation } from "./operators";
import { getInterpret, getInterpretStatementBlock } from "./lazy";

// Helper to evaluate an operand, handling dereference operator (*var)
function evaluateOperand(operand: string, scope: VariableScope | null): Result<number | bigint, string> {
  const trimmed = operand.trim();
  
  // Handle dereference operator
  if (trimmed.startsWith("*") && /^\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    const varName = trimmed.slice(1);
    // Dereference: recursively interpret the variable (which will follow the reference)
    return getInterpret()(varName, scope);
  }
  
  // Regular operand
  return getInterpret()(operand, scope);
}

export function parseAndApplyOperation(tokens: Array<{ type: "operand" | "operator"; value: string }>, leftData: number | bigint, operatorIndex: number, opName: string, scope: VariableScope | null = null): Result<number | bigint, string> {
  if (operatorIndex + 1 >= tokens.length || tokens[operatorIndex + 1].type !== "operand") {
    return { success: false, error: "Invalid expression" };
  }

   const rightResult = evaluateOperand(tokens[operatorIndex + 1].value, scope);
  if (!rightResult.success) {
    return rightResult;
  }

  const rightData: number | bigint = (rightResult as { success: true; data: number | bigint }).data;
  return performOperation(leftData, rightData, tokens[operatorIndex - 1].value, tokens[operatorIndex + 1].value, opName);
}

export function shouldStopOperatorParsing(operator: string, allowedOps: string[]): boolean {
  return !allowedOps.includes(operator);
}

export function interpretMultiplyDivide(tokens: Array<{ type: "operand" | "operator"; value: string }>, startIndex: number, scope: VariableScope | null = null): Result<{ value: number | bigint; nextIndex: number }, string> {
    let result = evaluateOperand(tokens[startIndex].value, scope);

  if (!result.success) {
    return result as unknown as Result<{ value: number | bigint; nextIndex: number }, string>;
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
    const opResult: Result<number | bigint, string> = parseAndApplyOperation(tokens, resultData, i, opName, scope);

    if (!opResult.success) {
      return opResult as unknown as Result<{ value: number | bigint; nextIndex: number }, string>;
    }

    result = opResult;
    tokens[i + 1].value = String((result as { success: true; data: number | bigint }).data);
    i += 2;
  }

  return { success: true, data: { value: (result as { success: true; data: number | bigint }).data, nextIndex: tokens.length } };
}

export function interpretAddSubtract(tokens: Array<{ type: "operand" | "operator"; value: string }>, startIndex: number, scope: VariableScope | null = null): Result<number | bigint, string> {
  const mdResult = interpretMultiplyDivide(tokens, startIndex, scope);

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

    const rightMdResult = interpretMultiplyDivide(tokens, i + 1, scope);
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

export function evaluateGroupedExpressions(input: string, scope: VariableScope | null = null): string {
  let result = input;
  let changed = true;

  while (changed) {
    changed = false;
    let depth = 0;
    let start = -1;
    let groupChar = "";

    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      const isOpenBrace = char === "(" || char === "{";
      const isCloseBrace = (char === ")" && groupChar === "(") || (char === "}" && groupChar === "{");

      if (isOpenBrace) {
        if (depth === 0) {
          start = i;
          groupChar = char;
        }
        depth++;
      } else if (isCloseBrace) {
        depth--;
        if (depth === 0 && start !== -1) {
          const inner = result.substring(start + 1, i);
          let innerResult: Result<number | bigint, string>;

          if (groupChar === "{" && inner.includes("let ")) {
             innerResult = getInterpretStatementBlock()(inner, scope);
          } else {
             innerResult = getInterpret()(inner, scope);
          }

          if (!innerResult.success) {
            return "";
          }

          const evaluated = String((innerResult as { success: true; data: number | bigint }).data);
          result = result.substring(0, start) + evaluated + result.substring(i + 1);
          changed = true;
          break;
        }
      }
    }
  }

  return result;
}

export function evaluateParenthesizedExpressions(input: string, scope: VariableScope | null = null): string {
  return evaluateGroupedExpressions(input, scope);
}
