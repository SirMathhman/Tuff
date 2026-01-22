import { parseArrayLiteral } from "./array-parsing";
import { extractArrayIndexComponents } from "./parser";
import { type VariableContext } from "./variable-types";

export function parseArrayTypeComponents(type: string): string[] | undefined {
  if (!type.endsWith("]")) return undefined;
  const inner = type.substring(1, type.length - 1);
  const parts = inner.split(";").map((p) => p.trim());
  if (parts.length !== 3) return undefined;
  return parts;
}

export function parseArraySize(type: string): number | undefined {
  const parts = parseArrayTypeComponents(type);
  if (!parts) return undefined;

  const totalLenStr = parts[2];
  if (!totalLenStr) return undefined;

  const totalLen = parseInt(totalLenStr, 10);
  return isNaN(totalLen) ? undefined : totalLen;
}

export function extractArrayLiteralType(
  trimmed: string,
  context?: VariableContext,
  extractExpressionType?: (
    expr: string,
    ctx?: VariableContext,
  ) => string | undefined,
): string | undefined {
  if (!extractExpressionType) return undefined;

  const arrayLit = parseArrayLiteral(trimmed);
  if (!arrayLit || arrayLit.elements.length === 0) return undefined;

  const firstElem = arrayLit.elements[0];
  if (!firstElem) return undefined;

  const elemType = extractExpressionType(firstElem, context);
  if (!elemType) return undefined;

  const len = arrayLit.elements.length;
  return `[${elemType}; ${len}; ${len}]`;
}

export function extractArrayIndexType(
  trimmed: string,
  context?: VariableContext,
): string | undefined {
  const comp = extractArrayIndexComponents(trimmed);
  if (!comp || !context) return undefined;

  const binding = context.find((b) => b.name === comp.arrayName);
  if (!binding || !binding.type || !binding.type.startsWith("["))
    return undefined;

  const parts = binding.type.substring(1, binding.type.length - 1).split(";");
  if (parts.length >= 1 && parts[0]) {
    return parts[0].trim();
  }
  return undefined;
}
