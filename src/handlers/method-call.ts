import { isValidIdentifier } from "../utils/identifier-utils";
import { GLOBAL_THIS_VALUE } from "../utils/this-keyword";
import { isStructInstance } from "../types/structs";
import type { Interpreter } from "../expressions/handlers";
import { parseFunctionCall, findMatchingCloseParen } from "../functions";

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

export function handleMethodCall(
  s: string,
  typeMap: Map<string, number>,
  scope: Map<string, number>,
  mutMap: Map<string, boolean>,
  uninitializedSet: Set<string>,
  unmutUninitializedSet: Set<string>,
  interpreter: Interpreter,
): number | undefined {
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

  const receiverValue = interpreter(
    receiverStr,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );

  // Don't prepend receiver as argument if:
  // 1. It's the global this marker, OR
  // 2. It's a this-based struct instance (created inside a function)
  const isThisKeyword = receiverStr.trim() === "this";
  const isGlobalThis = receiverValue === GLOBAL_THIS_VALUE;
  const isFunctionThis = isThisKeyword && isStructInstance(receiverValue);
  const shouldNotPrependReceiver = isGlobalThis || isFunctionThis;

  const methodCallStr = shouldNotPrependReceiver
    ? argsStr
      ? `${methodName}(${argsStr})`
      : `${methodName}()`
    : argsStr
      ? `${methodName}(${receiverValue}, ${argsStr})`
      : `${methodName}(${receiverValue})`;

  const methodResult = parseFunctionCall({
    s: methodCallStr,
    typeMap,
    scope,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
    interpreter,
  });

  if (methodResult === undefined) return undefined;

  const rest = trimmed.slice(closeParenIndex + 1).trim();
  if (rest === "") {
    return methodResult;
  }

  return interpreter(
    methodResult.toString() + rest,
    scope,
    typeMap,
    mutMap,
    uninitializedSet,
    unmutUninitializedSet,
  );
}
