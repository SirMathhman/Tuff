import { extractTypeSize } from "../../type-utils";
import { makeDeclarationHandler } from "../../declarations";
import { isValidIdentifier } from "../../utils/identifier-utils";
import {
  isFunctionType,
  splitParametersRespectingParens,
  findClosingParenIndex,
} from "../../utils/function/function-utils";
import { addLocalFunctionName } from "../../utils/scope-helpers";
import { parseGenericParams } from "../../utils/generic-params";

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

type FnDef = {
  params: Array<{ name: string; type: number; typeStr?: string }>;
  returnType: number;
  body: string;
  generics?: string[];
};

function findFunctionHeaderEnd(rest: string): number {
  const angleStart = rest.indexOf("<");
  if (angleStart !== -1) {
    const headerEnd = rest.indexOf(">", angleStart);
    return headerEnd === -1 ? -1 : headerEnd;
  }
  const headerEnd = rest.indexOf("(") - 1;
  return headerEnd < 0 ? -1 : headerEnd;
}

function findBraceClosedBody(rest: string, bodyStart: number): number {
  let braceDepth = 0;
  for (let i = bodyStart; i < rest.length; i++) {
    if (rest[i] === "{") braceDepth++;
    else if (rest[i] === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        let semiIndex = i + 1;
        while (semiIndex < rest.length && isWhitespace(rest[semiIndex]!))
          semiIndex++;
        return semiIndex < rest.length && rest[semiIndex] === ";"
          ? semiIndex
          : -1;
      }
    }
  }
  return -1;
}

function findFunctionBodyEnd(rest: string, arrowIndex: number): number {
  let bodyStart = arrowIndex + 2;
  while (bodyStart < rest.length && isWhitespace(rest[bodyStart]!)) bodyStart++;
  if (bodyStart < rest.length && rest[bodyStart] === "{") {
    return findBraceClosedBody(rest, bodyStart);
  }
  return rest.indexOf(";", arrowIndex);
}

function extractFunctionHeader(
  rest: string,
): { fnHeaderStr: string; parenStart: number } | undefined {
  const angleStart = rest.indexOf("<");
  if (angleStart !== -1) {
    const angleEnd = rest.indexOf(">", angleStart);
    if (angleEnd === -1) return undefined;
    const fnHeaderStr = rest.slice(0, angleEnd + 1).trim();
    const parenStart = rest.indexOf("(", angleEnd);
    if (parenStart === -1) return undefined;
    return { fnHeaderStr, parenStart };
  }
  const parenStart = rest.indexOf("(");
  if (parenStart === -1) return undefined;
  return { fnHeaderStr: rest.slice(0, parenStart).trim(), parenStart };
}

function parseParameters(
  paramsStr: string,
  typeMap: Map<string, number>,
): Array<{ name: string; type: number; typeStr?: string }> | undefined {
  const params: Array<{ name: string; type: number; typeStr?: string }> = [];
  if (!paramsStr) return params;
  const paramParts = splitParametersRespectingParens(paramsStr);
  for (const param of paramParts) {
    const colonIndex = param.indexOf(":");
    if (colonIndex === -1) return undefined;
    const paramName = param.slice(0, colonIndex).trim();
    const paramTypeStr = param.slice(colonIndex + 1).trim();
    if (!isValidIdentifier(paramName)) return undefined;
    let paramType = extractTypeSize(paramTypeStr);
    if (paramType === 0 && typeMap.has("__alias__" + paramTypeStr))
      paramType = typeMap.get("__alias__" + paramTypeStr) || 0;
    if (paramType === 0 && isFunctionType(paramTypeStr)) paramType = -2;
    if (paramType === 0 && typeMap.has("__struct__" + paramTypeStr))
      paramType = -3;
    if (paramType === 0) paramType = 32;
    params.push({ name: paramName, type: paramType, typeStr: paramTypeStr });
  }
  return params;
}

function parseReturnType(
  returnTypeStr: string,
  typeMap: Map<string, number>,
): number | undefined {
  if (returnTypeStr.startsWith(":")) {
    const returnTypeNameStr = returnTypeStr.slice(1).trim();
    let returnType = extractTypeSize(returnTypeNameStr);
    if (returnType === 0 && typeMap.has("__alias__" + returnTypeNameStr))
      returnType = typeMap.get("__alias__" + returnTypeNameStr) || 0;
    return returnType === 0 ? undefined : returnType;
  }
  return returnTypeStr === "" ? 32 : undefined;
}

function processFunctionDeclaration(
  rest: string,
  closeIndex: number,
  typeMap: Map<string, number>,
  visMap: Map<string, boolean>,
  isPublic: boolean,
  functionDefs: Map<string, FnDef>,
): void {
  const header = extractFunctionHeader(rest);
  if (!header) return;
  const { fnHeaderStr, parenStart } = header;
  const parenEnd = findClosingParenIndex(rest, parenStart);
  if (parenEnd === -1) return;
  const { name: fnName, params: genericParams } =
    parseGenericParams(fnHeaderStr);
  if (!isValidIdentifier(fnName)) return;
  const paramsStr = rest.slice(parenStart + 1, parenEnd).trim();
  const params = parseParameters(paramsStr, typeMap);
  if (!params) return;
  const arrowIndex = rest.indexOf("=>", parenEnd);
  if (arrowIndex === -1) return;
  const returnTypeStr = rest.slice(parenEnd + 1, arrowIndex).trim();
  const returnType = parseReturnType(returnTypeStr, typeMap);
  if (returnType === undefined) return;
  const body = rest.slice(arrowIndex + 2, closeIndex).trim();
  const fnDef: FnDef = { params, returnType, body };
  if (genericParams.length > 0) fnDef.generics = genericParams;
  functionDefs.set(fnName, fnDef);
  visMap.set(fnName, isPublic);
  addLocalFunctionName(fnName);
}

export function createFunctionDeclarationHandler(
  functionDefs: Map<string, FnDef>,
) {
  return makeDeclarationHandler(
    "fn",
    (rest: string) => {
      const headerEnd = findFunctionHeaderEnd(rest);
      if (headerEnd === -1) return -1;
      const parenStart = rest.indexOf("(", headerEnd);
      if (parenStart === -1) return -1;
      const parenEnd = findClosingParenIndex(rest, parenStart);
      if (parenEnd === -1) return -1;
      const arrowIndex = rest.indexOf("=>", parenEnd);
      if (arrowIndex === -1) return -1;
      return findFunctionBodyEnd(rest, arrowIndex);
    },
    (
      rest: string,
      closeIndex: number,
      typeMap: Map<string, number>,
      visMap: Map<string, boolean>,
      isPublic: boolean,
    ) => {
      processFunctionDeclaration(
        rest,
        closeIndex,
        typeMap,
        visMap,
        isPublic,
        functionDefs,
      );
    },
  );
}
