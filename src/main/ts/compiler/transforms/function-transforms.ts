import {
  isIdentifierChar,
  isWhitespace,
  skipWhitespace,
} from "../parsing/string-helpers";
import { extractParamNamesFromRaw } from "../parsing/param-helpers";
import { parseBracedBlock } from "../parsing/parse-helpers";

function extractFunctionParams(rawParams: string): string {
  return extractParamNamesFromRaw(rawParams).join(", ");
}

function replaceThisKeyword(body: string, replacement: string): string {
  let result = "";
  for (let idx = 0; idx < body.length; idx++) {
    if (
      body.slice(idx, idx + 4) === "this" &&
      (idx === 0 || !isIdentifierChar(body[idx - 1])) &&
      (idx + 4 >= body.length || !isIdentifierChar(body[idx + 4]))
    ) {
      result += replacement;
      idx += 3;
    } else {
      result += body[idx];
    }
  }
  return result;
}

function replaceBoundThis(body: string): string {
  // If body has nested functions and returns this, create an object with methods
  const hasNestedFunctions = body.includes("fn ");
  const hasBraces = body.trim().startsWith("{") && body.trim().endsWith("}");

  if (hasNestedFunctions && body.includes("this")) {
    // Extract nested function names by parsing "fn name(...)"
    const methodNames: string[] = [];
    let i = 0;
    while (i < body.length) {
      if (
        body.slice(i, i + 2) === "fn" &&
        (i === 0 || !isIdentifierChar(body[i - 1]))
      ) {
        let j = i + 2;
        while (j < body.length && isWhitespace(body[j])) j++;
        if (j < body.length && isIdentifierChar(body[j])) {
          const nameStart = j;
          while (j < body.length && isIdentifierChar(body[j])) j++;
          methodNames.push(body.slice(nameStart, j));
        }
      }
      i++;
    }

    if (methodNames.length > 0) {
      // Replace "this" with a return statement for object with methods
      const objectProps = methodNames.join(", ");
      const replacement = hasBraces
        ? `return { ${objectProps} }`
        : `{ ${objectProps} }`;
      return replaceThisKeyword(body, replacement);
    }
  }

  // Regular case: just replace `this` with `thisVal`
  return replaceThisKeyword(body, "thisVal");
}

/**
 * Find opening brace of function body and count depth to find closing brace
 */
function findFunctionBodyEnd(source: string, bodyStart: number): number {
  if (bodyStart >= source.length || source[bodyStart] !== "{") {
    // No explicit braces, find end by semicolon
    let i = bodyStart;
    while (i < source.length && source[i] !== ";") {
      i++;
    }
    return i;
  }

  // Has braces, find matching closing brace
  return parseBracedBlock(source, bodyStart).endIdx;
}

/**
 * Check if this is a top-level function (not nested inside another function or braces)
 */
function isTopLevelFunction(source: string, fnStart: number): boolean {
  let i = fnStart - 1;
  let braceDepth = 0;

  // Look backward to see if we're inside a function body (enclosed in braces)
  while (i >= 0) {
    if (source[i] === "}") braceDepth++;
    else if (source[i] === "{") {
      if (braceDepth === 0) return false; // We're inside braces
      braceDepth--;
    }
    i--;
  }
  return true; // No unclosed braces before this function
}

function extractFunctionHeader(
  source: string,
  startIdx: number,
): { fnName: string; params: string; bodyStart: number } | undefined {
  let i = startIdx + 2;
  i = skipWhitespace(source, i);
  const nameStart = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  const fnName = source.slice(nameStart, i);
  i = skipWhitespace(source, i);

  // Skip generic type parameters <T>, <A, B>, etc.
  if (i < source.length && source[i] === "<") {
    let angleDepth = 1;
    i++;
    while (i < source.length && angleDepth > 0) {
      if (source[i] === "<") angleDepth++;
      else if (source[i] === ">") angleDepth--;
      i++;
    }
    i = skipWhitespace(source, i);
  }

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
  return { fnName, params, bodyStart: i };
}

function processFunctionDeclaration(
  source: string,
  startIdx: number,
): { declaration: string; newIdx: number } | undefined {
  if (!isTopLevelFunction(source, startIdx)) return undefined;
  const header = extractFunctionHeader(source, startIdx);
  if (!header) return undefined;

  const bodyStart = header.bodyStart;
  const bodyEnd = findFunctionBodyEnd(source, bodyStart);
  let body = source.slice(bodyStart, bodyEnd).trim();
  if (!body.includes("fn ") && body.startsWith("{") && body.endsWith("}")) {
    body = body.slice(1, -1).trim();
  }
  body = replaceBoundThis(body);
  if (body.trim() === "") body = "0";

  let i = bodyEnd;
  if (i < source.length && source[i] === "}") i++;
  while (i < source.length && (source[i] === ";" || isWhitespace(source[i])))
    i++;

  return {
    declaration: header.fnName + " = (" + header.params + ") => " + body + ",",
    newIdx: i,
  };
}

export function transformFunctionDeclarations(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (
      source.slice(i, i + 2) === "fn" &&
      (i === 0 || !isIdentifierChar(source[i - 1]))
    ) {
      const processed = processFunctionDeclaration(source, i);
      if (processed) {
        result += processed.declaration;
        i = processed.newIdx;
      } else {
        result += source[i];
        i++;
      }
      continue;
    }
    result += source[i];
    i++;
  }
  return result;
}
