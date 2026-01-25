import { isValidIdentifier } from "../../utils/identifier-utils";
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

export function findMethodPattern(
  trimmed: string,
): { dotIndex: number; parenIndex: number } | undefined {
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
          return { dotIndex: i, parenIndex: idEnd };
        }
      }
    }
  }
  return undefined;
}

export function extractMethodName(
  trimmed: string,
  dotIndex: number,
): string | undefined {
  let methodStart = dotIndex + 1;
  while (methodStart < trimmed.length && isWhitespace(trimmed[methodStart]))
    methodStart++;
  let methodEnd = methodStart;
  while (methodEnd < trimmed.length && isAlphaNumeric(trimmed[methodEnd]))
    methodEnd++;
  const methodName = trimmed.slice(methodStart, methodEnd);
  return isValidIdentifier(methodName) ? methodName : undefined;
}

export interface ParsedMethodCall {
  dotIndex: number;
  parenIndex: number;
  receiverStr: string;
  methodName: string;
  argsStr: string;
  rest: string;
  closeParenIndex: number;
}

export function parseMethodCall(trimmed: string): ParsedMethodCall | undefined {
  const pattern = findMethodPattern(trimmed);
  if (!pattern) return undefined;
  const { dotIndex, parenIndex } = pattern;
  const receiverStr = trimmed.slice(0, dotIndex).trim();
  const methodName = extractMethodName(trimmed, dotIndex);
  if (!methodName) return undefined;
  const closeParenIndex = findMatchingCloseParen(trimmed, parenIndex);
  if (closeParenIndex === -1) return undefined;
  const argsStr = trimmed.slice(parenIndex + 1, closeParenIndex).trim();
  const rest = trimmed.slice(closeParenIndex + 1).trim();
  return {
    dotIndex,
    parenIndex,
    receiverStr,
    methodName,
    argsStr,
    rest,
    closeParenIndex,
  };
}

export function buildMethodCallString(
  methodName: string,
  receiverValue: number,
  argsStr: string,
  shouldNotPrependReceiver: boolean,
): string {
  if (shouldNotPrependReceiver) {
    return argsStr ? `${methodName}(${argsStr})` : `${methodName}()`;
  }
  return argsStr
    ? `${methodName}(${receiverValue}, ${argsStr})`
    : `${methodName}(${receiverValue})`;
}
