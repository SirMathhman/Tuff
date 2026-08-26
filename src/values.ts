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

/** A runtime value: a number or a boolean. */
export type TuffValue = NumberValue | BoolValue;

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
 * Whether a value is truthy: nonzero for numbers, the flag for booleans.
 * @param value {TuffValue} - The value to test.
 * @returns {boolean} True if the value is truthy.
 */
export function truthy(value: TuffValue): boolean {
  return value.kind === "number" ? value.value !== 0 : value.value;
}

/**
 * Type guard distinguishing a runtime value from a structured error.
 * @param value {TuffValue | TuffError} - The value to test.
 * @returns {boolean} True if the value is a runtime value.
 */
export function isValue(value: TuffValue | TuffError): value is TuffValue {
  return value.kind === "number" || value.kind === "bool";
}

/**
 * Render a value as the public numeric result: the number, or 1/0 for booleans.
 * @param value {TuffValue} - The value to render.
 * @returns {number} The numeric result.
 */
export function toResultValue(value: TuffValue): number {
  return value.kind === "number" ? value.value : value.value ? 1 : 0;
}
