import { isPositionInsideBrackets } from "./operator-utils";
import { getStructField, isStructInstance } from "../types/structs";
import {
  getArrayElement,
  getArrayMetadata,
  isArrayInstance,
  getStringLength,
  getStringCharCode,
  isStringInstance,
} from "../utils/array";

export function findComparisonOperator(
  s: string,
): { index: number; operator: string } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    const twoChar = s.slice(i - 1, i + 1);
    if (
      twoChar === "<=" ||
      twoChar === ">=" ||
      twoChar === "==" ||
      twoChar === "!="
    ) {
      if (isPositionInsideBrackets(s, i - 1)) continue;
      const prev = s[i - 2];
      if (
        !prev ||
        (prev >= "0" && prev <= "9") ||
        prev === " " ||
        prev === ")" ||
        prev === "}"
      ) {
        return { index: i - 1, operator: twoChar };
      }
    }

    const ch = s[i];
    if (ch === "<" || ch === ">") {
      if (isPositionInsideBrackets(s, i)) continue;
      const nextCh = s[i + 1];
      if (nextCh !== "=" && nextCh !== ">") {
        const prev = s[i - 1];
        if (
          prev &&
          ((prev >= "0" && prev <= "9") ||
            prev === " " ||
            prev === ")" ||
            prev === "}")
        ) {
          return { index: i, operator: ch };
        }
      }
    }
  }
  return undefined;
}

export function handleFieldAccessOp(
  left: number,
  rightStr: string,
  resolvedPtr: number | undefined,
): number {
  const arrayValue = isArrayInstance(left) ? left : resolvedPtr;
  if (arrayValue !== undefined && isArrayInstance(arrayValue)) {
    const meta = getArrayMetadata(arrayValue);
    if (!meta) throw new Error("array metadata missing");
    if (rightStr === "length" || rightStr === "init") return meta.initialized;
    throw new Error(`cannot access '${rightStr}' on array value`);
  }
  const stringValue = isStringInstance(left) ? left : resolvedPtr;
  if (stringValue !== undefined && isStringInstance(stringValue)) {
    if (rightStr === "length") {
      const len = getStringLength(stringValue);
      return len !== undefined ? len : 0;
    }
    throw new Error(`cannot access '${rightStr}' on string value`);
  }
  const structValue = isStructInstance(left) ? left : resolvedPtr;
  if (!structValue || !isStructInstance(structValue)) {
    throw new Error(`cannot access field on non-struct value`);
  }
  return getStructField(structValue, rightStr);
}

export function handleIndexingOp(
  left: number,
  right: number,
  resolvedPtr: number | undefined,
): number {
  const stringValue = isStringInstance(left) ? left : resolvedPtr;
  if (stringValue !== undefined && isStringInstance(stringValue)) {
    const charCode = getStringCharCode(stringValue, right);
    if (charCode === undefined)
      throw new Error(`string index ${right} out of bounds`);
    return charCode;
  }
  const arrayValue = isArrayInstance(left) ? left : resolvedPtr;
  if (!arrayValue || !isArrayInstance(arrayValue)) {
    throw new Error(`cannot index non-array value`);
  }
  const element = getArrayElement(arrayValue, right);
  if (element === undefined)
    throw new Error(`array index ${right} out of bounds`);
  return element;
}
