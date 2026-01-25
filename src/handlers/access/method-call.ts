import { isValidIdentifier } from "../../utils/identifier-utils";
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
import { findMatchingCloseParen } from "../../utils/function/function-helpers";

function isWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isAlpha(ch: string | undefined): boolean {
  if (!ch) return false;
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isAlphaNumeric(ch: string | undefined): boolean {
  if (!ch) return false;
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}

function callMethodAndHandleRest(
  methodCallStr: string,
  ctx: InterpreterContext,
  interpreter: Interpreter,
  rest: string,
  _closeParenIndex: number,
  _trimmed: string,
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

  if (rest === "") {
    return methodResult;
  }

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
  const ctx: InterpreterContext = {
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    visMap,
  };
  const trimmed = s.trim();

  // Look for the pattern: <receiver>.<methodName>(<args>)
  let dotIndex = -1;
  let parenIndex = -1;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === ".") {
      let j = i + 1;
      while (j < trimmed.length && isWhitespace(trimmed[j])) j++;

      if (j < trimmed.length && isAlpha(trimmed[j])) {
        let idEnd = j;
        while (idEnd < trimmed.length && isAlphaNumeric(trimmed[idEnd]))
          idEnd++;

        while (idEnd < trimmed.length && isWhitespace(trimmed[idEnd])) idEnd++;

        if (idEnd < trimmed.length && trimmed[idEnd] === "(") {
          dotIndex = i;
          parenIndex = idEnd;
          break;
        }
      }
    }
  }

  if (dotIndex === -1 || parenIndex === -1) return undefined;

  const receiverStr = trimmed.slice(0, dotIndex).trim();

  // Check if receiver is a module reference (module member access)
  const isModuleRef = typeMap.has("__module__" + receiverStr);

  // Check if receiver is an object (struct instance)
  if (typeMap.has("__object__" + receiverStr)) {
    return undefined;
  }

  let methodStart = dotIndex + 1;
  while (methodStart < trimmed.length && isWhitespace(trimmed[methodStart]))
    methodStart++;
  let methodEnd = methodStart;
  while (methodEnd < trimmed.length && isAlphaNumeric(trimmed[methodEnd]))
    methodEnd++;
  const methodName = trimmed.slice(methodStart, methodEnd);

  if (!isValidIdentifier(methodName)) return undefined;

  const closeParenIndex = findMatchingCloseParen(trimmed, parenIndex);

  if (closeParenIndex === -1) return undefined;

  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();

  // Handle module member access (e.g., temp.get() where temp is a module reference)
  if (isModuleRef) {
    const methodCallStr = argsStr
      ? `${methodName}(${argsStr})`
      : `${methodName}()`;

    const rest = trimmed.slice(closeParenIndex + 1).trim();

    return callMethodAndHandleRest(
      methodCallStr,
      ctx,
      interpreter,
      rest,
      closeParenIndex,
      trimmed,
    );
  }

  const receiverValue = interpreter(
    receiverStr,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );

  // Check if this is method call on 'this' keyword or on a function-context struct
  const isThisKeywordLiteral = receiverStr.trim() === "this";
  const isFunctionContextStruct =
    isStructInstance(receiverValue) &&
    getInstanceMethods(receiverValue) !== undefined;
  const instanceMethods = isFunctionContextStruct
    ? getInstanceMethods(receiverValue)
    : undefined;

  // If this is a call to a nested function on a function-context struct instance
  if (
    isFunctionContextStruct &&
    instanceMethods &&
    instanceMethods.has(methodName)
  ) {
    // Create a scope that includes the fields of the struct instance
    const instanceScope = new Map(scope);
    const instanceFields = getStructFields(receiverValue);
    if (instanceFields) {
      for (const [fieldName, fieldValue] of instanceFields) {
        instanceScope.set(fieldName, fieldValue);
      }
    }

    // Call the method function with the instance scope
    const methodCallStr = argsStr
      ? `${methodName}(${argsStr})`
      : `${methodName}()`;

    const rest = trimmed.slice(closeParenIndex + 1).trim();

    const instanceCtx: InterpreterContext = {
      scope: instanceScope,
      typeMap: ctx.typeMap,
      mutMap: ctx.mutMap,
      uninitializedSet: ctx.uninitializedSet,
      unmutUninitializedSet: ctx.unmutUninitializedSet,
      visMap: ctx.visMap,
    };

    return callMethodAndHandleRest(
      methodCallStr,
      instanceCtx,
      interpreter,
      rest,
      closeParenIndex,
      trimmed,
    );
  }

  // Handle regular method calls or global/function 'this' method calls
  const isGlobalThis = receiverValue === GLOBAL_THIS_VALUE;
  const isFunctionThis =
    isThisKeywordLiteral && isStructInstance(receiverValue);
  const shouldNotPrependReceiver = isGlobalThis || isFunctionThis;

  const methodCallStr = shouldNotPrependReceiver
    ? argsStr
      ? `${methodName}(${argsStr})`
      : `${methodName}()`
    : argsStr
      ? `${methodName}(${receiverValue}, ${argsStr})`
      : `${methodName}(${receiverValue})`;

  const rest = trimmed.slice(closeParenIndex + 1).trim();

  return callMethodAndHandleRest(
    methodCallStr,
    ctx,
    interpreter,
    rest,
    closeParenIndex,
    trimmed,
  );
}
