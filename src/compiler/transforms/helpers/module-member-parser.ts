import {
  isIdentifierChar,
  matchWord,
  skipWhitespace,
} from "../../parsing/string-helpers";
import { extractParamNamesFromRaw } from "../../parsing/param-helpers";

export interface ModuleMemberParseResult {
  js: string;
  memberName?: string;
  isPublic: boolean;
  privateVar?: { name: string; value: string };
  endIdx: number;
}

function skipOptionalTypeAnnotation(body: string, j: number): number {
  j = skipWhitespace(body, j);
  if (j < body.length && body[j] === ":") {
    j++;
    while (j < body.length && body[j] !== "=" && body[j] !== ";") j++;
  }
  return j;
}

function skipReturnTypeAndArrow(body: string, j: number): number {
  j = skipOptionalTypeAnnotation(body, j);
  if (body.slice(j, j + 2) === "=>") j += 2;
  return skipWhitespace(body, j);
}

function parseFunctionMember(
  body: string,
  j: number,
  isPublic: boolean,
): ModuleMemberParseResult | undefined {
  j += 2;
  j = skipWhitespace(body, j);
  const nameStart = j;
  while (j < body.length && isIdentifierChar(body[j])) j++;
  const fnName = body.slice(nameStart, j);
  j = skipWhitespace(body, j);

  if (j < body.length && body[j] === "<") {
    let angleDepth = 1;
    j++;
    while (j < body.length && angleDepth > 0) {
      if (body[j] === "<") angleDepth++;
      else if (body[j] === ">") angleDepth--;
      j++;
    }
    j = skipWhitespace(body, j);
  }

  if (j >= body.length || body[j] !== "(") return undefined;
  const paramsStart = j;
  let parenDepth = 1;
  j++;
  while (j < body.length && parenDepth > 0) {
    if (body[j] === "(") parenDepth++;
    else if (body[j] === ")") parenDepth--;
    j++;
  }
  const params = extractParamNamesFromRaw(body.slice(paramsStart, j)).join(
    ", ",
  );

  j = skipReturnTypeAndArrow(body, j);
  const bodyStart = j;
  while (j < body.length && body[j] !== ";") j++;
  const fnBody = body.slice(bodyStart, j).trim();
  const endIdx = j < body.length && body[j] === ";" ? j + 1 : j;
  if (!isPublic) {
    return { js: "", memberName: fnName, isPublic: false, endIdx };
  }
  return {
    js: `${fnName}: (${params}) => ${fnBody}`,
    memberName: fnName,
    isPublic: true,
    endIdx,
  };
}

function parseVariableMember(
  body: string,
  j: number,
  isPublic: boolean,
): ModuleMemberParseResult | undefined {
  j += 3;
  j = skipWhitespace(body, j);
  if (matchWord(body, j, "mut")) {
    j += 3;
    j = skipWhitespace(body, j);
  }

  const nameStart = j;
  while (j < body.length && isIdentifierChar(body[j])) j++;
  const varName = body.slice(nameStart, j);
  j = skipOptionalTypeAnnotation(body, j);
  j = skipWhitespace(body, j);

  if (j < body.length && body[j] === "=") {
    j++;
    j = skipWhitespace(body, j);
    const valueStart = j;
    while (j < body.length && body[j] !== ";") j++;
    const value = body.slice(valueStart, j).trim();
    if (j < body.length && body[j] === ";") j++;

    if (!isPublic) {
      return {
        js: "",
        memberName: varName,
        isPublic: false,
        privateVar: { name: varName, value },
        endIdx: j,
      };
    }
    return {
      js: `${varName}: ${value}`,
      memberName: varName,
      isPublic: true,
      endIdx: j,
    };
  }

  if (j < body.length && body[j] === ";") j++;
  return { js: "", isPublic, endIdx: j };
}

export function parseModuleMemberWithPrivate(
  body: string,
  i: number,
): ModuleMemberParseResult | undefined {
  let j = i;
  j = skipWhitespace(body, j);

  let isPublic = false;
  if (matchWord(body, j, "out")) {
    isPublic = true;
    j += 3;
    j = skipWhitespace(body, j);
  }

  if (matchWord(body, j, "fn")) {
    return parseFunctionMember(body, j, isPublic);
  }

  if (matchWord(body, j, "let")) {
    return parseVariableMember(body, j, isPublic);
  }

  return undefined;
}

export function scanModuleBody(
  body: string,
  onMember: (result: ModuleMemberParseResult) => void,
): void {
  let i = 0;
  while (i < body.length) {
    i = skipWhitespace(body, i);
    if (i >= body.length) break;

    const result = parseModuleMemberWithPrivate(body, i);
    if (result) {
      onMember(result);
      i = result.endIdx;
      continue;
    }

    while (i < body.length && body[i] !== ";") i++;
    if (i < body.length) i++;
  }
}
