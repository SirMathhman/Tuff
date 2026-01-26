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
  setCurrentFunctionParams,
};

export const handleFunctionDeclaration =
  createFunctionDeclarationHandler(functionDefs);

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
  // Inline executeDefinedFunction
  const fnDef = functionDefs.get(actualFnName)!;
  const argParts = parseArguments(argsStr);
  const args = processArguments(argParts, fnDef, actualFnName, ctx);
  const mergedScope = createFunctionScope(fnDef, args, ctx);
  const result = executeFunctionBody(fnDef, args, mergedScope, ctx);
  if (rest === "") return result;
  return ctx.interpreter(
    result.toString() + rest,
    ctx.scope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
  );
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
  const parenIndex = trimmed.indexOf("(");
  if (parenIndex === -1) return undefined;
  const fnNamePart = trimmed.slice(0, parenIndex).trim();
  const { name: fnName } = extractFunctionName(fnNamePart);
  if (!isValidIdentifier(fnName)) return undefined;
  const referencedFnName = getFunctionRef(fnName),
    actualFnName = referencedFnName || fnName;
  const closeParenIndex = findMatchingCloseParen(trimmed, parenIndex);
  if (closeParenIndex === -1) return undefined;
  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();
  const rest = trimmed.slice(closeParenIndex + 1).trim();
  const nativeFunc =
    typeof globalThis !== "undefined"
      ? (globalThis as Record<string, unknown>)[`__native__${actualFnName}`]
      : undefined;
  const hasNativeFunc = typeof nativeFunc === "function";
  const hasFnDef = functionDefs.has(actualFnName);
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
