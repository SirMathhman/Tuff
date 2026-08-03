import type { Value, IntegerValue, IntegerTypeName, BoolValue, FunctionValue, TypeName, ArrayValue, StructValue } from "./types";

export function integerTypeOf(value: Value): IntegerTypeName | undefined {
  if (typeof value === "object" && value !== null && "kind" in value && value.kind !== "function" && value.kind !== "bool" && value.kind !== "array" && value.kind !== "struct") {
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

export function isStruct(value: Value): value is StructValue {
  return typeof value === "object" && value !== null && value.kind === "struct";
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
  if (isStruct(value)) {
    const fields: Record<string, TypeName> = {};
    for (const [name, fieldValue] of Object.entries(value.fields)) {
      fields[name] = typeOf(fieldValue) ?? "I32";
    }
    return { kind: "struct", name: value.name, fields };
  }
  return undefined;
}

export function typesEqual(a: TypeName, b: TypeName): boolean {
  if (typeof a === "string" && typeof b === "string") {
    return a === b;
  }
  if (typeof a === "object" && typeof b === "object") {
    if (a.kind === "array" && b.kind === "array") {
      return a.size === b.size && typesEqual(a.elementType, b.elementType);
    }
    if (a.kind === "struct" && b.kind === "struct") {
      if (a.name !== b.name) {
        return false;
      }
      const aKeys = Object.keys(a.fields);
      const bKeys = Object.keys(b.fields);
      if (aKeys.length !== bKeys.length) {
        return false;
      }
      return aKeys.every((key) => key in b.fields && typesEqual(a.fields[key]!, b.fields[key]!));
    }
  }
  return false;
}

export function assertTypeMatches(value: Value, expected: TypeName, context: string): void {
  const actual = typeOf(value) ?? "I32";
  if (!typesEqual(actual, expected)) {
    throw new Error(`${context}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
