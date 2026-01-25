import { isValidIdentifier } from "./utils/identifier-utils";
import { registerAnonymousFunction } from "./handlers/functions/anonymous-functions";
import { isFunctionType } from "./utils/function/function-utils";
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
import {
  functionDefs,
  setFunctionRef,
  getFunctionRef,
  getCurrentFunctionParams,
  setCurrentFunctionParams,
} from "./function-defs";
import {
  processArguments,
  createFunctionScope,
  executeFunctionBody,
  type FnContext,
} from "./utils/function/invocation";

export {
  functionDefs,
  registerAnonymousFunction,
  isFunctionType,
  getLocalFunctionNames,
  setLocalFunctionNames,
  addLocalFunctionName,
  setFunctionRef,
  getFunctionRef,
  getCurrentFunctionParams,
  setCurrentFunctionParams,
};

export const handleFunctionDeclaration =
  createFunctionDeclarationHandler(functionDefs);

function callInterpreter(ctx: FnContext, input: string): number {
  return ctx.interpreter(
    input,
    ctx.scope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
  );
}

function validateAndParseFunctionCall(
  trimmed: string,
):
  | { fnName: string; actualFnName: string; argsStr: string; rest: string }
  | undefined {
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex === -1) return undefined;
  const fnNamePart = trimmed.slice(0, parenIndex).trim();
  const { name: fnName } = extractFunctionName(fnNamePart);
  if (!isValidIdentifier(fnName)) return undefined;
  const referencedFnName = getFunctionRef(fnName),
    actualFnName = referencedFnName || fnName;
  const closeParenIndex = findMatchingCloseParen(trimmed, parenIndex);
  if (closeParenIndex === -1) return undefined;
  return {
    fnName,
    actualFnName,
    argsStr: trimmed.slice(parenIndex + 1, closeParenIndex).trim(),
    rest: trimmed.slice(closeParenIndex + 1).trim(),
  };
}

function checkNativeOrDefinedFunction(actualFnName: string): {
  hasNativeFunc: boolean;
  hasFnDef: boolean;
} {
  const nativeFunc =
    typeof globalThis !== "undefined"
      ? (globalThis as Record<string, unknown>)[`__native__${actualFnName}`]
      : undefined;
  return {
    hasNativeFunc: typeof nativeFunc === "function",
    hasFnDef: functionDefs.has(actualFnName),
  };
}

function handleResultWithRest(
  result: number,
  rest: string,
  ctx: FnContext,
): number {
  if (rest === "") return result;
  return callInterpreter(ctx, result.toString() + rest);
}

function executeDefinedFunction(
  actualFnName: string,
  argsStr: string,
  rest: string,
  ctx: FnContext,
): number {
  const fnDef = functionDefs.get(actualFnName)!;
  const argParts = parseArguments(argsStr);
  const args = processArguments(argParts, fnDef, actualFnName, ctx);
  const mergedScope = createFunctionScope(fnDef, args, ctx);
  const result = executeFunctionBody(fnDef, args, mergedScope, ctx);
  return handleResultWithRest(result, rest, ctx);
}

function handleFunctionExecution(
  actualFnName: string,
  argsStr: string,
  rest: string,
  ctx: FnContext,
  hasNativeFunc: boolean,
): number {
  if (hasNativeFunc) {
    return handleNativeFunctionCall(
      actualFnName,
      argsStr,
      rest,
      ctx.scope,
      ctx.typeMap,
      ctx.mutMap,
      ctx.uninitializedSet,
      ctx.unmutUninitializedSet,
      ctx.interpreter,
    );
  }
  return executeDefinedFunction(actualFnName, argsStr, rest, ctx);
}

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
  const parsed = validateAndParseFunctionCall(trimmed);
  if (!parsed) return undefined;
  const { actualFnName, argsStr, rest } = parsed;
  const { hasNativeFunc, hasFnDef } =
    checkNativeOrDefinedFunction(actualFnName);
  if (!hasNativeFunc && !hasFnDef) return undefined;
  const ctx: FnContext = {
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter,
  };
  return handleFunctionExecution(
    actualFnName,
    argsStr,
    rest,
    ctx,
    hasNativeFunc,
  );
}
