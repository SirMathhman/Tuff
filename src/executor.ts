import { Result, Variable, FunctionDef, FunctionParameter, VariableScope, TYPE_RANGES, isPointerType, isArrayType } from "./types";
import { canCoerceType, validateNumber } from "./operators";
import { getInterpret, getInterpretStatementBlock } from "./lazy";

export function createScope(parent: VariableScope | null = null): VariableScope {
  return { variables: new Map(), functions: new Map(), parent };
}

export function declareVariable(scope: VariableScope, name: string, type: string, value: number | bigint | string | (number | bigint)[], mutable: boolean = false): Result<void, string> {
  if (scope.variables.has(name)) {
    return { success: false, error: "Variable " + name + " already declared in this scope" };
  }

  // For pointer types, only validate if the value is a string (it's a reference)
  if (isPointerType(type)) {
    if (typeof value !== "string") {
      return { success: false, error: "Pointer variable must be initialized with a reference" };
    }
    scope.variables.set(name, { name, type, value, mutable });
    return { success: true, data: undefined };
  }

  // For array types, value should be an array
  if (isArrayType(type)) {
    if (!Array.isArray(value)) {
      return { success: false, error: "Array variable must be initialized with an array" };
    }
    scope.variables.set(name, { name, type, value, mutable });
    return { success: true, data: undefined };
  }

  // For non-pointer, non-array types, validate normally
  const range = TYPE_RANGES[type];
  if (!range) {
    return { success: false, error: "Unknown type: " + type };
  }

  const validateResult = validateNumber(value as number | bigint, range, type);
  if (!validateResult.success) {
    return validateResult as unknown as Result<void, string>;
  }

  scope.variables.set(name, { name, type, value: value as number | bigint, mutable });
  return { success: true, data: undefined };
}

export function assignVariableWithType(scope: VariableScope, name: string, newValue: number | bigint, valueType: string | null): Result<void, string> {
  const lookupResult = lookupVariable(scope, name);
  if (!lookupResult.success) {
    return lookupResult as Result<void, string>;
  }

  const variable = (lookupResult as { success: true; data: Variable }).data;
  if (!variable.mutable) {
    return { success: false, error: "Cannot assign to immutable variable: " + name };
  }

  if (valueType !== null && !canCoerceType(valueType, variable.type)) {
    return { success: false, error: "Cannot coerce type " + valueType + " to " + variable.type };
  }

  const range = TYPE_RANGES[variable.type];
  const validateResult = validateNumber(newValue, range, variable.type);
  if (!validateResult.success) {
    return validateResult as unknown as Result<void, string>;
  }

  variable.value = newValue;
  return { success: true, data: undefined };
}

export function assignThroughMutablePointer(scope: VariableScope, pointerVarName: string, newValue: number | bigint): Result<void, string> {
  const ptrLookupResult = lookupVariable(scope, pointerVarName);
  if (!ptrLookupResult.success) {
    return ptrLookupResult as Result<void, string>;
  }

  const ptrVar = (ptrLookupResult as { success: true; data: Variable }).data;
  
  // The pointer variable must hold a reference (string)
  if (typeof ptrVar.value !== "string") {
    return { success: false, error: "Cannot dereference non-pointer variable: " + pointerVarName };
  }

  // Check if this is a mutable pointer
  if (!ptrVar.type.startsWith("*mut ")) {
    return { success: false, error: "Cannot assign through immutable pointer: " + pointerVarName };
  }

  // Follow the reference to the target variable
  const targetLookupResult = lookupVariable(scope, ptrVar.value);
  if (!targetLookupResult.success) {
    return targetLookupResult as Result<void, string>;
  }

  const targetVar = (targetLookupResult as { success: true; data: Variable }).data;
  if (!targetVar.mutable) {
    return { success: false, error: "Cannot assign through pointer to immutable variable: " + ptrVar.value };
  }

  const range = TYPE_RANGES[targetVar.type];
  const validateResult = validateNumber(newValue, range, targetVar.type);
  if (!validateResult.success) {
    return validateResult as unknown as Result<void, string>;
  }

  targetVar.value = newValue;
  return { success: true, data: undefined };
}

export function lookupVariable(scope: VariableScope, name: string): Result<Variable, string> {
  let current: VariableScope | null = scope;

  while (current !== null) {
    if (current.variables.has(name)) {
      return { success: true, data: current.variables.get(name) as Variable };
    }
    current = current.parent;
  }

  return { success: false, error: "Undefined variable: " + name };
}

export function lookupFunction(scope: VariableScope, name: string): Result<FunctionDef, string> {
  let current: VariableScope | null = scope;

  while (current !== null) {
    if (current.functions.has(name)) {
      return { success: true, data: current.functions.get(name) as FunctionDef };
    }
    current = current.parent;
  }

  return { success: false, error: "Undefined function: " + name };
}

export function declareFunction(scope: VariableScope, name: string, parameters: FunctionParameter[], returnType: string, body: string): Result<void, string> {
  if (scope.functions.has(name)) {
    return { success: false, error: "Function " + name + " already declared in this scope" };
  }

  if (!TYPE_RANGES[returnType]) {
    return { success: false, error: "Unknown return type: " + returnType };
  }

  for (const param of parameters) {
    if (!TYPE_RANGES[param.type]) {
      return { success: false, error: "Unknown parameter type: " + param.type };
    }
  }

  scope.functions.set(name, { name, parameters, returnType, body });
  return { success: true, data: undefined };
}

export function interpretWithVariables(input: string, scope: VariableScope): Result<number | bigint, string> {
  const trimmed = input.trim();

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    const lookupResult = lookupVariable(scope, trimmed);
    if (lookupResult.success) {
      const varData = (lookupResult as { success: true; data: Variable }).data;
      // If the variable is a pointer/reference, dereference it
      if (typeof varData.value === "string") {
        // This is a reference - look up the referenced variable recursively
        return interpretWithVariables(varData.value, scope);
      }
      // Arrays cannot be interpreted directly - must use indexing
      if (Array.isArray(varData.value)) {
        return { success: false, error: "Cannot interpret array directly - use array indexing: " + trimmed + "[index]" };
      }
      return { success: true, data: varData.value as number | bigint };
    } else {
      return lookupResult;
    }
  }

   return getInterpret()(trimmed, scope);
}

export function executeFunctionCall(scope: VariableScope, funcName: string, args: (number | bigint)[], argTypes: (string | null)[]): Result<number | bigint, string> {
  const lookupResult = lookupFunction(scope, funcName);
  if (!lookupResult.success) {
    return lookupResult;
  }

  const func = (lookupResult as { success: true; data: FunctionDef }).data;

  if (args.length !== func.parameters.length) {
    return { success: false, error: "Function " + funcName + " expects " + func.parameters.length + " arguments, got " + args.length };
  }

  const funcScope = createScope(scope);

  for (let i = 0; i < func.parameters.length; i++) {
    const param = func.parameters[i];
    const argType = argTypes[i];

    if (argType !== null && !canCoerceType(argType, param.type)) {
      return { success: false, error: "Cannot coerce argument " + i + " from type " + argType + " to " + param.type };
    }

    const declResult = declareVariable(funcScope, param.name, param.type, args[i], false);
    if (!declResult.success) {
      return declResult;
    }
  }

  const bodyResult = getInterpretStatementBlock()(func.body, funcScope);
  let returnValue: number | bigint;
  
  if (!bodyResult.success) {
    const bodyAsExpr = interpretWithVariables(func.body, funcScope);
    if (!bodyAsExpr.success) {
      return bodyAsExpr;
    }
    returnValue = (bodyAsExpr as { success: true; data: number | bigint }).data;
  } else {
    returnValue = (bodyResult as { success: true; data: number | bigint }).data;
  }

  const returnRange = TYPE_RANGES[func.returnType];
  const validateResult = validateNumber(returnValue, returnRange, func.returnType);
  if (!validateResult.success) {
    return validateResult as unknown as Result<number | bigint, string>;
  }

  return { success: true, data: returnValue };
}
