import type { Env, ArrayValue } from "./types";
import {
  extractPureBracketContent,
  findMatchingParen,
  interpretAll,
  splitTopLevelOrEmpty,
  topLevelSplitTrim,
} from "./shared";

export function isArrayValue(v: unknown): v is ArrayValue {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Partial<ArrayValue>).type === "Array" &&
    Array.isArray((v as Partial<ArrayValue>).elements)
  );
}

export interface ArrayTypeInfo {
  elementType: string;
  initializedCount: number;
  length: number;
}

export function parseArrayType(typeStr: string): ArrayTypeInfo {
  if (!typeStr.startsWith("[") || !typeStr.endsWith("]")) {
    throw new Error(`Invalid array type: ${typeStr}`);
  }
  const content = typeStr.slice(1, -1);
  const parts = topLevelSplitTrim(content, ";");
  if (parts.length !== 3) {
    throw new Error(
      `Invalid array type format: ${typeStr}. Expected [Type; Init; Length]`
    );
  }
  const elementType = parts[0];
  const initializedCount = parseInt(parts[1], 10);
  const length = parseInt(parts[2], 10);

  if (isNaN(initializedCount) || isNaN(length)) {
    throw new Error(`Invalid array dimensions in ${typeStr}`);
  }

  return { elementType, initializedCount, length };
}

export function tryHandleArrayLiteral(
  s: string,
  env: Env | undefined,
  annotatedType: string | undefined,
  interpret: (input: string, env?: Env) => number
): ArrayValue | undefined {
  if (!s.startsWith("[")) return undefined;

  // Distinguish between [Type; Init; Length] and [1, 2, 3]
  if (s.includes(";")) return undefined;

  const close = findMatchingParen(s, 0);
  if (close === -1 || close !== s.length - 1) return undefined;

  const content = s.slice(1, close).trim();
  const elementsRaw = splitTopLevelOrEmpty(content, ",");
  const elements = interpretAll(elementsRaw, interpret, env);

  if (annotatedType && annotatedType.startsWith("[")) {
    const { elementType, length } = parseArrayType(annotatedType);
    if (elements.length > length) {
      throw new Error(`Array literal too large for type ${annotatedType}`);
    }
    const padded = [...elements];
    while (padded.length < length) {
      padded.push(0);
    }
    return {
      type: "Array",
      elementType,
      elements: padded,
      length,
    };
  }

  return {
    type: "Array",
    elementType: "I32", // fallback
    elements,
    length: elements.length,
  };
}

export function tryHandleArrayIndexing(
  s: string,
  env: Env | undefined,
  interpret: (input: string, env?: Env) => number
): number | undefined {
  const openBracket = s.lastIndexOf("[");
  if (openBracket <= 0) return undefined;

  // Ensure it's not a type annotation [I32; ...]
  if (s.includes(";")) return undefined;

  const indexExpr = extractPureBracketContent(s, openBracket);
  if (indexExpr === undefined) return undefined;

  const before = s.slice(0, openBracket).trim();

  // Evaluate the target. If it's an identifier, look it up.
  let arrayVal: ArrayValue | undefined;
  if (env && env.has(before)) {
    const item = env.get(before)!;
    if (isArrayValue(item.value)) {
      arrayVal = item.value;
    }
  }

  if (!arrayVal) return undefined;

  const index = interpret(indexExpr, env);
  if (index < 0 || index >= arrayVal.length) {
    throw new Error(
      `Index out of bounds: ${index} (length ${arrayVal.length})`
    );
  }

  return arrayVal.elements[index];
}
