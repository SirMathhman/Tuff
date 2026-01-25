import { isIdentifierChar, isWhitespace } from "../parsing/string-helpers";

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

function extractFunctionParams(rawParams: string): string {
  let params = "";
  let j = 1;
  while (j < rawParams.length - 1) {
    if (isWhitespace(rawParams[j])) {
      j++;
      continue;
    }
    if (isIdentifierChar(rawParams[j])) {
      const pStart = j;
      while (j < rawParams.length && isIdentifierChar(rawParams[j])) j++;
      let paramName = rawParams.slice(pStart, j);
      if (paramName === "this") paramName = "thisVal";
      if (params) params += ", ";
      params += paramName;
      let nestedParenDepth = 0;
      while (j < rawParams.length) {
        if (rawParams[j] === "(") nestedParenDepth++;
        else if (rawParams[j] === ")") {
          if (nestedParenDepth === 0) break;
          nestedParenDepth--;
        } else if (rawParams[j] === "," && nestedParenDepth === 0) break;
        j++;
      }
      if (j < rawParams.length && rawParams[j] === ",") j++;
    } else {
      j++;
    }
  }
  return params;
}

function replaceBoundThis(body: string): string {
  let result = "";
  for (let idx = 0; idx < body.length; idx++) {
    if (
      body.slice(idx, idx + 4) === "this" &&
      (idx === 0 || !isIdentifierChar(body[idx - 1])) &&
      (idx + 4 >= body.length || !isIdentifierChar(body[idx + 4]))
    ) {
      result += "thisVal";
      idx += 3;
    } else {
      result += body[idx];
    }
  }
  return result;
}

export function transformFunctionDeclarations(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source.slice(i, i + 2) === "fn") {
      i += 2;
      i = skipWhitespace(source, i);
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source[i])) i++;
      const fnName = source.slice(nameStart, i);
      i = skipWhitespace(source, i);
      const paramsStart = i;
      if (i < source.length && source[i] === "(") {
        let parenCount = 1;
        i++;
        while (i < source.length && parenCount > 0) {
          if (source[i] === "(") parenCount++;
          else if (source[i] === ")") parenCount--;
          i++;
        }
      }
      const params = extractFunctionParams(source.slice(paramsStart, i));
      i = skipWhitespace(source, i);
      if (i < source.length && source[i] === ":") {
        while (
          i < source.length &&
          source[i] !== "=" &&
          source[i] !== ";" &&
          source[i] !== "{"
        )
          i++;
      }
      if (source.slice(i, i + 2) === "=>") i += 2;
      i = skipWhitespace(source, i);
      const bodyStart = i;
      while (i < source.length && source[i] !== ";") i++;
      const body = replaceBoundThis(source.slice(bodyStart, i).trim());
      if (i < source.length && source[i] === ";") i++;
      result += fnName + " = (" + params + ") => " + body + ",";
      continue;
    }
    result += source[i];
    i++;
  }
  return result;
}
