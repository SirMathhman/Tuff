/**
 * Runtime value types for the Tuff interpreter.
 * A discriminated union that replaces the raw `number` encoding.
 */
import type { Type } from "../core/types";
import { InterpreterError } from "../core/error";

export type Value =
  | { kind: "number"; value: number; type?: Type }
  | { kind: "boolean"; value: boolean; type?: Type }
  | { kind: "pointer"; target: string; type?: Type }
  | { kind: "array"; elements: Value[]; type?: Type }
  | { kind: "struct"; fields: Map<string, Value>; type?: Type }
  | { kind: "tuple"; elements: Value[]; type?: Type }
  | { kind: "enum"; enum: string; variant: string; type?: Type };

/**
 * Result of evaluating an expression.
 * - "value": normal evaluation result
 * - "break": break from a loop with a value
 * - "yield": yield from a block with a value
 * - "return": return from a function with a value
 */
export type EvalResult =
  | { kind: "value"; value: Value }
  | { kind: "break"; value: Value }
  | { kind: "yield"; value: Value }
  | { kind: "return"; value: Value }
  | { kind: "continue" };

/** Wrap a value as a successful evaluation result. */
export function evalOk(value: Value): EvalResult {
  return { kind: "value", value };
}

/** Wrap a value as a break result. */
export function evalBreak(value: Value): EvalResult {
  return { kind: "break", value };
}

/** Wrap a value as a yield result. */
export function evalYield(value: Value): EvalResult {
  return { kind: "yield", value };
}

/** Wrap a value as a return result. */
export function evalReturn(value: Value): EvalResult {
  return { kind: "return", value };
}

/** Wrap as a continue result. */
export function evalContinue(): EvalResult {
  return { kind: "continue" };
}

/** Error messages for terminal control-flow results. */
const TERMINAL_ERRORS: Record<string, string> = {
  break: "Unexpected break outside loop",
  continue: "Unexpected continue outside loop",
  yield: "Unexpected yield outside block",
  return: "Unexpected return outside function",
};

/** Unwrap an evaluation result to a value. Throws for terminal control-flow results. */
export function unwrap(result: EvalResult): Value {
  if (result.kind !== "value") {
    const msg = TERMINAL_ERRORS[result.kind] ?? `Unexpected ${result.kind}`;
    throw new InterpreterError("runtime", msg);
  }
  return result.value;
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
    case "tuple":
      throw new InterpreterError("runtime", "Cannot coerce tuple to number");
    case "enum":
      throw new InterpreterError("runtime", "Cannot coerce enum to number");
  }
}
