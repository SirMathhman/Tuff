import type { Env, ArrayValue } from "./types";
import {
  extractPureBracketContent,
  findMatchingParen,
  interpretAll,
  splitTopLevelOrEmpty,
  topLevelSplitTrim,
} from "./shared";

import { hasTypeTag } from "./shared";

export function isArrayValue(v: unknown): v is ArrayValue {
  return (
    hasTypeTag(v, "Array") && Array.isArray((v as Partial<ArrayValue>).elements)
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

  if (initializedCount !== 0 && initializedCount !== length) {
    throw new Error(
      `Invalid array type: init must be 0 or equal to length. Got [${elementType}; ${initializedCount}; ${length}]`
    );
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
    const { elementType, initializedCount, length } =
      parseArrayType(annotatedType);

    // Enforce: can only create arrays with init === 0 or init === length
    if (initializedCount !== 0 && initializedCount !== length) {
      throw new Error(
        `Cannot create array with partial initialization: ${annotatedType}`
      );
    }

    // If init === length, require exact element count
    if (initializedCount === length) {
      if (elements.length !== length) {
        throw new Error(
          `Array literal must have exactly ${length} elements for type ${annotatedType}, got ${elements.length}`
        );
      }
      return {
        type: "Array",
        elementType,
        elements,
        length,
        initializedCount,
      };
    }

    // init === 0: no initializer allowed
    throw new Error(
      `Array with init=0 cannot have an initializer: ${annotatedType}`
    );
  }

  // No type annotation: infer from literal
  return {
    type: "Array",
    elementType: "I32", // fallback
    elements,
    length: elements.length,
    initializedCount: elements.length,
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

  // RHS read: must be < initializedCount
  validateIndexBounds(
    index,
    0,
    arrayVal.initializedCount,
    `Index out of bounds or uninitialized: ${index} (initializedCount: ${arrayVal.initializedCount})`
  );

  return arrayVal.elements[index];
}

function validateIndexBounds(
  index: number,
  min: number,
  max: number,
  context: string
): void {
  if (index < min || index >= max) {
    throw new Error(context);
  }
}

export function tryHandleArrayAssignment(
  stmt: string,
  env: Env,
  interpret: (input: string, env?: Env) => number
): number | undefined {
  // Pattern: identifier[index] = value
  const eqIdx = stmt.indexOf("=");
  if (eqIdx === -1) return undefined;

  const lhs = stmt.slice(0, eqIdx).trim();
  const rhs = stmt.slice(eqIdx + 1).trim();

  const openBracket = lhs.lastIndexOf("[");
  if (openBracket <= 0) return undefined;

  const indexExpr = extractPureBracketContent(lhs, openBracket);
  if (indexExpr === undefined) return undefined;

  const arrayName = lhs.slice(0, openBracket).trim();

  if (!env.has(arrayName)) return undefined;
  const item = env.get(arrayName)!;

  if (!isArrayValue(item.value)) return undefined;
  if (!item.mutable) {
    throw new Error("Cannot assign to immutable array");
  }

  const arrayVal = item.value;
  const index = interpret(indexExpr, env);

  // LHS write: must be <= initializedCount and < length
  validateIndexBounds(
    index,
    0,
    arrayVal.length,
    `Index out of bounds: ${index} (length: ${arrayVal.length})`
  );

  if (index > arrayVal.initializedCount) {
    throw new Error(
      `Out-of-order initialization: index ${index} but only ${arrayVal.initializedCount} elements initialized (sequential init required)`
    );
  }

  const value = interpret(rhs, env);
  arrayVal.elements[index] = value;

  // If this is sequential initialization (index === initializedCount), increment
  if (index === arrayVal.initializedCount) {
    arrayVal.initializedCount++;
  }

  return value;
}

export function createUninitializedArrayFromType(
  annotatedType: string,
  name: string,
  mutable: boolean,
  env: Env
): boolean {
  if (!annotatedType.startsWith("[")) return false;
  const { elementType, initializedCount, length } =
    parseArrayType(annotatedType);
  if (initializedCount !== 0) {
    throw new Error(
      `Array declaration without initializer must have init=0, got ${annotatedType}`
    );
  }
  if (!mutable) {
    throw new Error(`Array with init=0 must be mutable (use 'let mut')`);
  }
  const arrayVal: ArrayValue = {
    type: "Array",
    elementType,
    elements: new Array(length).fill(0),
    length,
    initializedCount: 0,
  };
  env.set(name, { value: arrayVal, mutable, type: annotatedType });
  return true;
}
