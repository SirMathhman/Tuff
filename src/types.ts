import type { Env } from "./env";

export type PlainObject = { [k: string]: unknown };

export function isPlainObject(v: unknown): v is PlainObject {
  // Use `!= undefined` to exclude both `undefined` and `null` without using
  // the `null` literal (ESLint rule bans null literals).
  return typeof v === "object" && v != undefined;
}

export function isBoolOperand(v: unknown): v is { boolValue: boolean } {
  return (
    isPlainObject(v) && "boolValue" in v && typeof v.boolValue === "boolean"
  );
}

export function isFloatOperand(
  v: unknown
): v is { isFloat: true; floatValue: number } {
  return (
    isPlainObject(v) &&
    "isFloat" in v &&
    v.isFloat === true &&
    "floatValue" in v &&
    typeof v.floatValue === "number"
  );
}

export function isIntOperand(v: unknown): v is { valueBig: bigint } {
  return isPlainObject(v) && "valueBig" in v && typeof v.valueBig === "bigint";
}

export function isFnWrapper(v: unknown): v is { fn: PlainObject } {
  return isPlainObject(v) && "fn" in v && isPlainObject(v.fn);
}

export function isThisBinding(
  v: unknown
): v is { isThisBinding: true; fieldValues: PlainObject } {
  return (
    isPlainObject(v) &&
    "isThisBinding" in v &&
    v.isThisBinding === true &&
    "fieldValues" in v &&
    isPlainObject(v.fieldValues)
  );
}

export function isStructInstance(
  v: unknown
): v is { isStructInstance: true; fieldValues: PlainObject } {
  return (
    isPlainObject(v) &&
    "isStructInstance" in v &&
    v.isStructInstance === true &&
    "fieldValues" in v &&
    isPlainObject(v.fieldValues)
  );
}

export function isStructDef(v: unknown): v is { isStructDef: true } {
  return isPlainObject(v) && "isStructDef" in v && v.isStructDef === true;
}

export function isPointer(v: unknown): v is { pointer: true; ptrName: string } {
  return (
    isPlainObject(v) &&
    "pointer" in v &&
    v.pointer === true &&
    "ptrName" in v &&
    typeof v.ptrName === "string"
  );
}

export function unwrapBindingValue(binding: unknown): unknown {
  if (!isPlainObject(binding)) return binding;
  if (!Object.prototype.hasOwnProperty.call(binding, "value")) return binding;
  const v = binding.value;
  return v !== undefined ? v : binding;
}

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Safe property getters - avoid `as` casts by using `in` checks
export function getProp(obj: unknown, key: string): unknown {
  if (!isPlainObject(obj)) return undefined;
  if (!(key in obj)) return undefined;
  return obj[key];
}

export function hasProp(obj: unknown, key: string): boolean {
  return isPlainObject(obj) && key in obj;
}

export function hasStringProp(obj: unknown, key: string): boolean {
  return isPlainObject(obj) && key in obj && typeof obj[key] === "string";
}

// Type guards for common property shapes
export function hasKindBits(v: unknown): v is { kind: string; bits: number } {
  return (
    isPlainObject(v) &&
    "kind" in v &&
    typeof v.kind === "string" &&
    "bits" in v &&
    typeof v.bits === "number"
  );
}

export function hasIdent(v: unknown): v is { ident: string } {
  return isPlainObject(v) && "ident" in v && typeof v.ident === "string";
}

export function hasAddrOf(v: unknown): v is { addrOf: unknown } {
  return isPlainObject(v) && "addrOf" in v;
}

export function hasDeref(v: unknown): v is { deref: unknown } {
  return isPlainObject(v) && "deref" in v;
}

export function hasCallArgs(v: unknown): v is { callArgs: unknown[] } {
  return isPlainObject(v) && "callArgs" in v && Array.isArray(v.callArgs);
}

export function hasCallApp(v: unknown): v is { callApp: unknown } {
  return isPlainObject(v) && "callApp" in v;
}

export function hasStructInstantiation(
  v: unknown
): v is { structInstantiation: unknown } {
  return isPlainObject(v) && "structInstantiation" in v;
}

export function hasValue(v: unknown): v is { value: unknown } {
  return isPlainObject(v) && Object.prototype.hasOwnProperty.call(v, "value");
}

export function hasMutable(v: unknown): v is { mutable: unknown } {
  return isPlainObject(v) && "mutable" in v;
}

export function hasUninitialized(v: unknown): v is { uninitialized: unknown } {
  return isPlainObject(v) && "uninitialized" in v;
}

export function hasAnnotation(v: unknown): v is { annotation: unknown } {
  return isPlainObject(v) && "annotation" in v;
}

export function hasParsedAnnotation(
  v: unknown
): v is { parsedAnnotation: unknown } {
  return isPlainObject(v) && "parsedAnnotation" in v;
}

export function hasLiteralAnnotation(
  v: unknown
): v is { literalAnnotation: unknown } {
  return isPlainObject(v) && "literalAnnotation" in v;
}

export function hasParams(v: unknown): v is { params: unknown[] } {
  return isPlainObject(v) && "params" in v && Array.isArray(v.params);
}

export function hasClosureEnv(v: unknown): v is { closureEnv: unknown } {
  return isPlainObject(v) && "closureEnv" in v;
}

export function hasBody(v: unknown): v is { body: unknown } {
  return isPlainObject(v) && "body" in v;
}

export function hasIsBlock(v: unknown): v is { isBlock: unknown } {
  return isPlainObject(v) && "isBlock" in v;
}

export function hasName(v: unknown): v is { name: unknown } {
  return isPlainObject(v) && "name" in v;
}

export function hasFields(v: unknown): v is { fields: unknown } {
  return isPlainObject(v) && "fields" in v;
}

export function hasPtrMutable(v: unknown): v is { ptrMutable: unknown } {
  return isPlainObject(v) && "ptrMutable" in v;
}

export function hasPtrIsBool(v: unknown): v is { ptrIsBool: unknown } {
  return isPlainObject(v) && "ptrIsBool" in v;
}

export function hasYield(v: unknown): v is { __yield: number } {
  return isPlainObject(v) && "__yield" in v && typeof v.__yield === "number";
}

export type InterpretFn = (_input: string, _env?: Env) => number;
