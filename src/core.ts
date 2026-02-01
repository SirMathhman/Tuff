/* eslint-disable max-lines-per-function */
import {
  Result,
  Variable,
  VariableScope,
  TYPE_RANGES,
} from "./types";
import {
  validateNumber,
} from "./operators";
import {
  parseStatementBlock,
  parseVariableDeclaration,
  parseFunctionDeclaration,
  parseFunctionCall,
  tokenizeExpression,
} from "./parser";
import {
  createScope,
  lookupVariable,
  lookupFunction,
  assignVariableWithType,
  executeFunctionCall,
  interpretWithVariables,
} from "./executor";
import {
  evaluateParenthesizedExpressions,
  interpretAddSubtract,
} from "./expressions";

export function interpretStatementBlock(input: string, parentScope: VariableScope | null = null): Result<number | bigint, string> {
  const parseResult = parseStatementBlock(input);
  if (!parseResult.success) {
    return parseResult;
  }

  const { statements, finalExpr } = (parseResult as { success: true; data: { statements: string[]; finalExpr: string } }).data;
  const blockScope = createScope(parentScope);

  for (const stmt of statements) {
    if (stmt.startsWith("let ")) {
      const declResult = parseVariableDeclaration(stmt, blockScope);
      if (!declResult.success) {
        return declResult;
      }
    } else if (stmt.startsWith("fn ")) {
      const declResult = parseFunctionDeclaration(stmt, blockScope);
      if (!declResult.success) {
        return declResult;
      }
    } else {
      const assignIndex = stmt.indexOf("=");
      if (assignIndex !== -1) {
        const lhs = stmt.slice(0, assignIndex).trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
          const rhs = stmt.slice(assignIndex + 1).trim();
          const valueResult = interpretWithVariables(rhs, blockScope);
          if (!valueResult.success) {
            return valueResult;
          }
          const newValue = (valueResult as { success: true; data: number | bigint }).data;
          let rhsType: string | null = null;
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rhs)) {
            const rhsVarLookup = lookupVariable(blockScope, rhs);
            if (rhsVarLookup.success) {
              rhsType = (rhsVarLookup as { success: true; data: Variable }).data.type;
            }
          } else {
            rhsType = getTypeForValue(rhs);
          }
          
          // Always use assignVariableWithType for direct assignments
          const assignResult = assignVariableWithType(blockScope, lhs, newValue, rhsType);
          if (!assignResult.success) {
            return assignResult;
          }
          continue;
        }
      }
      const exprResult = interpretWithVariables(stmt, blockScope);
      if (!exprResult.success) {
        return exprResult;
      }
    }
  }

  return interpretWithVariables(finalExpr, blockScope);
}

export function interpret(input: string, scope: VariableScope | null = null): Result<number | bigint, string> {
  const trimmedInput = input.trim();

  if (trimmedInput.includes(";")) {
    const parseResult = parseStatementBlock(trimmedInput);
    if (parseResult.success) {
      return interpretStatementBlock(trimmedInput, scope);
    }
  }

  if (trimmedInput.includes("(") || trimmedInput.includes(")") || trimmedInput.includes("{") || trimmedInput.includes("}")) {
    const parenStart = trimmedInput.indexOf("(");
    const possibleFuncName = parenStart !== -1 ? trimmedInput.slice(0, parenStart).trim() : "";

    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(possibleFuncName) && scope !== null && parenStart !== -1) {
      const funcLookup = lookupFunction(scope, possibleFuncName);
      if (funcLookup.success) {
        const callResult = parseFunctionCall(trimmedInput, scope);
        if (callResult.success) {
          const { name, args, argTypes, endIndex } = (callResult as { success: true; data: { name: string; args: (number | bigint)[]; argTypes: (string | null)[]; endIndex: number } }).data;
          const callValue = executeFunctionCall(scope, name, args, argTypes);
          if (!callValue.success) {
            return callValue;
          }

          const rest = trimmedInput.slice(endIndex + 1).trim();
          if (rest === "") {
            return callValue;
          }

          if (rest.startsWith("+") || rest.startsWith("-") || rest.startsWith("*") || rest.startsWith("/")) {
            const callResult_data = (callValue as { success: true; data: number | bigint }).data;
            const remainingExpr = String(callResult_data) + " " + rest;
            return interpret(remainingExpr, scope);
          }
        }
      }
    }

    const evaluated = evaluateParenthesizedExpressions(trimmedInput, scope);
    if (evaluated === "") {
      return { success: false, error: "Invalid grouped expression" };
    }
    return interpret(evaluated, scope);
  }

  if (scope !== null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedInput)) {
    const lookupResult = lookupVariable(scope, trimmedInput);
    if (lookupResult.success) {
      return { success: true, data: (lookupResult as { success: true; data: Variable }).data.value };
    } else {
      return lookupResult;
    }
  }

  if (trimmedInput.includes(" + ") || trimmedInput.includes(" - ") || trimmedInput.includes(" * ") || trimmedInput.includes(" / ")) {
    const tokens = tokenizeExpression(trimmedInput);

    if (tokens.length >= 3 && tokens[0].type === "operand") {
      const result = interpretAddSubtract(tokens, 0, scope);

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

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedInput)) {
    return { success: false, error: "Undefined variable: " + trimmedInput };
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
