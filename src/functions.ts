import { isValidIdentifier } from "./utils/identifier-utils";
import { registerAnonymousFunction } from "./handlers/functions/anonymous-functions";
import {
  isFunctionType,
  extractReturnTypeFromFunctionType,
} from "./utils/function/function-utils";
import { createFunctionDeclarationHandler } from "./handlers/functions/function-declaration";
import type { FunctionCallParams } from "./utils/function/function-call-params";
import {
  getLocalFunctionNames,
  setLocalFunctionNames,
  addLocalFunctionName,
} from "./utils/scope-helpers";
import { handleNativeFunctionCall } from "./utils/native/native-call";
import {
  findMatchingCloseParen,
  extractFunctionName,
} from "./utils/function/function-helpers";
import { parseArguments } from "./utils/function/parse-arguments";

type FnDef = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
  generics?: string[];
};
const functionDefs = new Map<string, FnDef>();
export {
  functionDefs,
  registerAnonymousFunction,
  isFunctionType,
  getLocalFunctionNames,
  setLocalFunctionNames,
  addLocalFunctionName,
};
const functionRefs = new Map<string, string>();
export const setFunctionRef = (varName: string, fnName: string) =>
  functionRefs.set(varName, fnName);
export const getFunctionRef = (varName: string) => functionRefs.get(varName);
export const handleFunctionDeclaration =
  createFunctionDeclarationHandler(functionDefs);

// Track current function context for 'this' support
let currentFunctionParams: Array<{ name: string; value: number }> | undefined;
export const getCurrentFunctionParams = () => currentFunctionParams;
export const setCurrentFunctionParams = (
  params: Array<{ name: string; value: number }> | undefined,
) => {
  currentFunctionParams = params;
};

export function parseFunctionCall(p: FunctionCallParams): number | undefined {
  const {
    s,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter,
  } = p;
  const trimmed = s.trim();
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex === -1) return undefined;
  const fnNamePart = trimmed.slice(0, parenIndex).trim();
  const { name: fnName } = extractFunctionName(fnNamePart);
  if (!isValidIdentifier(fnName)) return undefined;
  const referencedFnName = getFunctionRef(fnName);
  const actualFnName = referencedFnName || fnName;
  
  // Check for native function first
  const nativeFunc =
    typeof globalThis !== "undefined"
      ? (globalThis as Record<string, unknown>)[`__native__${actualFnName}`]
      : undefined;
  const hasNativeFunc = typeof nativeFunc === "function";
  
  if (!hasNativeFunc && !functionDefs.has(actualFnName)) return undefined;

  const closeParenIndex = findMatchingCloseParen(trimmed, parenIndex);
  if (closeParenIndex === -1) return undefined;

  // Check for trailing content after the function call
  const rest = trimmed.slice(closeParenIndex + 1).trim();

  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();
  
  if (hasNativeFunc) {
    return handleNativeFunctionCall(
      actualFnName,
      argsStr,
      rest,
      scope,
      typeMap,
      mutMap,
      uninitializedSet,
      unmutUninitializedSet,
      interpreter,
    );
  }
  
  const fnDef = functionDefs.get(actualFnName)!;
  const argParts = parseArguments(argsStr);
  if (argParts.length !== fnDef.params.length)
    throw new Error(
      `function ${actualFnName} expects ${fnDef.params.length} arguments, got ${argParts.length}`,
    );
  const args: number[] = [];
  for (let i = 0; i < argParts.length; i++) {
    const argStr = argParts[i]!;
    const paramType = fnDef.params[i]?.type;
    if (paramType === -2) {
      const paramTypeStr = fnDef.params[i]?.typeStr;
      const inferredReturnType = paramTypeStr
        ? extractReturnTypeFromFunctionType(paramTypeStr, typeMap)
        : 0;
      const anonResult = registerAnonymousFunction(
        argStr,
        typeMap,
        inferredReturnType,
      );
      if (!anonResult)
        throw new Error(`failed to register lambda: ${argStr}`);
      functionDefs.set(anonResult.name, anonResult.def);
      args.push(1);
      setFunctionRef(`__arg_${i}`, anonResult.name);
    } else {
      args.push(
        interpreter(
          argStr,
          scope,
          typeMap,
          mutMap,
          uninitializedSet,
          unmutUninitializedSet,
        ),
      );
    }
  }

  const fnScope = new Map<string, boolean>(mutMap),
    fnVarMap = new Map<string, number>();
  for (let i = 0; i < fnDef.params.length; i++) {
    const paramName = fnDef.params[i]?.name;
    const paramType = fnDef.params[i]?.type;
    const paramValue = args[i];
    if (paramName && paramValue !== undefined) {
      if (paramType === -2) {
        setFunctionRef(paramName, getFunctionRef(`__arg_${i}`) || "");
      }
      fnVarMap.set(paramName, paramValue);
      fnScope.set(paramName, false);
    }
  }
  const mergedScope = new Map(scope);
  for (const [k, v] of fnVarMap) mergedScope.set(k, v);

  // Set function context for 'this' support
  const paramsList = fnDef.params.map((p, i) => ({
    name: p.name,
    value: args[i]!,
  }));
  setCurrentFunctionParams(paramsList);

  // Initialize local function tracking for this function's execution
  const prevLocalFns = getLocalFunctionNames();
  setLocalFunctionNames(new Set());

  const result = interpreter(
    fnDef.body,
    mergedScope,
    typeMap,
    fnScope,
    uninitializedSet,
    unmutUninitializedSet,
  );

  // Clear function context
  setCurrentFunctionParams(undefined);
  setLocalFunctionNames(prevLocalFns);

  // Handle trailing content after the function call (e.g., .field in foo().field)
  if (rest === "") {
    return result;
  }

  return interpreter(
    result.toString() + rest,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}
