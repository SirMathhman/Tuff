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
import { callInterpreter, type ScopeContext } from "../../types/interpreter";
import {
  validateGenericTypeConsistency,
  getConcreteType,
} from "../generics/generic-validation";
import { isValidIdentifier } from "../identifier-utils";
import { getTypeNameForVar } from "../../expressions/drop-helpers";

type FnContext = ScopeContext;

/**
 * Validate generic type consistency for a function call
 * Ensures all parameters using the same generic type get compatible arguments
 */
function validateGenericTypeConsistencyForCall(
  fnDef: FnDef,
  argParts: string[],
  _actualFnName: string,
): void {
  if (!fnDef.generics || fnDef.generics.length === 0) {
    return; // Not a generic function
  }

  const generics = fnDef.generics;
  const typeMapping = new Map<string, string>(); // Maps generic param (e.g., "T") to concrete type

  // Build type mapping from arguments
  for (let i = 0; i < argParts.length && i < fnDef.params.length; i++) {
    const argStr = argParts[i]!;
    const param = fnDef.params[i]!;
    const paramTypeStr = param.typeStr;

    // Check if parameter type is a generic parameter
    if (paramTypeStr && generics.includes(paramTypeStr)) {
      const concreteType = getConcreteType(argStr);
      validateGenericTypeConsistency(typeMapping, paramTypeStr, concreteType);
    }
  }
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

function shouldMoveDroppableArg(params: {
  argStr: string;
  paramTypeStr: string | undefined;
  ctx: FnContext;
}): string | undefined {
  const trimmedArg = params.argStr.trim();
  const paramTypeStr = params.paramTypeStr;
  if (!paramTypeStr) return undefined;
  if (!isValidIdentifier(paramTypeStr)) return undefined;
  if (!params.ctx.typeMap.has("__drop__" + paramTypeStr)) return undefined;
  if (!isValidIdentifier(trimmedArg)) return undefined;
  const argTypeName = getTypeNameForVar(
    trimmedArg,
    new Map(),
    params.ctx.typeMap,
  );
  if (argTypeName !== paramTypeStr) return undefined;
  return trimmedArg;
}

function evalAndValidateNonFunctionArg(params: {
  argStr: string;
  paramType: number;
  paramTypeStr: string | undefined;
  paramName: string;
  actualFnName: string;
  ctx: FnContext;
}): number {
  const argValue = callInterpreter(params.ctx, params.argStr);
  validateArgumentType(
    argValue,
    params.paramType,
    params.paramTypeStr,
    params.paramName,
    params.actualFnName,
  );

  const movedVarName = shouldMoveDroppableArg({
    argStr: params.argStr,
    paramTypeStr: params.paramTypeStr,
    ctx: params.ctx,
  });
  if (movedVarName) params.ctx.movedSet?.add(movedVarName);

  return argValue;
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

  // Validate generic type consistency
  validateGenericTypeConsistencyForCall(fnDef, argParts, actualFnName);

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
      args.push(
        evalAndValidateNonFunctionArg({
          argStr,
          paramType,
          paramTypeStr,
          paramName,
          actualFnName,
          ctx,
        }),
      );
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
      paramTypeStr = fnDef.params[i]?.typeStr,
      paramValue = args[i];
    if (paramName && paramValue !== undefined) {
      if (paramType === -2)
        setFunctionRef(paramName, getFunctionRef(`__arg_${i}`) || "");
      fnVarMap.set(paramName, paramValue);
      // Parameter is mutable if its type is *mut (mutable pointer)
      const isMutableParam = paramTypeStr && paramTypeStr.startsWith("*mut ");
      fnScope.set(paramName, isMutableParam ? true : false);
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
