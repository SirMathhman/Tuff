/**
 * Runtime value types for the Tuff interpreter.
 * A discriminated union that replaces the raw `number` encoding.
 */
import type { Type } from "./types";
import { InterpreterError } from "./error";

export type Value =
  | { kind: "number"; value: number; type?: Type }
  | { kind: "boolean"; value: boolean; type?: Type }
  | { kind: "pointer"; target: string; type?: Type }
  | { kind: "array"; elements: Value[]; type?: Type }
  | { kind: "struct"; fields: Map<string, Value>; type?: Type };

/**
 * Result of evaluating an expression.
 * - "value": normal evaluation result
 * - "break": break from a loop with a value
 */
export type EvalResult =
  { kind: "value"; value: Value } | { kind: "break"; value: Value };

/** Wrap a value as a successful evaluation result. */
export function evalOk(value: Value): EvalResult {
  return { kind: "value", value };
}

/** Wrap a value as a break result. */
export function evalBreak(value: Value): EvalResult {
  return { kind: "break", value };
}

/** Unwrap an evaluation result to a value. Throws if it's a break outside a loop. */
export function unwrap(result: EvalResult): Value {
  if (result.kind === "break") {
    throw new InterpreterError("runtime", "Unexpected break outside loop");
  }
  return result.value;
}

/** Type guard: is this a pointer value? */
export function isPointerValue(v: Value): v is Extract<Value, { kind: "pointer" }> {
  return v.kind === "pointer";
}

/** Type guard: is this an array value? */
export function isArrayValue(v: Value): v is Extract<Value, { kind: "array" }> {
  return v.kind === "array";
}

/** Coerce a value to a number. Booleans become 1/0. Throws for non-coercible types. */
export function toNumber(v: Value): number {
  switch (v.kind) {
    case "number":
      return v.value;
    case "boolean":
      return v.value ? 1 : 0;
    case "pointer":
      throw new InterpreterError("runtime", "Cannot coerce pointer to number");
    case "array":
      throw new InterpreterError("runtime", "Cannot coerce array to number");
    case "struct":
      throw new InterpreterError("runtime", "Cannot coerce struct to number");
  }
}
