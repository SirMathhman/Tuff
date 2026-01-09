import { Env, envGet, envEntries } from "../env";
import {
  isPlainObject,
  isStructInstance,
  isThisBinding,
  getProp,
  isArrayInstance,
  isFnWrapper,
  RuntimeValue,
  ThisBinding,
  hasValue,
  isStructDef,
} from "../types";
import { ErrorCode, throwError } from "../errors";

/**
 * Extract and validate a field value from a struct/this instance
 */
export function getFieldValueFromInstance(
  maybe: RuntimeValue,
  fieldName: string
): RuntimeValue {
  if (!(isStructInstance(maybe) || isThisBinding(maybe)))
    throwError(ErrorCode.CANNOT_ACCESS_FIELD);

  const fieldValue = maybe.fieldValues.get(fieldName);
  if (fieldValue === undefined)
    throwError(ErrorCode.INVALID_FIELD_ACCESS, { fieldName });
  return fieldValue;
}

/**
 * Get array element value with bounds and initialized checks
 */
export function getArrayElementFromInstance(
  maybe: RuntimeValue,
  indexVal: number
): RuntimeValue {
  if (!isArrayInstance(maybe)) throwError(ErrorCode.CANNOT_INDEX_NON_ARRAY);
  const arr = maybe;
  if (!Number.isInteger(indexVal) || indexVal < 0 || indexVal >= arr.length)
    throwError(ErrorCode.INDEX_OUT_OF_RANGE);
  if (indexVal >= arr.initializedCount)
    throwError(ErrorCode.USE_OF_UNINITIALIZED);
  return arr.elements[indexVal];
}

/**
 * Throws error for invalid field access on non-struct value
 */
export function throwCannotAccessField(): never {
  throwError(ErrorCode.CANNOT_ACCESS_FIELD);
}

/**
 * Throws error when accessing field on missing value
 */
export function throwCannotAccessFieldMissing(): never {
  throwError(ErrorCode.CANNOT_ACCESS_FIELD_MISSING);
}

/**
 * Throws error for invalid field access with field name
 */
export function throwInvalidFieldAccess(fieldName: string): never {
  throwError(ErrorCode.INVALID_FIELD_ACCESS, { fieldName });
}

/**
 * Build a this-binding object from environment entries
 */
export function buildThisBindingFromEnv(envLocal: Env): ThisBinding {
  const thisObj: ThisBinding = {
    type: "this-binding",
    isThisBinding: true,
    fieldValues: new Map(),
  };
  for (const [k, envVal] of envEntries(envLocal)) {
    if (k === "this") continue;
    if (
      isPlainObject(envVal) &&
      hasValue(envVal) &&
      getProp(envVal, "value") !== undefined
    ) {
      thisObj.fieldValues.set(k, getProp(envVal, "value"));
    } else if (
      typeof envVal === "number" ||
      typeof envVal === "string" ||
      typeof envVal === "boolean"
    ) {
      thisObj.fieldValues.set(k, envVal);
    } else if (!isStructDef(envVal)) {
      thisObj.fieldValues.set(k, envVal);
    }
  }
  return thisObj;
}

interface ArrayInstance {
  type: "array-instance";
  isArray: true;
  elements: RuntimeValue[];
  length: number;
  initializedCount: number;
}

/**
 * Create an array instance from element array
 */
export function createArrayInstanceFromElements(
  elems: RuntimeValue[]
): ArrayInstance {
  return {
    type: "array-instance",
    isArray: true,
    elements: elems,
    length: elems.length,
    initializedCount: elems.length,
  };
}

interface MethodResolverCtx {
  fieldName: string;
  receiver: RuntimeValue;
  localEnv: Env;
  makeBoundWrapper: (fn: RuntimeValue, receiver: RuntimeValue) => RuntimeValue;
}

/**
 * Handle length/init fields on array-like instances
 */
export function handleArrayLikeFieldAccess(
  arrLike: RuntimeValue,
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
export function resolveMethodWrapper(ctx: MethodResolverCtx): RuntimeValue {
  const binding = envGet(ctx.localEnv, ctx.fieldName);
  if (binding !== undefined && isFnWrapper(binding))
    return ctx.makeBoundWrapper(binding.fn, ctx.receiver);
  return undefined;
}
