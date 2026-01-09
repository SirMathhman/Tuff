import {
  isStructInstance,
  isThisBinding,
  isArrayInstance,
  isFnWrapper,
} from "../types";
import { Env, envGet } from "../env";

/**
 * Extract and validate a field value from a struct/this instance
 */
export function getFieldValueFromInstance(
  maybe: unknown,
  fieldName: string
): unknown {
  if (!(isStructInstance(maybe) || isThisBinding(maybe)))
    throw new Error("cannot access field on non-struct value");

  const fieldValue = maybe.fieldValues[fieldName];
  if (fieldValue === undefined)
    throw new Error(`invalid field access: ${fieldName}`);
  return fieldValue;
}

/**
 * Get array element value with bounds and initialized checks
 */
export function getArrayElementFromInstance(
  maybe: unknown,
  indexVal: number
): unknown {
  if (!isArrayInstance(maybe)) throw new Error("cannot index non-array value");
  const arr = maybe;
  if (!Number.isInteger(indexVal) || indexVal < 0 || indexVal >= arr.length)
    throw new Error("index out of range");
  if (indexVal >= arr.initializedCount)
    throw new Error("use of uninitialized array element");
  return arr.elements[indexVal];
}

/**
 * Throws error for invalid field access on non-struct value
 */
export function throwCannotAccessField(): never {
  throw new Error(`cannot access field on non-struct value`);
}

/**
 * Throws error when accessing field on missing value
 */
export function throwCannotAccessFieldMissing(): never {
  throw new Error(`cannot access field on missing value`);
}

interface MethodResolverCtx {
  fieldName: string;
  receiver: unknown;
  localEnv: Env;
  makeBoundWrapper: (fn: unknown, receiver: unknown) => unknown;
}

/**
 * Handle length/init fields on array-like instances
 */
export function handleArrayLikeFieldAccess(
  arrLike: unknown,
  fieldName: string,
  replaceWithNumber: (n: number) => void
): boolean {
  if (!isArrayInstance(arrLike)) return false;
  if (fieldName === "length" || fieldName === "len") {
    replaceWithNumber(arrLike.length);
    return true;
  }
  if (fieldName === "init") {
    replaceWithNumber(arrLike.initializedCount);
    return true;
  }
  return false;
}

/**
 * Resolve a method binding and return a bound wrapper or undefined
 */
export function resolveMethodWrapper(ctx: MethodResolverCtx): unknown {
  const binding = envGet(ctx.localEnv, ctx.fieldName);
  if (binding !== undefined && isFnWrapper(binding))
    return ctx.makeBoundWrapper(binding.fn, ctx.receiver);
  return undefined;
}
