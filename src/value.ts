import type { Value, IntegerValue, IntegerTypeName, FunctionValue, TypeName } from "./types";

interface IntegerSpec {
  kind: IntegerTypeName;
  min: number;
  max: number;
}

const INTEGER_SPECS: Record<IntegerTypeName, IntegerSpec> = {
  U8: { kind: "U8", min: 0, max: 255 },
  U16: { kind: "U16", min: 0, max: 65535 },
  U32: { kind: "U32", min: 0, max: 4294967295 },
  U64: { kind: "U64", min: 0, max: 18446744073709551615 },
  I8: { kind: "I8", min: -128, max: 127 },
  I16: { kind: "I16", min: -32768, max: 32767 },
  I32: { kind: "I32", min: -2147483648, max: 2147483647 },
  I64: { kind: "I64", min: -9223372036854775808, max: 9223372036854775807 },
};

export function makeInteger(typeName: IntegerTypeName, value: number): IntegerValue {
  const spec = INTEGER_SPECS[typeName];
  if (value < spec.min || value > spec.max) {
    throw new Error(`${typeName} overflow: ${value}`);
  }
  return { kind: typeName, value };
}

export function integerTypeOf(value: Value): IntegerTypeName | undefined {
  if (typeof value === "object" && value !== null && "kind" in value && value.kind !== "function") {
    return value.kind as IntegerTypeName;
  }
  return undefined;
}

export function isInteger(value: Value): value is IntegerValue {
  return integerTypeOf(value) !== undefined;
}

export function isFunction(value: Value): value is FunctionValue {
  return typeof value === "object" && value !== null && value.kind === "function";
}

export function isNumber(value: Value): value is number | IntegerValue {
  return typeof value === "number" || isInteger(value);
}

export function toNumber(value: number | IntegerValue): number {
  if (isInteger(value)) {
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
  const integerType = integerTypeOf(value);
  if (integerType) {
    return integerType;
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
