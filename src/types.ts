import type { Env } from "./env";

export type PlainObject = { [k: string]: unknown };

export function isPlainObject(v: unknown): v is PlainObject {
  // Use `!= undefined` to exclude both `undefined` and `null` without using
  // the `null` literal (ESLint rule bans null literals).
  return typeof v === "object" && v != undefined;
}

export function isBoolOperand(v: unknown): v is { boolValue: boolean } {
  return (
    isPlainObject(v) &&
    typeof (v as { boolValue?: unknown }).boolValue === "boolean"
  );
}

export function isFloatOperand(
  v: unknown
): v is { isFloat: true; floatValue: number } {
  return (
    isPlainObject(v) &&
    (v as { isFloat?: unknown }).isFloat === true &&
    typeof (v as { floatValue?: unknown }).floatValue === "number"
  );
}

export function isIntOperand(v: unknown): v is { valueBig: bigint } {
  return (
    isPlainObject(v) &&
    typeof (v as { valueBig?: unknown }).valueBig === "bigint"
  );
}

export function isFnWrapper(v: unknown): v is { fn: PlainObject } {
  return isPlainObject(v) && isPlainObject((v as { fn?: unknown }).fn);
}

export function isThisBinding(
  v: unknown
): v is { isThisBinding: true; fieldValues: PlainObject } {
  return (
    isPlainObject(v) &&
    (v as { isThisBinding?: unknown }).isThisBinding === true &&
    isPlainObject((v as { fieldValues?: unknown }).fieldValues)
  );
}

export function isStructInstance(
  v: unknown
): v is { isStructInstance: true; fieldValues: PlainObject } {
  return (
    isPlainObject(v) &&
    (v as { isStructInstance?: unknown }).isStructInstance === true &&
    isPlainObject((v as { fieldValues?: unknown }).fieldValues)
  );
}

export function isStructDef(v: unknown): v is { isStructDef: true } {
  return (
    isPlainObject(v) && (v as { isStructDef?: unknown }).isStructDef === true
  );
}

export function isPointer(v: unknown): v is { pointer: true; ptrName: string } {
  return (
    isPlainObject(v) &&
    (v as { pointer?: unknown }).pointer === true &&
    typeof (v as { ptrName?: unknown }).ptrName === "string"
  );
}

export function unwrapBindingValue(binding: unknown): unknown {
  if (!isPlainObject(binding)) return binding;
  if (!Object.prototype.hasOwnProperty.call(binding, "value")) return binding;
  const v = (binding as { value?: unknown }).value;
  return v !== undefined ? v : binding;
}

export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export type InterpretFn = (_input: string, _env?: Env) => number;
