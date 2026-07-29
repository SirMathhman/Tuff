/**
 * Type matching utilities.
 * Shared logic for type compatibility checks used by both the analyzer
 * and the evaluator. Prevents duplication between isAssignable, typesEqual,
 * and runtime type checks.
 */

import type { Type } from "./types";
import type { Value } from "../eval/value";
import {
  isAssignable,
  isNumeric,
  isPointer,
  isStruct,
  isTuple,
  isUnion,
  isArray,
  pointer,
  arrayType,
  structType,
  tupleType,
  nullType,
  bool,
  voidType,
  numeric,
} from "./types";

/**
 * Derive a runtime Type from a Value.
 * This bridges the gap between runtime values and static types,
 * enabling the `is` operator to check runtime types against static targets.
 */
export function valueToType(value: Value, env: Map<string, Value>): Type {
  switch (value.kind) {
    case "number":
      return value.type ?? numeric("I", 32);
    case "boolean":
      return bool();
    case "null":
      return nullType();
    case "void":
      return voidType();
    case "pointer": {
      const ptrTarget = env.get(value.target);
      if (ptrTarget && ptrTarget.kind !== "void" && ptrTarget.type) {
        return pointer(
          ptrTarget.type,
          value.type?.kind === "pointer" ? value.type.mutable : false,
        );
      }
      return pointer(voidType(), false);
    }
    case "array":
      return value.type?.kind === "array"
        ? value.type
        : arrayType(voidType(), value.elements.length);
    case "struct":
      return value.type?.kind === "struct"
        ? value.type
        : structType("unknown", []);
    case "tuple":
      return value.type?.kind === "tuple"
        ? value.type
        : tupleType(value.elements.map(() => voidType()));
    case "enum":
      return { kind: "enum", name: value.enum, variant: value.variant };
  }
}

/**
 * Check if a runtime value matches a target type.
 * Uses kind-based matching: same kind + compatible inner types.
 * This allows pointer narrowing (ptr is &I32) even when the pointed-to
 * value has a dynamic runtime type.
 */
export function valueMatchesType(
  value: Value,
  target: Type,
  env: Map<string, Value>,
): boolean {
  const runtimeType = valueToType(value, env);
  // Different kinds never match
  if (runtimeType.kind !== target.kind) return false;
  // For simple types (bool, void, null, dynamic), kind match is enough
  if (runtimeType.kind === "bool") return true;
  if (runtimeType.kind === "void") return true;
  if (runtimeType.kind === "null") return true;
  // For numeric types, require exact match (prefix + bits)
  if (isNumeric(runtimeType) && isNumeric(target))
    return (
      runtimeType.prefix === target.prefix && runtimeType.bits === target.bits
    );
  // For pointers: match if inner types are compatible (assignable)
  if (isPointer(runtimeType) && isPointer(target)) {
    return isAssignable(runtimeType.inner, target.inner);
  }
  // For arrays: same length + compatible inner types
  if (isArray(runtimeType) && isArray(target)) {
    return (
      runtimeType.length === target.length &&
      isAssignable(runtimeType.inner, target.inner)
    );
  }
  // For structs: same name
  if (isStruct(runtimeType) && isStruct(target)) {
    return runtimeType.name === target.name;
  }
  // For tuples: same length + compatible element types
  if (isTuple(runtimeType) && isTuple(target)) {
    if (runtimeType.elements.length !== target.elements.length) return false;
    for (let i = 0; i < runtimeType.elements.length; i++) {
      if (!isAssignable(runtimeType.elements[i]!, target.elements[i]!))
        return false;
    }
    return true;
  }
  return false;
}

/**
 * Check if a type matches any variant of a union.
 * Shared helper to avoid duplicating union traversal logic.
 */
export function matchesAnyVariant(
  source: Type,
  union: Type,
  matchFn: (source: Type, variant: Type) => boolean,
): boolean {
  if (!isUnion(union)) return false;
  return union.variants.some((v) => matchFn(source, v));
}
