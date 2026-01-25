import {
  GLOBAL_THIS_VALUE,
  getInstanceMethods,
} from "../../utils/this-keyword";
import { isStructInstance, getStructFields } from "../../types/structs";
import type {
  Interpreter,
  InterpreterContext,
} from "../../expressions/handlers";
import { parseFunctionCall } from "../../functions";
import { parseMethodCall, buildMethodCallString } from "./method-call-helpers";

function callMethodAndHandleRest(
  methodCallStr: string,
  ctx: InterpreterContext,
  interpreter: Interpreter,
  rest: string,
): number | undefined {
  const methodResult = parseFunctionCall({
    s: methodCallStr,
    typeMap: ctx.typeMap,
    scope: ctx.scope,
    mutMap: ctx.mutMap,
    uninitializedSet: ctx.uninitializedSet,
    unmutUninitializedSet: ctx.unmutUninitializedSet,
    interpreter,
    visMap: ctx.visMap,
  });
  if (methodResult === undefined) return undefined;
  if (rest === "") return methodResult;
  return interpreter(
    methodResult.toString() + rest,
    ctx.scope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
    ctx.visMap,
  );
}

function handleModuleMethod(
  methodName: string,
  argsStr: string,
  rest: string,
  ctx: InterpreterContext,
  interpreter: Interpreter,
): number | undefined {
  const methodCallStr = argsStr
    ? `${methodName}(${argsStr})`
    : `${methodName}()`;
  return callMethodAndHandleRest(methodCallStr, ctx, interpreter, rest);
}

function handleFunctionContextMethod(
  methodName: string,
  receiverValue: number,
  argsStr: string,
  rest: string,
  ctx: InterpreterContext,
  interpreter: Interpreter,
  scope: Map<string, number>,
): number | undefined {
  const instanceScope = new Map(scope);
  const instanceFields = getStructFields(receiverValue);
  if (instanceFields) {
    for (const [fieldName, fieldValue] of instanceFields) {
      instanceScope.set(fieldName, fieldValue);
    }
  }
  const methodCallStr = argsStr
    ? `${methodName}(${argsStr})`
    : `${methodName}()`;
  const instanceCtx: InterpreterContext = {
    scope: instanceScope,
    typeMap: ctx.typeMap,
    mutMap: ctx.mutMap,
    uninitializedSet: ctx.uninitializedSet,
    unmutUninitializedSet: ctx.unmutUninitializedSet,
    visMap: ctx.visMap,
  };
  return callMethodAndHandleRest(methodCallStr, instanceCtx, interpreter, rest);
}

function shouldHandleFunctionContextMethod(
  receiverValue: number,
  methodName: string,
): boolean {
  const isFunctionContextStruct =
    isStructInstance(receiverValue) &&
    getInstanceMethods(receiverValue) !== undefined;
  if (!isFunctionContextStruct) return false;
  const instanceMethods = getInstanceMethods(receiverValue);
  return instanceMethods !== undefined && instanceMethods.has(methodName);
}

function handleSpecialMethodCall(
  receiverStr: string,
  methodName: string,
  receiverValue: number,
  argsStr: string,
  rest: string,
  ctx: InterpreterContext,
  interpreter: Interpreter,
  scope: Map<string, number>,
): number | undefined {
  if (shouldHandleFunctionContextMethod(receiverValue, methodName)) {
    return handleFunctionContextMethod(
      methodName,
      receiverValue,
      argsStr,
      rest,
      ctx,
      interpreter,
      scope,
    );
  }
  const isThisKeywordLiteral = receiverStr.trim() === "this";
  const isGlobalThis = receiverValue === GLOBAL_THIS_VALUE;
  const isFunctionThis =
    isThisKeywordLiteral && isStructInstance(receiverValue);
  const shouldNotPrependReceiver = isGlobalThis || isFunctionThis;
  const methodCallStr = buildMethodCallString(
    methodName,
    receiverValue,
    argsStr,
    shouldNotPrependReceiver,
  );
  return callMethodAndHandleRest(methodCallStr, ctx, interpreter, rest);
}

function evaluateReceiverAndHandleCall(
  receiverStr: string,
  methodName: string,
  argsStr: string,
  rest: string,
  ctx: InterpreterContext,
  interpreter: Interpreter,
  scope: Map<string, number>,
  typeMap: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
): number | undefined {
  const receiverValue = interpreter(
    receiverStr,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
  return handleSpecialMethodCall(
    receiverStr,
    methodName,
    receiverValue,
    argsStr,
    rest,
    ctx,
    interpreter,
    scope,
  );
}

export function handleMethodCall(
  s: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
  visMap: Map<string, boolean> = new Map(),
): number | undefined {
  const trimmed = s.trim();
  const parsed = parseMethodCall(trimmed);
  if (!parsed) return undefined;
  if (typeMap.has("__object__" + parsed.receiverStr)) return undefined;
  const { receiverStr, methodName, argsStr, rest } = parsed;
  const isModuleRef = typeMap.has("__module__" + receiverStr);
  const ctx: InterpreterContext = {
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    visMap,
  };
  if (isModuleRef) {
    return handleModuleMethod(methodName, argsStr, rest, ctx, interpreter);
  }
  return evaluateReceiverAndHandleCall(
    receiverStr,
    methodName,
    argsStr,
    rest,
    ctx,
    interpreter,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}
