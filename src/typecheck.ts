import type { Value, IntegerValue, IntegerTypeName, BoolValue, FunctionValue, TypeName, ArrayValue } from "./types";

export function integerTypeOf(value: Value): IntegerTypeName | undefined {
  if (typeof value === "object" && value !== null && "kind" in value && value.kind !== "function" && value.kind !== "bool" && value.kind !== "array") {
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

export function isArray(value: Value): value is ArrayValue {
  return typeof value === "object" && value !== null && value.kind === "array";
}

export function isBool(value: Value): value is BoolValue {
  return typeof value === "object" && value !== null && value.kind === "bool";
}

export function typeOf(value: Value): TypeName | undefined {
  const integerType = integerTypeOf(value);
  if (integerType) {
    return integerType;
  }
  if (typeof value === "number") {
    return "I32";
  }
  if (isBool(value) || typeof value === "boolean") {
    return "Bool";
  }
  if (isArray(value)) {
    const elementType = value.elements.length > 0 ? (typeOf(value.elements[0]!) ?? "I32") : "I32";
    return { kind: "array", elementType, size: value.elements.length };
  }
  return undefined;
}

export function typesEqual(a: TypeName, b: TypeName): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a === b;
  }
  if (typeof a === "object" && typeof b === "object") {
    return a.kind === b.kind && a.size === b.size && typesEqual(a.elementType, b.elementType);
  }
  return false;
}
