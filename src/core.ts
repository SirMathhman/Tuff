import {
  Result,
  Variable,
  VariableScope,
  TYPE_RANGES,
  parseArrayType,
  updateArrayInitializedCount,
  Range,
} from "./types";
import {
  validateNumber,
  getTypeForValue,
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
  assignThroughMutablePointer,
  executeFunctionCall,
  interpretWithVariables,
} from "./executor";
import {
  evaluateParenthesizedExpressions,
  interpretAddSubtract,
  interpretComparisons,
} from "./expressions";

function evaluateRhs(rhs: string, scope: VariableScope): Result<{ value: number | bigint; type: string | null }, string> {
  const valueResult = interpretWithVariables(rhs, scope);
  if (!valueResult.success) {
    return valueResult as Result<{ value: number | bigint; type: string | null }, string>;
  }

  const value = (valueResult as { success: true; data: number | bigint }).data;
  let type: string | null = null;
  
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rhs)) {
    const rhsVarLookup = lookupVariable(scope, rhs);
    if (rhsVarLookup.success) {
      type = (rhsVarLookup as { success: true; data: Variable }).data.type;
    }
  } else {
    type = getTypeForValue(rhs);
  }

  return { success: true, data: { value, type } };
}

function evaluateRhsToValue(rhs: string, scope: VariableScope): Result<number | bigint, string> {
  const rhsEvalResult = evaluateRhs(rhs, scope);
  if (!rhsEvalResult.success) {
    return rhsEvalResult as Result<number | bigint, string>;
  }
  const { value } = (rhsEvalResult as { success: true; data: { value: number | bigint; type: string | null } }).data;
  return { success: true, data: value };
}

function handleDereferencedAssignment(lhs: string, rhs: string, scope: VariableScope): Result<number | bigint, string> | null {
  if (lhs.startsWith("*") && /^\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
    const ptrVarName = lhs.slice(1);
    const extractResult = evaluateRhsToValue(rhs, scope);
    if (!extractResult.success) {
      return extractResult;
    }
    const newValue = (extractResult as { success: true; data: number | bigint }).data;
    const assignResult = assignThroughMutablePointer(scope, ptrVarName, newValue);
    if (!assignResult.success) {
      return assignResult;
    }
    return { success: true, data: newValue };
  }
  return null;
}

function handleArrayIndexingAssignment(lhs: string, rhs: string, scope: VariableScope): Result<number | bigint, string> | null {
  const bracketStart = lhs.indexOf("[");
  const bracketEnd = lhs.lastIndexOf("]");
  if (bracketStart > 0 && bracketEnd > bracketStart && bracketEnd === lhs.length - 1) {
    const arrayName = lhs.slice(0, bracketStart).trim();
    const indexExpr = lhs.slice(bracketStart + 1, bracketEnd).trim();
    
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arrayName)) {
      const arrayLookup = lookupVariable(scope, arrayName);
      if (arrayLookup.success) {
        const arrayVar = (arrayLookup as { success: true; data: Variable }).data;
        if (Array.isArray(arrayVar.value)) {
          const indexResult = interpret(indexExpr, scope);
          if (!indexResult.success) {
            return indexResult;
          }
          const index = indexResult.data;
          const indexNum = typeof index === "bigint" ? Number(index) : index;
          
          if (!arrayVar.mutable) {
            return { success: false, error: "Cannot assign to immutable array: " + arrayName };
          }
          
          if (indexNum < 0 || indexNum >= arrayVar.value.length) {
            return { success: false, error: "Array index out of bounds: " + indexNum + " (array length: " + arrayVar.value.length + ")" };
          }
          
          const extractResult = evaluateRhsToValue(rhs, scope);
          if (!extractResult.success) {
            return extractResult;
          }
          const newValue = (extractResult as { success: true; data: number | bigint }).data;
          
          (arrayVar.value as (number | bigint)[])[indexNum] = newValue;
          
          const parsed = parseArrayType(arrayVar.type);
          if (parsed && indexNum >= parsed.initialized) {
            const newInitializedCount = indexNum + 1;
            const updatedType = updateArrayInitializedCount(arrayVar.type, newInitializedCount);
            if (updatedType) {
              arrayVar.type = updatedType;
            }
          }
          return { success: true, data: newValue };
        }
      }
    }
  }
  return null;
}

function handleRegularAssignment(lhs: string, rhs: string, scope: VariableScope): Result<number | bigint, string> | null {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
    const rhsEvalResult = evaluateRhs(rhs, scope);
    if (!rhsEvalResult.success) {
      return rhsEvalResult;
    }
    const { value: newValue, type: rhsType } = (rhsEvalResult as { success: true; data: { value: number | bigint; type: string | null } }).data;
    const assignResult = assignVariableWithType(scope, lhs, newValue, rhsType);
    if (!assignResult.success) {
      return assignResult;
    }
    return { success: true, data: newValue };
  }
  return null;
}

function processAssignment(stmt: string, scope: VariableScope): Result<number | bigint, string> | null {
  const assignIndex = stmt.indexOf("=");
  if (assignIndex === -1) {
    return null;
  }
  const lhs = stmt.slice(0, assignIndex).trim();
  const rhs = stmt.slice(assignIndex + 1).trim();
  
  const derefResult = handleDereferencedAssignment(lhs, rhs, scope);
  if (derefResult !== null) {
    return derefResult;
  }
  
  const arrayResult = handleArrayIndexingAssignment(lhs, rhs, scope);
  if (arrayResult !== null) {
    return arrayResult;
  }
  
  return handleRegularAssignment(lhs, rhs, scope);
}

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
      const assignResult = processAssignment(stmt, blockScope);
      if (assignResult !== null) {
        if (!assignResult.success) {
          return assignResult;
        }
        continue;
      }
      
      const exprResult = interpretWithVariables(stmt, blockScope);
      if (!exprResult.success) {
        return exprResult;
      }
    }
  }

  return interpretWithVariables(finalExpr, blockScope);
}

function handleDereferenceOperator(input: string, scope: VariableScope | null): Result<number | bigint, string> | null {
  const match = input.match(/^\*+([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (!match) {
    return null;
  }
  
  if (scope === null) {
    return { success: false, error: "Cannot dereference in global scope" };
  }
  
  const derefCount = input.indexOf(match[1]);
  const varName = match[1];
  
  let lookupResult = lookupVariable(scope, varName);
  if (!lookupResult.success) {
    return lookupResult;
  }
  
  let currentVar = (lookupResult as { success: true; data: Variable }).data;
  for (let i = 0; i < derefCount; i++) {
    if (typeof currentVar.value === "string") {
      lookupResult = lookupVariable(scope, currentVar.value);
      if (!lookupResult.success) {
        return lookupResult;
      }
      currentVar = (lookupResult as { success: true; data: Variable }).data;
    } else {
      return { success: false, error: "Cannot dereference non-pointer variable at level " + (i + 1) };
    }
  }
  
  if (typeof currentVar.value === "string") {
    return { success: false, error: "Final value is still a reference - incomplete dereferencing" };
  }
  if (Array.isArray(currentVar.value)) {
    return { success: false, error: "Cannot dereference to array - use array indexing instead" };
  }
  return { success: true, data: currentVar.value };
}

function handleFunctionCall(input: string, scope: VariableScope | null): Result<number | bigint, string> | null {
  const parenStart = input.indexOf("(");
  if (parenStart === -1) {
    return null;
  }
  
  const possibleFuncName = input.slice(0, parenStart).trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(possibleFuncName) || scope === null) {
    return null;
  }
  
  const funcLookup = lookupFunction(scope, possibleFuncName);
  if (!funcLookup.success) {
    return null;
  }
  
  const callResult = parseFunctionCall(input, scope);
  if (!callResult.success) {
    return callResult;
  }
  
  const { name, args, argTypes, argNames, endIndex } = (callResult as { success: true; data: { name: string; args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[]; endIndex: number } }).data;
  const callValue = executeFunctionCall(scope, name, args, argTypes, argNames);
  if (!callValue.success) {
    return callValue;
  }
  
  const rest = input.slice(endIndex + 1).trim();
  if (rest === "") {
    return callValue;
  }
  
  if (rest.startsWith("+") || rest.startsWith("-") || rest.startsWith("*") || rest.startsWith("/")) {
    const callResult_data = (callValue as { success: true; data: number | bigint }).data;
    const remainingExpr = String(callResult_data) + " " + rest;
    return interpret(remainingExpr, scope);
  }
  
  return null;
}

function handleArrayIndexingRead(input: string, scope: VariableScope | null): Result<number | bigint, string> | null {
  const bracketStart = input.indexOf("[");
  const bracketEnd = input.lastIndexOf("]");
  
  if (bracketStart <= 0 || bracketEnd <= bracketStart || bracketEnd !== input.length - 1 || scope === null) {
    return null;
  }
  
  const arrayName = input.slice(0, bracketStart).trim();
  const indexExpr = input.slice(bracketStart + 1, bracketEnd).trim();
  
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arrayName)) {
    return null;
  }
  
  const arrayLookup = lookupVariable(scope, arrayName);
  if (!arrayLookup.success) {
    return null;
  }
  
  const arrayVar = (arrayLookup as { success: true; data: Variable }).data;
  if (!Array.isArray(arrayVar.value)) {
    return null;
  }
  
  const indexResult = interpret(indexExpr, scope);
  if (!indexResult.success) {
    return indexResult;
  }
  const index = indexResult.data;
  const indexNum = typeof index === "bigint" ? Number(index) : index;
  
  if (indexNum < 0 || indexNum >= arrayVar.value.length) {
    return { success: false, error: "Array index out of bounds: " + indexNum + " (array length: " + arrayVar.value.length + ")" };
  }
  
  return { success: true, data: arrayVar.value[indexNum] };
}

function handleVariableLookup(input: string, scope: VariableScope | null): Result<number | bigint, string> | null {
  if (scope === null) {
    return null;
  }
  
  const lookupResult = lookupVariable(scope, input);
  if (!lookupResult.success) {
    return null;
  }
  
  const varData = (lookupResult as { success: true; data: Variable }).data;
  if (typeof varData.value === "string") {
    return interpret(varData.value, scope);
  }
  return { success: true, data: varData.value as number | bigint };
}

function handleBooleanLiteral(input: string): Result<number | bigint, string> | null {
  const trimmed = input.trim();
  if (trimmed === "true") {
    return { success: true, data: 1 };
  }
  if (trimmed === "false") {
    return { success: true, data: 0 };
  }
  return null;
}

function handleTypedLiteral(input: string): Result<number | bigint, string> | null {
  for (const [typeName, range] of Object.entries(TYPE_RANGES)) {
    if (input.endsWith(typeName)) {
      const numberStr = input.slice(0, -typeName.length);
      
      if (typeName === "U64" || typeName === "I64") {
        const value = BigInt(numberStr);
        return validateNumber(value, range as Range, typeName);
      }
      
      const value = Number(numberStr);
      return validateNumber(value, range as Range, typeName);
    }
  }
  return null;
}

function handleGroupedExpressions(input: string, scope: VariableScope | null): Result<number | bigint, string> | null {
  if (!(input.includes("(") || input.includes(")") || input.includes("{") || input.includes("}"))) {
    return null;
  }

  const callResult = handleFunctionCall(input, scope);
  if (callResult !== null) {
    return callResult;
  }

  const evaluated = evaluateParenthesizedExpressions(input, scope);
  if (evaluated === "") {
    return { success: false, error: "Invalid grouped expression" };
  }
  return interpret(evaluated, scope);
}

function handleArithmeticOperations(input: string, scope: VariableScope | null): Result<number | bigint, string> | null {
  const hasComparison = input.includes(" < ") || input.includes(" > ") || input.includes(" <= ") || input.includes(" >= ") || input.includes(" == ") || input.includes(" != ");
  const hasArithmetic = input.includes(" + ") || input.includes(" - ") || input.includes(" * ") || input.includes(" / ");

  if (!(hasArithmetic || hasComparison)) {
    return null;
  }

  const tokens = tokenizeExpression(input);
  if (tokens.length >= 3 && tokens[0].type === "operand") {
    if (hasComparison) {
      return interpretComparisons(tokens, 0, scope);
    }
    return interpretAddSubtract(tokens, 0, scope);
  }
  return null;
}

export function interpret(input: string, scope: VariableScope | null = null): Result<number | bigint, string> {
  const trimmedInput = input.trim();

  const derefResult = handleDereferenceOperator(trimmedInput, scope);
  if (derefResult !== null) {
    return derefResult;
  }

  if (trimmedInput.includes(";")) {
    const parseResult = parseStatementBlock(trimmedInput);
    if (parseResult.success) {
      return interpretStatementBlock(trimmedInput, scope);
    }
  }

  const groupedResult = handleGroupedExpressions(trimmedInput, scope);
  if (groupedResult !== null) {
    return groupedResult;
  }

  const arrayResult = handleArrayIndexingRead(trimmedInput, scope);
  if (arrayResult !== null) {
    return arrayResult;
  }

  const boolResult = handleBooleanLiteral(trimmedInput);
  if (boolResult !== null) {
    return boolResult;
  }

  const varResult = handleVariableLookup(trimmedInput, scope);
  if (varResult !== null) {
    return varResult;
  }

  const arithmeticResult = handleArithmeticOperations(trimmedInput, scope);
  if (arithmeticResult !== null) {
    return arithmeticResult;
  }

  const typedResult = handleTypedLiteral(trimmedInput);
  if (typedResult !== null) {
    return typedResult;
  }

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedInput)) {
    return { success: false, error: "Undefined variable: " + trimmedInput };
  }

  return { success: true, data: Number(trimmedInput) };
}

