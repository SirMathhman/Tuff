import type { FnDef } from "../../function-defs";
import {
  functionDefs,
  setFunctionRef,
  getFunctionRef,
  setCurrentFunctionParams,
} from "../../function-defs";
import { registerAnonymousFunction } from "../../handlers/functions/anonymous-functions";
import { extractReturnTypeFromFunctionType } from "./function-utils";
import { getLocalFunctionNames, setLocalFunctionNames } from "../scope-helpers";

interface FnContext {
  scope: Map<string, number>;
  typeMap: Map<string, number>;
  mutMap: Map<string, boolean>;
  uninitializedSet: Set<string>;
  unmutUninitializedSet: Set<string>;
  interpreter: (
    s: string,
    scope: Map<string, number>,
    typeMap: Map<string, number>,
    mutMap: Map<string, boolean>,
    uninitializedSet: Set<string>,
    unmutUninitializedSet: Set<string>,
  ) => number;
}

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

/**
 * Validate that an argument value is compatible with the expected parameter type
 */
function validateArgumentType(
  argValue: number,
  paramType: number,
  paramTypeStr: string | undefined,
  paramName: string,
  actualFnName: string,
): void {
  // Type -2 is for function types, skip validation
  if (paramType === -2) {
    return;
  }

  // Type -3 is for struct types, skip validation
  if (paramType === -3) {
    return;
  }

  // 1 is the type code for Bool
  if (paramTypeStr === "Bool" || paramType === 1) {
    // Bool values must be 0 or 1
    if (argValue !== 0 && argValue !== 1) {
      throw new Error(
        `Function '${actualFnName}' parameter '${paramName}' expects type Bool, but got value ${argValue}`,
      );
    }
  }
}

export function processArguments(
  argParts: string[],
  fnDef: FnDef,
  actualFnName: string,
  ctx: FnContext,
): number[] {
  if (argParts.length !== fnDef.params.length)
    throw new Error(
      `function ${actualFnName} expects ${fnDef.params.length} arguments, got ${argParts.length}`,
    );
  const args: number[] = [];
  for (let i = 0; i < argParts.length; i++) {
    const argStr = argParts[i]!;
    const param = fnDef.params[i];
    const paramType = param?.type ?? 0;
    const paramTypeStr = param?.typeStr;
    const paramName = param?.name ?? `param${i}`;

    if (paramType === -2) {
      const inferredReturnType = paramTypeStr
        ? extractReturnTypeFromFunctionType(paramTypeStr, ctx.typeMap)
        : 0;
      const anonResult = registerAnonymousFunction(
        argStr,
        ctx.typeMap,
        inferredReturnType,
      );
      if (!anonResult) throw new Error(`failed to register lambda: ${argStr}`);
      functionDefs.set(anonResult.name, anonResult.def);
      args.push(1);
      setFunctionRef(`__arg_${i}`, anonResult.name);
    } else {
      const argValue = callInterpreter(ctx, argStr);
      // Validate argument type compatibility
      validateArgumentType(
        argValue,
        paramType,
        paramTypeStr,
        paramName,
        actualFnName,
      );
      args.push(argValue);
    }
  }
  return args;
}

export function createFunctionScope(
  fnDef: FnDef,
  args: number[],
  ctx: FnContext,
): Map<string, number> {
  const fnScope = new Map<string, boolean>(ctx.mutMap),
    fnVarMap = new Map<string, number>();
  for (let i = 0; i < fnDef.params.length; i++) {
    const paramName = fnDef.params[i]?.name,
      paramType = fnDef.params[i]?.type,
      paramValue = args[i];
    if (paramName && paramValue !== undefined) {
      if (paramType === -2)
        setFunctionRef(paramName, getFunctionRef(`__arg_${i}`) || "");
      fnVarMap.set(paramName, paramValue);
      fnScope.set(paramName, false);
    }
  }
  const mergedScope = new Map(ctx.scope);
  for (const [k, v] of fnVarMap) mergedScope.set(k, v);
  return mergedScope;
}

export function executeFunctionBody(
  fnDef: FnDef,
  args: number[],
  mergedScope: Map<string, number>,
  ctx: FnContext,
): number {
  const paramsList = fnDef.params.map((p, i) => ({
    name: p.name,
    value: args[i]!,
  }));
  setCurrentFunctionParams(paramsList);
  const prevLocalFns = getLocalFunctionNames();
  setLocalFunctionNames(new Set());
  const result = ctx.interpreter(
    fnDef.body,
    mergedScope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
  );
  setCurrentFunctionParams(undefined);
  setLocalFunctionNames(prevLocalFns);
  return result;
}

export type { FnContext };
