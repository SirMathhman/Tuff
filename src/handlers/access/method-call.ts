import {
  GLOBAL_THIS_VALUE,
  getInstanceMethods,
} from "../../utils/this-keyword";
import { isStructInstance, getStructFields } from "../../types/structs";
import type {
  Interpreter,
  InterpreterContext,
} from "../../expressions/handlers";
import type { BaseHandlerParams } from "../../utils/function/function-call-params";
import { toInterpreterContext } from "../../utils/function/function-call-params";
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
): number | undefined {
  const receiverValue = interpreter(
    receiverStr,
    ctx.scope,
    ctx.typeMap,
    ctx.mutMap,
    ctx.uninitializedSet,
    ctx.unmutUninitializedSet,
    ctx.visMap,
  );
  return handleSpecialMethodCall(
    receiverStr,
    methodName,
    receiverValue,
    argsStr,
    rest,
    ctx,
    interpreter,
    ctx.scope,
  );
}

export function handleMethodCall(p: BaseHandlerParams): number | undefined {
  const trimmed = p.s.trim();
  const parsed = parseMethodCall(trimmed);
  if (!parsed) return undefined;
  if (p.typeMap.has("__object__" + parsed.receiverStr)) return undefined;
  const { receiverStr, methodName, argsStr, rest } = parsed;
  const isModuleRef = p.typeMap.has("__module__" + receiverStr);
  const ctx: InterpreterContext = toInterpreterContext(p);
  if (isModuleRef) {
    return handleModuleMethod(methodName, argsStr, rest, ctx, p.interpreter);
  }
  return evaluateReceiverAndHandleCall(
    receiverStr,
    methodName,
    argsStr,
    rest,
    ctx,
    p.interpreter,
  );
}
