import type { Env } from "./types";
import { splitNumberAndSuffix } from "./numbers";
import {
  isIdentifierName,
  parseIdentifierAt,
  extractParenContent,
  extractBracketContent,
  topLevelSplitTrim,
  parseFieldDef,
  startsWithGroup,
  containsOperator,
  sliceTrim,
} from "./shared";

export function parseAddressOfType(s: string, env?: Env): string | undefined {
  if (!s.startsWith("&")) return undefined;
  const id = s.slice(1).trim();
  if (!isIdentifierName(id)) return undefined;
  if (!env || !env.has(id)) throw new Error("Unknown identifier");
  const item = env.get(id)!;
  return `*${item.type}`;
}

export function paramTypesFromParams(paramsRaw: string[]): string[] {
  return paramsRaw.map((p) => {
    const { type } = parseFieldDef(p);
    return type;
  });
}

export function parseFnSignature(s: string): string | undefined {
  const restInit = sliceTrim(s, 2);
  const nameRes = restInit.startsWith("(")
    ? undefined
    : parseIdentifierAt(restInit, 0);
  const rest = nameRes ? sliceTrim(restInit, nameRes.next) : restInit;
  const parenRes = extractParenContent(rest, "fn");
  if (!parenRes) return undefined;
  const paramsRaw = topLevelSplitTrim(parenRes.content, ",");
  const paramTypes: string[] = paramTypesFromParams(paramsRaw);
  const retType = "I32"; // conservative default
  return `(${paramTypes.join(", ")}) => ${retType}`;
}

export function parseArrowSignature(s: string): string | undefined {
  const parenRes = extractBracketContent(s, 0);
  if (!parenRes) return undefined;
  const after = s.slice(parenRes.close + 1).trimStart();
  if (!after.startsWith("=>")) return undefined;
  const paramsRaw = topLevelSplitTrim(parenRes.content, ",");
  const paramTypes: string[] = paramTypesFromParams(paramsRaw);
  const retType = "I32";
  return `(${paramTypes.join(", ")}) => ${retType}`;
}

export function parseNumericOrGroupType(s: string): string | undefined {
  const { numStr } = splitNumberAndSuffix(s);
  if (numStr !== "") return "Number";
  // parenthesized or binary expression assume Number
  if (startsWithGroup(s)) return "Number";
  if (containsOperator(s)) return "Number";
  return undefined;
}
