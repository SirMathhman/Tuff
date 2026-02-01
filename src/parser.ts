import { Result, VariableScope, Variable, FunctionParameter, isMutablePointerType, getPointeeType, isArrayType, TYPE_RANGES, parseArrayType } from "./types";
import { canCoerceType, getTypeForValue, validateNumber } from "./operators";
import { lookupVariable, declareVariable, declareFunction } from "./executor";
import { getInterpret } from "./lazy";

// Lazy import to avoid circular dependency at module load time

// Helper: tokenize statement block by semicolon and braces
function tokenizeStatements(trimmed: string): string[] {
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === "{") {
      braceDepth++;
      current += char;
    } else if (char === "}") {
      braceDepth--;
      current += char;

      // Allow `while (...) { ... } <expr>` without requiring a `;` after block
      if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
        const currentTrimmed = current.trim();
        const rest = trimmed.slice(i + 1);
        if (currentTrimmed.startsWith("while ") && /\S/.test(rest)) {
          parts.push(currentTrimmed);
          current = "";
        }
      }
    } else if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth--;
      current += char;
    } else if (char === "[") {
      bracketDepth++;
      current += char;
    } else if (char === "]") {
      bracketDepth--;
      current += char;
    } else if (char === ";" && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

export function parseStatementBlock(input: string): Result<{ statements: string[]; finalExpr: string }, string> {
  const trimmed = input.trim();
  const parts = tokenizeStatements(trimmed);

  if (parts.length < 2) {
    return { success: false, error: "Statement block must contain at least one statement and an expression" };
  }

  const statements = parts.slice(0, -1);
  const finalExpr = parts[parts.length - 1];

  if (finalExpr === "") {
    return { success: false, error: "Statement block must end with an expression" };
  }

  return { success: true, data: { statements, finalExpr } };
}

export function inferAndValidateType(valueStr: string, targetType: string | null, value: number | bigint, scope: VariableScope | null): Result<string, string> {
  let sourceType: string | null = null;

  if (scope !== null && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(valueStr)) {
    const lookupResult = lookupVariable(scope, valueStr);
    if (lookupResult.success) {
      sourceType = (lookupResult as { success: true; data: Variable }).data.type;
    }
  } else {
    sourceType = getTypeForValue(valueStr);
  }

  if (targetType === null) {
    if (sourceType === null) {
      if (typeof value === "bigint") {
        sourceType = "I64";
      } else if (value >= 0 && value <= 255) {
        sourceType = "U8";
      } else if (value >= -128 && value <= 127) {
        sourceType = "I8";
      } else if (value >= 0 && value <= 65535) {
        sourceType = "U16";
      } else if (value >= -32768 && value <= 32767) {
        sourceType = "I16";
      } else if (value >= 0 && value <= 4294967295) {
        sourceType = "U32";
      } else {
        sourceType = "I32";
      }
    }
    return { success: true, data: sourceType };
  }

  if (sourceType !== null && !canCoerceType(sourceType, targetType)) {
    return { success: false, error: "Cannot coerce type " + sourceType + " to " + targetType };
  }

  return { success: true, data: targetType };
}

function parseVariableParts(rest: string): Result<{ varName: string; targetType: string | null; valueStr: string }, string> {
    const colonIndex = rest.indexOf(":");
    const equalsIndex = rest.indexOf("=");

    let varName: string;
    let targetType: string | null;
    let valueStr: string;

    if (colonIndex === -1) {
      // No type annotation
      if (equalsIndex === -1) {
        return { success: false, error: "Expected '=' in variable declaration" };
      }
      varName = rest.slice(0, equalsIndex).trim();
      targetType = null;
      valueStr = rest.slice(equalsIndex + 1).trim();
    } else if (equalsIndex === -1) {
      // Type annotation but no initialization (only valid for arrays)
      varName = rest.slice(0, colonIndex).trim();
      targetType = rest.slice(colonIndex + 1).trim();
      valueStr = ""; // Empty for uninitialized arrays
    } else if (colonIndex < equalsIndex) {
      // Both type and initialization
      varName = rest.slice(0, colonIndex).trim();
      const afterColon = rest.slice(colonIndex + 1).trim();
      const equalsInAfterColon = afterColon.indexOf("=");
      targetType = afterColon.slice(0, equalsInAfterColon).trim();
      valueStr = afterColon.slice(equalsInAfterColon + 1).trim();
    } else {
      return { success: false, error: "Invalid variable declaration format" };
    }

    if (!varName) {
      return { success: false, error: "Invalid variable declaration format" };
    }

    // For non-array types, valueStr is required
    if (targetType !== null && !isArrayType(targetType) && !valueStr) {
      return { success: false, error: "Invalid variable declaration format" };
    }

    return { success: true, data: { varName, targetType, valueStr } };
}

function initializePointerVariable(varName: string, targetType: string, valueStr: string, scope: VariableScope, mutable: boolean): Result<void, string> {
   const isMutablePtr = isMutablePointerType(targetType);
   
   // Determine expected reference syntax
   const expectedRefPrefix = isMutablePtr ? "&mut" : "&";
   if (!valueStr.startsWith(expectedRefPrefix)) {
     return { success: false, error: "Pointer type requires " + expectedRefPrefix + " operator" };
   }

   // Extract referenced variable name
   const referencedVarName = valueStr.slice(expectedRefPrefix.length).trim();
   const refLookup = lookupVariable(scope, referencedVarName);
   if (!refLookup.success) {
     return { success: false, error: "Cannot reference undefined variable: " + referencedVarName };
   }

   const refVar = (refLookup as { success: true; data: Variable }).data;
   
   // For mutable pointers, the referenced variable must be mutable
   if (isMutablePtr && !refVar.mutable) {
     return { success: false, error: "Cannot create mutable reference to immutable variable: " + referencedVarName };
   }

   const ptrPointeeType = getPointeeType(targetType);
   if (ptrPointeeType !== refVar.type) {
     return { success: false, error: "Cannot create pointer to " + refVar.type + " from pointer to " + ptrPointeeType };
   }

   return declareVariable(scope, varName, targetType, referencedVarName as unknown as number | bigint, mutable);
}

function parseAndValidateArrayElements(elementsStr: string, elementTypeStr: string, scope: VariableScope): Result<{ elements: (number | bigint)[]; elementType: string }, string> {
  const elements: (number | bigint)[] = [];
  const elementStrings = elementsStr.split(",");
  
  for (const elemStr of elementStrings) {
    const trimmedElem = elemStr.trim();
    const elemResult = getInterpret()(trimmedElem, scope);
    if (!elemResult.success) {
      return elemResult as unknown as Result<{ elements: (number | bigint)[]; elementType: string }, string>;
    }
    elements.push((elemResult as { success: true; data: number | bigint }).data);
  }

  const typeResult = inferAndValidateType(elementTypeStr, null, 0, null);
  if (!typeResult.success) {
    return typeResult as unknown as Result<{ elements: (number | bigint)[]; elementType: string }, string>;
  }
  const inferredElementType = (typeResult as { success: true; data: string }).data;

  const typeInfo = TYPE_RANGES[inferredElementType];
  if (!typeInfo) {
    return { success: false, error: "Unknown type: " + inferredElementType };
  }

  for (let i = 0; i < elements.length; i++) {
    const validateResult = validateNumber(elements[i], typeInfo, inferredElementType);
    if (!validateResult.success) {
      return validateResult as unknown as Result<{ elements: (number | bigint)[]; elementType: string }, string>;
    }
  }

  return { success: true, data: { elements, elementType: inferredElementType } };
}

function initializeArrayVariable(varName: string, targetType: string, valueStr: string, scope: VariableScope, mutable: boolean): Result<void, string> {
    // Parse array type: [ElementType; InitializedCount; TotalCapacity]
    const arrayTypeInfo = parseArrayType(targetType);
    if (!arrayTypeInfo) {
      return { success: false, error: "Invalid array type declaration" };
    }

    // Handle uninitialized arrays (no valueStr)
    if (!valueStr) {
      const emptyArray: (number | bigint)[] = new Array(arrayTypeInfo.total);
      const normalizedType = "[" + arrayTypeInfo.elementType + "; 0; " + arrayTypeInfo.total + "]";
      return declareVariable(scope, varName, normalizedType, emptyArray, mutable);
    }

    // Parse array initialization: <Type>[elem1, elem2, elem3]
    const typeMatch = valueStr.match(/^<([a-zA-Z0-9*mut ]+)>\[(.+)\]$/);
    if (!typeMatch) {
      return { success: false, error: "Invalid array initialization format. Expected: <Type>[elem1, elem2, ...]" };
    }

    const elementTypeStr = typeMatch[1];
    const elementsStr = typeMatch[2];
    
    const elemResult = parseAndValidateArrayElements(elementsStr, elementTypeStr, scope);
    if (!elemResult.success) {
      return elemResult as unknown as Result<void, string>;
    }

    const { elements, elementType: inferredElementType } = (elemResult as { success: true; data: { elements: (number | bigint)[]; elementType: string } }).data;

    if (arrayTypeInfo.elementType !== inferredElementType) {
      return { success: false, error: "Array element type mismatch: expected " + arrayTypeInfo.elementType + ", got " + inferredElementType };
    }

    if (elements.length !== arrayTypeInfo.initialized) {
      return { success: false, error: "Array initialization count mismatch: expected " + arrayTypeInfo.initialized + " elements, got " + elements.length };
    }

    if (arrayTypeInfo.initialized > arrayTypeInfo.total) {
      return { success: false, error: "Initialized elements (" + arrayTypeInfo.initialized + ") cannot exceed total elements (" + arrayTypeInfo.total + ")" };
    }

    return declareVariable(scope, varName, targetType, elements, mutable);
}

function initializeRegularVariable(varName: string, targetType: string | null, valueStr: string, scope: VariableScope, mutable: boolean): Result<void, string> {
   const valueResult = getInterpret()(valueStr, scope);
   if (!valueResult.success) {
     return valueResult;
   }

   const value = (valueResult as { success: true; data: number | bigint }).data;
   const typeResult = inferAndValidateType(valueStr, targetType, value, scope);

   if (!typeResult.success) {
     return typeResult;
   }

   const finalType = (typeResult as { success: true; data: string }).data;
   return declareVariable(scope, varName, finalType, value, mutable);
}

export function parseVariableDeclaration(stmt: string, scope: VariableScope): Result<void, string> {
   const trimmed = stmt.trim();

   if (!trimmed.startsWith("let ")) {
     return { success: false, error: "Expected 'let' keyword" };
   }

   let rest = trimmed.slice(4).trim();
   let mutable = false;

   if (rest.startsWith("mut ")) {
     mutable = true;
     rest = rest.slice(4).trim();
   }

   const partsResult = parseVariableParts(rest);
   if (!partsResult.success) {
     return partsResult;
   }

   const { varName, targetType, valueStr } = (partsResult as { success: true; data: { varName: string; targetType: string | null; valueStr: string } }).data;
   const isPointerType = targetType !== null && targetType.startsWith("*");
   const isArrayTypeDecl = targetType !== null && isArrayType(targetType);

   if (isPointerType) {
     return initializePointerVariable(varName, targetType as string, valueStr, scope, mutable);
   }

   if (isArrayTypeDecl) {
     return initializeArrayVariable(varName, targetType as string, valueStr, scope, mutable);
   }

   return initializeRegularVariable(varName, targetType, valueStr, scope, mutable);
}

export function parseFunctionDeclaration(stmt: string, scope: VariableScope): Result<void, string> {
  const sigResult = parseFunctionSignature(stmt);
  if (!sigResult.success) {
    return sigResult as unknown as Result<void, string>;
  }

  const { funcName, paramsStr, returnType, bodyPart } = (sigResult as { success: true; data: { funcName: string; paramsStr: string; returnType: string; bodyPart: string } }).data;

  const bodyResult = extractFunctionBody(bodyPart);
  if (!bodyResult.success) {
    return bodyResult as unknown as Result<void, string>;
  }

  const body = (bodyResult as { success: true; data: string }).data;

  if (paramsStr) {
    const paramParts = splitParametersParts(paramsStr);
    const paramResult = parseParametersFromParts(paramParts);
    if (!paramResult.success) {
      return paramResult as unknown as Result<void, string>;
    }
    const parameters = (paramResult as { success: true; data: FunctionParameter[] }).data;
    return declareFunction(scope, funcName, parameters, returnType, body);
  }

  return declareFunction(scope, funcName, [], returnType, body);
}

function splitParametersParts(paramsStr: string): string[] {
  const paramParts: string[] = [];
  let current = "";
  let bracketDepth = 0;
  
  for (let i = 0; i < paramsStr.length; i++) {
    const char = paramsStr[i];
    if (char === "[") {
      bracketDepth++;
      current += char;
    } else if (char === "]") {
      bracketDepth--;
      current += char;
    } else if (char === "," && bracketDepth === 0) {
      if (current.trim()) {
        paramParts.push(current.trim());
      }
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    paramParts.push(current.trim());
  }

  return paramParts;
}

function parseFunctionSignature(stmt: string): Result<{ funcName: string; paramsStr: string; returnType: string; bodyPart: string }, string> {
  const trimmed = stmt.trim();

  if (!trimmed.startsWith("fn ")) {
    return { success: false, error: "Expected 'fn' keyword" };
  }

  const rest = trimmed.slice(3).trim();
  const parenStart = rest.indexOf("(");
  let parenEnd = -1;
  let parenDepth = 0;

  for (let i = parenStart; i < rest.length; i++) {
    if (rest[i] === "(") parenDepth++;
    else if (rest[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) {
        parenEnd = i;
        break;
      }
    }
  }

  if (parenStart === -1 || parenEnd === -1) {
    return { success: false, error: "Invalid function declaration format: missing parentheses" };
  }

  const afterParen = rest.slice(parenEnd + 1);
  const colonInAfter = afterParen.indexOf(":");
  const arrowInAfter = afterParen.indexOf("=>");

  if (colonInAfter === -1 || arrowInAfter === -1 || colonInAfter >= arrowInAfter) {
    return { success: false, error: "Invalid function declaration format: expected fn name(params) : ReturnType => { body }" };
  }

  const funcName = rest.slice(0, parenStart).trim();
  const paramsStr = rest.slice(parenStart + 1, parenEnd).trim();
  const colonPos = parenEnd + 1 + colonInAfter;
  const arrowPos = parenEnd + 1 + arrowInAfter;
  const returnType = rest.slice(colonPos + 1, arrowPos).trim();
  const bodyPart = rest.slice(arrowPos + 2).trim();

  return { success: true, data: { funcName, paramsStr, returnType, bodyPart } };
}

function extractFunctionBody(bodyPart: string): Result<string, string> {
  const braceStart = bodyPart.indexOf("{");
  if (braceStart === -1) {
    return { success: false, error: "Expected '{' in function body" };
  }

  const bodyStart = braceStart + 1;
  const bodyEnd = bodyPart.lastIndexOf("}");

  if (bodyEnd === -1 || bodyEnd <= bodyStart) {
    return { success: false, error: "Invalid function body" };
  }

  return { success: true, data: bodyPart.slice(bodyStart, bodyEnd).trim() };
}

function parseParametersFromParts(paramParts: string[]): Result<FunctionParameter[], string> {
  const parameters: FunctionParameter[] = [];

  for (const paramPart of paramParts) {
    const colonIdx = paramPart.indexOf(":");
    if (colonIdx === -1) {
      return { success: false, error: "Expected ':' in parameter" };
    }
    const paramName = paramPart.slice(0, colonIdx).trim();
    const paramType = paramPart.slice(colonIdx + 1).trim();
    parameters.push({ name: paramName, type: paramType });
  }

  return { success: true, data: parameters };
}

function findClosingParenthesis(input: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex; i < input.length; i++) {
    if (input[i] === "(") {
      depth++;
    } else if (input[i] === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function parseFunctionArguments(argsStr: string, scope: VariableScope): Result<{ args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[] }, string> {
  const args: (number | bigint)[] = [];
  const argTypes: (string | null)[] = [];
  const argNames: (string | null)[] = [];

  if (!argsStr) {
    return { success: true, data: { args, argTypes, argNames } };
  }

  const argParts = argsStr.split(",");
  for (const argPart of argParts) {
    const argTrimmed = argPart.trim();
    
    // Check if this is a simple array variable name
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(argTrimmed)) {
      const varLookup = lookupVariable(scope, argTrimmed);
      if (varLookup.success) {
        const varData = (varLookup as { success: true; data: Variable }).data;
        if (isArrayType(varData.type)) {
          argTypes.push(varData.type);
          args.push(0);
          argNames.push(argTrimmed);
          continue;
        }
      }
    }
    
    const argResult = getInterpret()(argTrimmed, scope);
    if (!argResult.success) {
      return argResult as unknown as Result<{ args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[] }, string>;
    }
    args.push((argResult as { success: true; data: number | bigint }).data);
    argTypes.push(getTypeForValue(argTrimmed));
    argNames.push(null);
  }

  return { success: true, data: { args, argTypes, argNames } };
}

export function parseFunctionCall(input: string, scope: VariableScope): Result<{ name: string; args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[]; endIndex: number }, string> {
  const parenStart = input.indexOf("(");
  const parenEnd = findClosingParenthesis(input, parenStart);

  if (parenStart === -1 || parenEnd === -1 || parenStart >= parenEnd) {
    return { success: false, error: "Invalid function call" };
  }

  const funcName = input.slice(0, parenStart).trim();
  const argsStr = input.slice(parenStart + 1, parenEnd).trim();

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(funcName)) {
    return { success: false, error: "Invalid function name" };
  }

  const argResult = parseFunctionArguments(argsStr, scope);
  if (!argResult.success) {
    return argResult as unknown as Result<{ name: string; args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[]; endIndex: number }, string>;
  }

  const { args, argTypes, argNames } = (argResult as { success: true; data: { args: (number | bigint)[]; argTypes: (string | null)[]; argNames: (string | null)[] } }).data;

  return { success: true, data: { name: funcName, args, argTypes, argNames, endIndex: parenEnd } };
}

// Helper: find matching closing paren for a while condition
function findConditionEnd(rest: string): number {
  let parenCount = 0;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "(") {
      parenCount++;
    } else if (rest[i] === ")") {
      parenCount--;
      if (parenCount === 0) {
        return i;
      }
    }
  }
  return -1;
}

// Helper: extract block body from while statement
function extractWhileBody(bodyPart: string): Result<string, string> {
  let body = bodyPart;
  if (bodyPart.startsWith("{")) {
    let braceCount = 0;
    let blockEnd = -1;
    for (let i = 0; i < bodyPart.length; i++) {
      if (bodyPart[i] === "{") {
        braceCount++;
      } else if (bodyPart[i] === "}") {
        braceCount--;
        if (braceCount === 0) {
          blockEnd = i;
          break;
        }
      }
    }
    if (blockEnd === -1) {
      return { success: false, error: "Unclosed braces in while body" };
    }
    body = bodyPart.slice(1, blockEnd).trim();
  }
  return { success: true, data: body };
}

export function parseWhileLoop(stmt: string): Result<{ condition: string; body: string }, string> {
  const trimmed = stmt.trim();

  if (!trimmed.startsWith("while ")) {
    return { success: false, error: "Expected 'while' keyword" };
  }

  const rest = trimmed.slice(6).trim();
  if (!rest.startsWith("(")) {
    return { success: false, error: "Expected '(' after 'while'" };
  }

  const conditionEnd = findConditionEnd(rest);
  if (conditionEnd === -1) {
    return { success: false, error: "Unclosed parentheses in while condition" };
  }

  const condition = rest.slice(1, conditionEnd).trim();
  const bodyPart = rest.slice(conditionEnd + 1).trim();

  if (!bodyPart) {
    return { success: false, error: "Expected body after while condition" };
  }

  const bodyResult = extractWhileBody(bodyPart);
  if (!bodyResult.success) {
    return bodyResult;
  }

  return { success: true, data: { condition, body: (bodyResult as { success: true; data: string }).data } };
}

export function tokenizeExpression(input: string): Array<{ type: "operand" | "operator"; value: string }> {
  const tokens: Array<{ type: "operand" | "operator"; value: string }> = [];
  let current = "";
  let i = 0;

  const MAX_TOKENIZE_ITERATIONS = input.length + 10;
  let safety = 0;

  while (i < input.length) {
    safety++;
    if (safety > MAX_TOKENIZE_ITERATIONS) {
      break;
    }
    // Check for two-character operators first (==, !=, <=, >=)
    const twoCharOps = ["==", "!=", "<=", ">="];
    const singleCharOps = ["+", "-", "*", "/", "<", ">"];
    let foundOp: string | null = null;
    let opLength = 0;

    // Check for two-character operators
    if (i < input.length - 2 && input[i] === " " && input[i + 3] === " ") {
      const potentialOp = input.substr(i + 1, 2);
      if (twoCharOps.includes(potentialOp)) {
        foundOp = potentialOp;
        opLength = 4; // space + 2 chars + space
      }
    }

    // Check for single-character operators if no two-char op found
    if (!foundOp && i < input.length - 1 && input[i] === " " && input[i + 2] === " ") {
      const potentialOp = input[i + 1];
      if (singleCharOps.includes(potentialOp)) {
        foundOp = potentialOp;
        opLength = 3; // space + 1 char + space
      }
    }

    if (foundOp) {
      if (current.trim()) {
        tokens.push({ type: "operand", value: current.trim() });
        current = "";
      }
      tokens.push({ type: "operator", value: foundOp });
      i += opLength;
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
