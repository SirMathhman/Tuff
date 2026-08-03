import type { Value, U8Value, U16Value, FunctionValue, TypeName } from "./types";

const U8_MAX = 255;
const U16_MAX = 65535;

export function makeU8(value: number): U8Value {
  if (value < 0 || value > U8_MAX) {
    throw new Error(`U8 overflow: ${value}`);
  }
  return { kind: "u8", value };
}

export function makeU16(value: number): U16Value {
  if (value < 0 || value > U16_MAX) {
    throw new Error(`U16 overflow: ${value}`);
  }
  return { kind: "u16", value };
}

export function isU8(value: Value): value is U8Value {
  return typeof value === "object" && value !== null && value.kind === "u8";
}

export function isU16(value: Value): value is U16Value {
  return typeof value === "object" && value !== null && value.kind === "u16";
}

export function isFunction(value: Value): value is FunctionValue {
  return typeof value === "object" && value !== null && value.kind === "function";
}

export function isNumber(value: Value): value is number | U8Value | U16Value {
  return typeof value === "number" || isU8(value) || isU16(value);
}

export function toNumber(value: number | U8Value | U16Value): number {
  if (isU8(value) || isU16(value)) {
    return value.value;
  }
  return value;
}

export function requireNumber(value: Value, operator: string): number {
  if (!isNumber(value)) {
    throw new Error(`Binary operator requires numbers: ${operator}`);
  }
  return toNumber(value);
}

export function typeOf(value: Value): TypeName | undefined {
  if (isU8(value)) {
    return "U8";
  }
  if (isU16(value)) {
    return "U16";
  }
  if (typeof value === "number") {
    return "I32";
  }
  return undefined;
}

export function isTruthy(value: Value): boolean {
  return value !== false && value !== 0;
}
