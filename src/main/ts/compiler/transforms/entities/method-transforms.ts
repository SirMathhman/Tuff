import {
  extractArguments,
  checkMethodValidity,
} from "../helpers/method-call-helpers";
import { isIdentifierChar, skipWhitespace } from "../../parsing/string-helpers";
import { findReceiverStart, collectLocalVariables } from "../../compiler-utils";

const BUILTIN_METHODS = new Set(["charCodeAt", "length"]);

// Map Tuff properties to JS equivalents
const PROPERTY_ALIASES: Record<string, string> = {
  init: "length",
};

/**
 * Collect module/object names by looking for patterns like "Name = {"
 */
export function collectModuleNames(source: string): Set<string> {
  const moduleNames = new Set<string>();
  let i = 0;
  while (i < source.length) {
    // Look for identifier followed by = {
    if (
      isIdentifierChar(source.charAt(i)) &&
      (i === 0 || !isIdentifierChar(source.charAt(i - 1)))
    ) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source.charAt(i))) i++;
      const name = source.slice(nameStart, i);

      // Skip whitespace
      let j = skipWhitespace(source, i);

      // Check for = {
      if (j < source.length && source.charAt(j) === "=") {
        j++;
        j = skipWhitespace(source, j);
        if (j < source.length && source.charAt(j) === "{") {
          moduleNames.add(name);
        }
      }
    }
    i++;
  }
  return moduleNames;
}

function handleMethodCallWithArgs(
  methodName: string,
  receiver: string,
  args: string,
  newResult: string,
  j: number,
): { newI: number; newResult: string } {
  const trimmedReceiver = receiver.trim();
  if (trimmedReceiver === "this" || trimmedReceiver === "thisVal") {
    return {
      newI: j - 1,
      newResult: newResult + methodName + "(" + args + ")",
    };
  }
  const combined =
    newResult +
    methodName +
    "(" +
    receiver +
    (args.trim() ? ", " + args : "") +
    ")";
  return { newI: j - 1, newResult: combined };
}

function transformMethodCall(
  source: string,
  i: number,
  result: string,
  localVars: Set<string>,
  moduleNames: Set<string>,
): { newI: number; newResult: string } {
  let methodName = "";
  let j = i + 1;
  const len = source.length;
  while (j < len && isIdentifierChar(source.charAt(j))) {
    methodName += source.charAt(j);
    j++;
  }

  const methodCheck = checkMethodValidity(
    methodName,
    result,
    moduleNames,
    BUILTIN_METHODS,
    PROPERTY_ALIASES,
    findReceiverStart,
  );
  if (methodCheck?.type === "builtin" || localVars.has(methodName)) {
    return { newI: j - 1, newResult: result + "." + methodName };
  }
  if (methodCheck?.type === "alias") {
    return { newI: j - 1, newResult: result + "." + methodCheck.alias };
  }
  if (methodCheck?.type === "property") {
    return { newI: j - 1, newResult: result + "." + methodName };
  }

  while (j < len && source.charAt(j) === " ") j++;
  if (j < len && source.charAt(j) === "(") {
    const isClosing = result.charAt(result.length - 1) === ")";
    const receiverStart = findReceiverStart(result, isClosing);
    const receiver = result.slice(receiverStart);
    const newResult = result.slice(0, receiverStart);
    const { args, nextIdx } = extractArguments(source, j, len);
    return handleMethodCallWithArgs(
      methodName,
      receiver,
      args,
      newResult,
      nextIdx,
    );
  }
  return { newI: j - 1, newResult: result + "." + methodName };
}

export function transformMethodCalls(source: string): string {
  const localVars = collectLocalVariables(source);
  const moduleNames = collectModuleNames(source);
  let result = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source.charAt(i);
    const prevCh = i > 0 ? source.charAt(i - 1) : "";
    if (
      ch === "." &&
      result.length > 0 &&
      (isIdentifierChar(prevCh) || prevCh === ")")
    ) {
      const { newI, newResult } = transformMethodCall(
        source,
        i,
        result,
        localVars,
        moduleNames,
      );
      result = newResult;
      i = newI + 1;
    } else {
      result += source.charAt(i);
      i++;
    }
  }
  return result;
}
