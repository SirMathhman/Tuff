import type { TuffError } from "./errors.ts";

/** A numeric value. */
export interface NumberValue {
  kind: "number";
  value: number;
}

/** A boolean value. */
export interface BoolValue {
  kind: "bool";
  value: boolean;
}

/** A tuple value: an ordered list of element values. */
export interface TupleValue {
  kind: "tuple";
  elements: TuffValue[];
}

/** An array value: an ordered list of element values. */
export interface ArrayValue {
  kind: "array";
  elements: TuffValue[];
}

/** A runtime value: a number, a boolean, a tuple, or an array. */
export type TuffValue = NumberValue | BoolValue | TupleValue | ArrayValue;

/**
 * Wrap a number as a value.
 * @param value {number} - The numeric value.
 * @returns {NumberValue} The wrapped number.
 */
export function num(value: number): NumberValue {
  return { kind: "number", value };
}

/**
 * Wrap a boolean as a value.
 * @param value {boolean} - The boolean value.
 * @returns {BoolValue} The wrapped boolean.
 */
export function bool(value: boolean): BoolValue {
  return { kind: "bool", value };
}

/**
 * Whether a value is truthy: nonzero for numbers, the flag for booleans,
 * and always true for tuples.
 * @param value {TuffValue} - The value to test.
 * @returns {boolean} True if the value is truthy.
 */
export function truthy(value: TuffValue): boolean {
  if (value.kind === "number") return value.value !== 0;
  if (value.kind === "bool") return value.value;
  return true;
}

/**
 * Type guard distinguishing a runtime value from a structured error.
 * @param value {TuffValue | TuffError} - The value to test.
 * @returns {boolean} True if the value is a runtime value.
 */
export function isValue(value: TuffValue | TuffError): value is TuffValue {
  return (
    value.kind === "number" ||
    value.kind === "bool" ||
    value.kind === "tuple" ||
    value.kind === "array"
  );
}

/**
 * Render a value as the public numeric result: the number, 1/0 for booleans,
 * and the element count for tuples.
 * @param value {TuffValue} - The value to render.
 * @returns {number} The numeric result.
 */
export function toResultValue(value: TuffValue): number {
  if (value.kind === "number") return value.value;
  if (value.kind === "bool") return value.value ? 1 : 0;
  return value.elements.length;
}
