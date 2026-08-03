import type { Value, U8Value, U16Value, U32Value, U64Value, I8Value, I16Value, I64Value, FunctionValue, TypeName } from "./types";

const U8_MAX = 255;
const U16_MAX = 65535;
const U32_MAX = 4294967295;
const U64_MAX = 18446744073709551615;
const I8_MIN = -128;
const I8_MAX = 127;
const I16_MIN = -32768;
const I16_MAX = 32767;
const I64_MIN = -9223372036854775808;
const I64_MAX = 9223372036854775807;

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

export function makeU32(value: number): U32Value {
  if (value < 0 || value > U32_MAX) {
    throw new Error(`U32 overflow: ${value}`);
  }
  return { kind: "u32", value };
}

export function makeU64(value: number): U64Value {
  if (value < 0 || value > U64_MAX) {
    throw new Error(`U64 overflow: ${value}`);
  }
  return { kind: "u64", value };
}

export function makeI8(value: number): I8Value {
  if (value < I8_MIN || value > I8_MAX) {
    throw new Error(`I8 overflow: ${value}`);
  }
  return { kind: "i8", value };
}

export function makeI16(value: number): I16Value {
  if (value < I16_MIN || value > I16_MAX) {
    throw new Error(`I16 overflow: ${value}`);
  }
  return { kind: "i16", value };
}

export function makeI64(value: number): I64Value {
  if (value < I64_MIN || value > I64_MAX) {
    throw new Error(`I64 overflow: ${value}`);
  }
  return { kind: "i64", value };
}

export function isU8(value: Value): value is U8Value {
  return typeof value === "object" && value !== null && value.kind === "u8";
}

export function isU16(value: Value): value is U16Value {
  return typeof value === "object" && value !== null && value.kind === "u16";
}

export function isU32(value: Value): value is U32Value {
  return typeof value === "object" && value !== null && value.kind === "u32";
}

export function isU64(value: Value): value is U64Value {
  return typeof value === "object" && value !== null && value.kind === "u64";
}

export function isI8(value: Value): value is I8Value {
  return typeof value === "object" && value !== null && value.kind === "i8";
}

export function isI16(value: Value): value is I16Value {
  return typeof value === "object" && value !== null && value.kind === "i16";
}

export function isI64(value: Value): value is I64Value {
  return typeof value === "object" && value !== null && value.kind === "i64";
}

export function isFunction(value: Value): value is FunctionValue {
  return typeof value === "object" && value !== null && value.kind === "function";
}

export function isNumber(value: Value): value is number | U8Value | U16Value | U32Value | U64Value | I8Value | I16Value | I64Value {
  return typeof value === "number" || isU8(value) || isU16(value) || isU32(value) || isU64(value) || isI8(value) || isI16(value) || isI64(value);
}

export function toNumber(value: number | U8Value | U16Value | U32Value | U64Value | I8Value | I16Value | I64Value): number {
  if (isU8(value) || isU16(value) || isU32(value) || isU64(value) || isI8(value) || isI16(value) || isI64(value)) {
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
  if (isU32(value)) {
    return "U32";
  }
  if (isU64(value)) {
    return "U64";
  }
  if (isI8(value)) {
    return "I8";
  }
  if (isI16(value)) {
    return "I16";
  }
  if (isI64(value)) {
    return "I64";
  }
  if (typeof value === "number") {
    return "I32";
  }
  if (typeof value === "boolean") {
    return "Bool";
  }
  return undefined;
}

export function isTruthy(value: Value): boolean {
  return value !== false && value !== 0;
}
