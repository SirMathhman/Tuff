import { isWhitespace, isIdentifierChar } from "./parsing/string-helpers";

export function findReceiverStart(
  result: string,
  isClosingParen: boolean,
): number {
  let receiverStart = result.length - 1;
  if (isClosingParen) {
    let depth = 1;
    receiverStart--;
    while (receiverStart >= 0 && depth > 0) {
      const c = result.charAt(receiverStart);
      if (c === ")") depth++;
      else if (c === "(") depth--;
      receiverStart--;
    }
    receiverStart++;
    while (
      receiverStart > 0 &&
      isIdentifierChar(result.charAt(receiverStart - 1))
    )
      receiverStart--;
  } else {
    while (receiverStart > 0) {
      const charLeft = result.charAt(receiverStart - 1);
      if (charLeft === "." || isIdentifierChar(charLeft)) {
        receiverStart--;
      } else {
        break;
      }
    }
  }
  return receiverStart;
}

export function collectLocalVariables(source: string): Set<string> {
  const localVars = new Set<string>();
  let braceDepth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      braceDepth--;
    } else if (braceDepth > 0 && source.slice(i, i + 5) === "const") {
      let j = i + 5;
      while (j < source.length && isWhitespace(source.charAt(j))) j++;
      const nameStart = j;
      while (j < source.length && isIdentifierChar(source.charAt(j))) j++;
      if (j > nameStart) {
        localVars.add(source.slice(nameStart, j));
      }
    }
  }
  return localVars;
}
