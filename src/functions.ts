import { Token } from "./tokenize";
import { Result, ok, err, isErr } from "./result";
import { indexUntilSemicolon, findMatchingBrace } from "./commonUtils";
import { FunctionParameter } from "./matchEval";
import { parseTypeNameAt } from "./utils/parseType";

export interface FunctionParseResult {
  name: string;
  params: FunctionParameter[];
  returnType?: string;
  bodyTokens: Token[];
  nextIndex: number;
}

interface ParametersParseResult {
  params: FunctionParameter[];
  nextIndex: number;
}

interface ReturnTypeResult {
  returnType?: string;
  nextIndex: number;
}

interface SingleParamResult {
  param: FunctionParameter;
  nextIndex: number;
}

interface FunctionBodyResult {
  body: Token[];
  nextIndex: number;
}

function parseSingleParameter(
  tokensArr: Token[],
  start: number
): Result<SingleParamResult, string> {
  let cur = start;

  if (cur >= tokensArr.length || tokensArr[cur].type !== "ident") {
    return err("Invalid numeric input");
  }
  const paramName = tokensArr[cur].value as string;
  cur++;

  const nextTok = tokensArr[cur];
  if (!nextTok) return err("Invalid numeric input");

  if (nextTok.type === "paren" && nextTok.value === ")") {
    return ok({ param: { name: paramName }, nextIndex: cur });
  }

  if (nextTok.type !== "punct" || nextTok.value !== ":") {
    return err("Invalid numeric input");
  }
  cur++;

  const parsedType = parseTypeNameAt(tokensArr, cur);
  if (!parsedType) return err("Invalid numeric input");
  const paramType = parsedType.typeName;
  cur = parsedType.nextIndex;

  return ok({
    param: { name: paramName, typeName: paramType },
    nextIndex: cur,
  });
}

export function parseParameters(
  tokensArr: Token[],
  start: number
): Result<ParametersParseResult, string> {
  let cur = start;
  const params: FunctionParameter[] = [];

  if (
    !tokensArr[cur] ||
    tokensArr[cur].type !== "paren" ||
    tokensArr[cur].value !== "("
  ) {
    return err("Invalid numeric input");
  }
  cur++;

  if (tokensArr[cur].type === "paren" && tokensArr[cur].value === ")") {
    return ok({ params, nextIndex: cur + 1 });
  }

  while (cur < tokensArr.length) {
    const paramRes = parseSingleParameter(tokensArr, cur);
    if (isErr(paramRes)) return err(paramRes.error);
    const { param, nextIndex } = paramRes.value;
    params.push(param);
    cur = nextIndex;

    const checkTok = tokensArr[cur];
    if (!checkTok) return err("Invalid numeric input");

    if (checkTok.type === "paren" && checkTok.value === ")") {
      return ok({ params, nextIndex: cur + 1 });
    }

    if (checkTok.type === "punct" && checkTok.value === ",") {
      cur++;
    } else {
      return err("Invalid numeric input");
    }
  }

  return err("Invalid numeric input");
}

export function parseReturnType(
  tokensArr: Token[],
  start: number
): Result<ReturnTypeResult, string> {
  if (
    tokensArr[start] &&
    tokensArr[start].type === "punct" &&
    tokensArr[start].value === ":"
  ) {
    const typeTok = tokensArr[start + 1];
    if (!typeTok) return err("Invalid numeric input");

    if (typeTok.type === "ident") {
      return ok({ returnType: typeTok.value as string, nextIndex: start + 2 });
    }

    if (typeTok.type === "op" && typeTok.value === "*") {
      let i = start + 2;
      let mut = false;
      const maybeMut = tokensArr[i];
      if (maybeMut && maybeMut.type === "ident" && maybeMut.value === "mut") {
        mut = true;
        i++;
      }
      const baseTok = tokensArr[i];
      if (!baseTok || baseTok.type !== "ident")
        return err("Invalid numeric input");
      const typeName = mut ? `*mut ${baseTok.value}` : `*${baseTok.value}`;
      return ok({ returnType: typeName, nextIndex: i + 1 });
    }

    return err("Invalid numeric input");
  }
  return ok({ nextIndex: start });
}

export function extractFunctionBody(
  tokensArr: Token[],
  start: number
): Result<FunctionBodyResult, string> {
  if (
    !tokensArr[start] ||
    tokensArr[start].type !== "punct" ||
    tokensArr[start].value !== "=>"
  ) {
    return err("Invalid numeric input");
  }

  let cur = start + 1;
  if (!tokensArr[cur]) return err("Invalid numeric input");

  if (tokensArr[cur].type === "punct" && tokensArr[cur].value === "{") {
    const braceEnd = findMatchingBrace(tokensArr, cur);
    if (braceEnd === -1) return err("Invalid numeric input");
    const body = tokensArr.slice(cur, braceEnd + 1);
    return ok({ body, nextIndex: braceEnd + 2 });
  } else {
    const semi = indexUntilSemicolon(tokensArr, cur);
    if (semi > tokensArr.length) return err("Invalid numeric input");
    const body = tokensArr.slice(cur, semi);
    return ok({ body, nextIndex: semi + 1 });
  }
}

export function parseFunctionSignature(
  tokensArr: Token[],
  idx: number
): Result<FunctionParseResult, string> {
  if (
    !tokensArr[idx] ||
    tokensArr[idx].type !== "ident" ||
    (tokensArr[idx].value as string) !== "fn"
  ) {
    return err("Invalid numeric input");
  }

  let cur = idx + 1;
  const nameTok = tokensArr[cur];
  if (!nameTok || nameTok.type !== "ident") {
    return err("Invalid numeric input");
  }
  const name = nameTok.value as string;
  cur++;

  const paramsRes = parseParameters(tokensArr, cur);
  if (isErr(paramsRes)) return err(paramsRes.error);
  const { params, nextIndex: afterParams } = paramsRes.value;

  const retRes = parseReturnType(tokensArr, afterParams);
  if (isErr(retRes)) return err(retRes.error);
  const { returnType, nextIndex: afterReturn } = retRes.value;

  const bodyRes = extractFunctionBody(tokensArr, afterReturn);
  if (isErr(bodyRes)) return err(bodyRes.error);
  const { body: bodyTokens, nextIndex } = bodyRes.value;

  return ok({ name, params, returnType, bodyTokens, nextIndex });
}
