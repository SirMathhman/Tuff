import {
  Result,
  Variable,
  VariableScope,
  TYPE_RANGES,
  parseArrayType,
  updateArrayInitializedCount,
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
  assignThroughMutablePointer,
  executeFunctionCall,
  interpretWithVariables,
} from "./executor";
import {
  evaluateParenthesizedExpressions,
  interpretAddSubtract,
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
          const rhs = stmt.slice(assignIndex + 1).trim();
          
          // Handle dereferenced assignment: *ptr = value
          if (lhs.startsWith("*") && /^\*[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
            const ptrVarName = lhs.slice(1); // Remove the *
            const extractResult = evaluateRhsToValue(rhs, blockScope);
            if (!extractResult.success) {
              return extractResult;
            }
            const newValue = (extractResult as { success: true; data: number | bigint }).data;
            const assignResult = assignThroughMutablePointer(blockScope, ptrVarName, newValue);
            if (!assignResult.success) {
              return assignResult;
            }
            continue;
          }
          
          // Handle array indexing assignment: array[index] = value
          if (lhs.includes("[") && lhs.includes("]")) {
            const bracketStart = lhs.indexOf("[");
            const bracketEnd = lhs.lastIndexOf("]");
            if (bracketStart > 0 && bracketEnd > bracketStart && bracketEnd === lhs.length - 1) {
              const arrayName = lhs.slice(0, bracketStart).trim();
              const indexExpr = lhs.slice(bracketStart + 1, bracketEnd).trim();
              
              if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arrayName)) {
                const arrayLookup = lookupVariable(blockScope, arrayName);
                if (arrayLookup.success) {
                  const arrayVar = (arrayLookup as { success: true; data: Variable }).data;
                  if (Array.isArray(arrayVar.value)) {
                    // Evaluate the index
                    const indexResult = interpret(indexExpr, blockScope);
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
                    
                     // Evaluate RHS
                     const extractResult = evaluateRhsToValue(rhs, blockScope);
                     if (!extractResult.success) {
                       return extractResult;
                     }
                     const newValue = (extractResult as { success: true; data: number | bigint }).data;
                     
                     // Set the array element
                     (arrayVar.value as (number | bigint)[])[indexNum] = newValue;
                     
                     // Update the initialized count if we just initialized a new element
                     const parsed = parseArrayType(arrayVar.type);
                     if (parsed && indexNum >= parsed.initialized) {
                       const newInitializedCount = indexNum + 1;
                       const updatedType = updateArrayInitializedCount(arrayVar.type, newInitializedCount);
                       if (updatedType) {
                         arrayVar.type = updatedType;
                       }
                     }
                     continue;
                  }
                }
              }
            }
          }
          
           // Handle regular assignment: var = value
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(lhs)) {
            const rhsEvalResult = evaluateRhs(rhs, blockScope);
            if (!rhsEvalResult.success) {
              return rhsEvalResult;
            }
            const { value: newValue, type: rhsType } = (rhsEvalResult as { success: true; data: { value: number | bigint; type: string | null } }).data;
            
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

  // Handle dereference operator (*variable, **variable, etc.)
  if (trimmedInput.startsWith("*")) {
    const match = trimmedInput.match(/^\*+([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (match) {
      const derefCount = trimmedInput.indexOf(match[1]);
      const varName = match[1];
      if (scope === null) {
        return { success: false, error: "Cannot dereference in global scope" };
      }
      
      // Start by looking up the variable
      let lookupResult = lookupVariable(scope, varName);
      if (!lookupResult.success) {
        return lookupResult;
      }
      
      // Follow the reference chain for each level of dereference
      let currentVar = (lookupResult as { success: true; data: Variable }).data;
      for (let i = 0; i < derefCount; i++) {
        if (typeof currentVar.value === "string") {
          // It's a reference - look up the variable it refers to
          lookupResult = lookupVariable(scope, currentVar.value);
          if (!lookupResult.success) {
            return lookupResult;
          }
          currentVar = (lookupResult as { success: true; data: Variable }).data;
        } else {
          return { success: false, error: "Cannot dereference non-pointer variable at level " + (i + 1) };
        }
      }
      
      // After all dereferencing, return the final value
      if (typeof currentVar.value === "string") {
        return { success: false, error: "Final value is still a reference - incomplete dereferencing" };
      }
      if (Array.isArray(currentVar.value)) {
        return { success: false, error: "Cannot dereference to array - use array indexing instead" };
      }
      return { success: true, data: currentVar.value };
    }
  }

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
          const { name, args, argTypes, argNames, endIndex } = (callResult as { success: true; data: { name: string; args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[]; endIndex: number } }).data;
          const callValue = executeFunctionCall(scope, name, args, argTypes, argNames);
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

   if (scope !== null && /^[a-zA-Z_][a-zA-Z0-9_]*\[/.test(trimmedInput)) {
     // Handle array indexing read: array[index]
     const bracketStart = trimmedInput.indexOf("[");
     const bracketEnd = trimmedInput.lastIndexOf("]");
     
     if (bracketStart > 0 && bracketEnd > bracketStart && bracketEnd === trimmedInput.length - 1) {
       const arrayName = trimmedInput.slice(0, bracketStart).trim();
       const indexExpr = trimmedInput.slice(bracketStart + 1, bracketEnd).trim();
       
       if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(arrayName)) {
         const arrayLookup = lookupVariable(scope, arrayName);
         if (arrayLookup.success) {
           const arrayVar = (arrayLookup as { success: true; data: Variable }).data;
           if (Array.isArray(arrayVar.value)) {
             // Evaluate the index
             const indexResult = interpret(indexExpr, scope);
             if (!indexResult.success) {
               return indexResult;
             }
             const index = indexResult.data;
             const indexNum = typeof index === "bigint" ? Number(index) : index;
             
             if (indexNum < 0 || indexNum >= arrayVar.value.length) {
               return { success: false, error: "Array index out of bounds: " + indexNum + " (array length: " + arrayVar.value.length + ")" };
             }
             
             const element = arrayVar.value[indexNum];
             return { success: true, data: element };
           }
         }
       }
     }
   }

   if (scope !== null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedInput)) {
     const lookupResult = lookupVariable(scope, trimmedInput);
     if (lookupResult.success) {
       const varData = (lookupResult as { success: true; data: Variable }).data;
       // If the variable is a pointer/reference, dereference it
       if (typeof varData.value === "string") {
         // This is a reference - look up the referenced variable recursively
         return interpret(varData.value, scope);
       }
       return { success: true, data: varData.value as number | bigint };
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
