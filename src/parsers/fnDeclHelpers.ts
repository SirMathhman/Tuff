import type { Result } from "../helpers/result";
import { findMatchingParenIndex, isIdentifierName } from "./interpretHelpers";

export interface ParamDecl {
  name: string;
  ann?: string;
}

export interface FnDeclParsed {
  name: string;
  params: ParamDecl[];
  body: string;
}

export interface FnExprParsed {
  params: ParamDecl[];
  body: string;
}

function skipSpaces(s: string, i: number): number {
  let p = i;
  while (p < s.length && s[p] === " ") p++;
  return p;
}

function isIdentCharCode(cc: number): boolean {
  return (
    (cc >= 65 && cc <= 90) ||
    (cc >= 97 && cc <= 122) ||
    (cc >= 48 && cc <= 57) ||
    cc === 95
  );
}

function scanIdentEnd(s: string, start: number): number {
  let i = start;
  while (i < s.length && isIdentCharCode(s.charCodeAt(i))) i++;
  return i;
}

function parseFunctionParams(paramsText: string): Result<ParamDecl[], string> {
  const params: ParamDecl[] = [];
  if (!paramsText.length) return { ok: true, value: params };

  const parts = paramsText
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const p of parts) {
    const [nmPart, annPart] = p.split(":");
    const nm = nmPart.trim();
    const ann = annPart ? annPart.trim() : undefined;
    if (!isIdentifierName(nm))
      return { ok: false, error: "invalid function parameter" };
    if (params.some((x) => x.name === nm))
      return { ok: false, error: "duplicate parameter" };
    params.push({ name: nm, ann });
  }
  return { ok: true, value: params };
}

export function parseFnDeclStatement(
  stmt: string
): Result<FnDeclParsed, string> | undefined {
  const t = stmt.trim();
  if (!t.startsWith("fn ")) return undefined;

  let i = skipSpaces(t, 2);
  const nameStart = i;
  const nameEnd = scanIdentEnd(t, nameStart);
  const name = t.slice(nameStart, nameEnd).trim();
  if (!name || !isIdentifierName(name))
    return { ok: false, error: "invalid function declaration" };

  i = skipSpaces(t, nameEnd);
  if (i >= t.length || t[i] !== "(")
    return { ok: false, error: "invalid function declaration" };

  const closeParen = findMatchingParenIndex(t, i);
  if (closeParen === -1)
    return { ok: false, error: "invalid function declaration" };

  const paramsText = t.slice(i + 1, closeParen).trim();
  const arrowIdx = t.indexOf("=>", closeParen + 1);
  if (arrowIdx === -1)
    return { ok: false, error: "invalid function declaration" };

  const body = t.slice(arrowIdx + 2).trim();
  const paramsRes = parseFunctionParams(paramsText);
  if (!paramsRes.ok) return paramsRes;

  return {
    ok: true,
    value: { name, params: paramsRes.value, body },
  };
}

export function parseFnExpressionAt(
  s: string,
  pos: number
): Result<FnExprParsed, string> | undefined {
  const t = s.slice(pos).trim();
  if (!t.startsWith("fn ")) return undefined;

  let i = skipSpaces(t, 2);

  // Skip function name if present (it's optional for expressions, but we require parens next)
  const firstChar = t[i];
  const firstCode = firstChar ? firstChar.charCodeAt(0) : 0;
  const isIdent =
    (firstCode >= 65 && firstCode <= 90) ||
    (firstCode >= 97 && firstCode <= 122) ||
    firstCode === 95;

  if (isIdent) {
    i = scanIdentEnd(t, i);
  }

  i = skipSpaces(t, i);
  if (i >= t.length || t[i] !== "(")
    return { ok: false, error: "invalid function expression" };

  const closeParen = findMatchingParenIndex(t, i);
  if (closeParen === -1)
    return { ok: false, error: "invalid function expression" };

  const paramsText = t.slice(i + 1, closeParen).trim();
  const arrowIdx = t.indexOf("=>", closeParen + 1);
  if (arrowIdx === -1)
    return { ok: false, error: "invalid function expression" };

  const body = t.slice(arrowIdx + 2).trim();
  const paramsRes = parseFunctionParams(paramsText);
  if (!paramsRes.ok) return paramsRes;

  return {
    ok: true,
    value: { params: paramsRes.value, body },
  };
}

export function parseArrowFnExpressionAt(
  s: string,
  pos: number
): Result<FnExprParsed, string> | undefined {
  const substr = s.slice(pos);
  if (!substr || substr.length === 0) return undefined;
  let i = 0;
  while (i < substr.length && substr[i] === " ") i++;
  if (i >= substr.length || substr[i] !== "(") return undefined;

  const globalPos = pos + i;
  const closeParen = findMatchingParenIndex(s, globalPos);
  if (closeParen === -1)
    return { ok: false, error: "invalid arrow function expression" };

  const paramsText = s.slice(globalPos + 1, closeParen).trim();
  const rest = s.slice(closeParen + 1);
  const restTrim = rest.trim();

  let bodyStartIdx = -1;
  if (restTrim.startsWith("=>")) {
    bodyStartIdx = rest.indexOf("=>");
  } else if (restTrim.startsWith(":")) {
    // allow optional return annotation between params and =>
    const arrowIdx = rest.indexOf("=>");
    if (arrowIdx === -1) return undefined;
    bodyStartIdx = arrowIdx;
  } else {
    return undefined;
  }

  const body = rest.slice(bodyStartIdx + 2).trim();

  const paramsRes = parseFunctionParams(paramsText);
  if (!paramsRes.ok) return paramsRes;

  return { ok: true, value: { params: paramsRes.value, body } };
}
