/**
 * Type system for the Tuff language.
 * Single source of truth for all types, compatibility rules, and parsing.
 */

import type { TokenPos } from "../lexer/tokenizer";

/** Numeric type with a prefix (U/I/F) and bit width. */
export interface NumericType {
  kind: "numeric";
  prefix: "U" | "I" | "F";
  bits: number;
}

/** Boolean type. */
export interface BoolType {
  kind: "bool";
}

/** Void type (blocks ending with declarations). */
export interface VoidType {
  kind: "void";
}

/** Dynamic / unknown type (no annotation, no suffix). */
export interface DynamicType {
  kind: "dynamic";
}

/** Pointer type referencing another type. */
export interface PointerType {
  kind: "pointer";
  inner: Type;
  mutable: boolean;
}

/** Array type with element type and fixed length. */
export interface ArrayType {
  kind: "array";
  inner: Type;
  length: number;
}

/** Struct type with named fields. */
export interface StructType {
  kind: "struct";
  name: string;
  typeParams?: string[];
  fields: { name: string; type: Type; mutable?: boolean }[];
}

/** Tuple type with ordered element types. */
export interface TupleType {
  kind: "tuple";
  elements: Type[];
}

/** Enum type with a name and variant. */
export interface EnumType {
  kind: "enum";
  name: string;
  variant: string;
}

/** Union type (e.g., `I32 | Bool`). */
export interface UnionType {
  kind: "union";
  variants: Type[];
}

/** Generic type parameter (e.g., `T` in `fn pass<T>(value : T)`). */
export interface TypeParamType {
  kind: "typeParam";
  name: string;
}

/** Unresolved type placeholder — name string from the parser, not yet validated. */
export interface UnresolvedType {
  kind: "unresolved";
  name: string;
  pos?: TokenPos;
  typeArgs?: Type[];
}

/** `this` type — refers to the current scope. Assignments through immutable `this` holders are no-ops. */
export interface ThisType {
  kind: "this";
}

/** All possible types in the Tuff language. */
export type Type =
  | NumericType
  | BoolType
  | VoidType
  | DynamicType
  | PointerType
  | ArrayType
  | StructType
  | TupleType
  | EnumType
  | UnionType
  | TypeParamType
  | UnresolvedType
  | ThisType;

/** Construct a numeric type. */
export function numeric(prefix: "U" | "I" | "F", bits: number): NumericType {
  return { kind: "numeric", prefix, bits };
}

/** Construct a boolean type. */
export function bool(): BoolType {
  return { kind: "bool" };
}

/** Construct a void type. */
export function voidType(): VoidType {
  return { kind: "void" };
}

/** Construct a dynamic type. */
export function dynamic(): DynamicType {
  return { kind: "dynamic" };
}

/** Construct a pointer type. */
export function pointer(inner: Type, mutable: boolean = false): PointerType {
  return { kind: "pointer", inner, mutable };
}

/** Construct an array type. */
export function arrayType(inner: Type, length: number): ArrayType {
  return { kind: "array", inner, length };
}

/** Construct a struct type. */
export function structType(
  name: string,
  fields: { name: string; type: Type }[],
  typeParams?: string[],
): StructType {
  return { kind: "struct", name, typeParams, fields };
}

/** Construct a tuple type. */
export function tupleType(elements: Type[]): TupleType {
  return { kind: "tuple", elements };
}

/** Construct a union type. */
export function unionType(variants: Type[]): UnionType {
  return { kind: "union", variants };
}

/** Construct a type parameter. */
export function typeParam(name: string): TypeParamType {
  return { kind: "typeParam", name };
}

/** Check if a type is a type parameter. */
export function isTypeParam(t: Type): t is TypeParamType {
  return t.kind === "typeParam";
}

/** Check if a type is numeric. */
export function isNumeric(t: Type): t is NumericType {
  return t.kind === "numeric";
}

/** Check if a type is boolean. */
export function isBool(t: Type): t is BoolType {
  return t.kind === "bool";
}

/** Check if a type is void. */
export function isVoid(t: Type): t is VoidType {
  return t.kind === "void";
}

/** Check if a type is dynamic. */
export function isDynamic(t: Type): t is DynamicType {
  return t.kind === "dynamic";
}

/** Check if a type is a pointer type. */
export function isPointer(t: Type): t is PointerType {
  return t.kind === "pointer";
}

/** Check if a type is a union type. */
export function isUnion(t: Type): t is UnionType {
  return t.kind === "union";
}

/** Check if a type is an array type. */
export function isArray(t: Type): t is ArrayType {
  return t.kind === "array";
}

/** Check if a type is a struct type. */
export function isStruct(t: Type): t is StructType {
  return t.kind === "struct";
}

/** Check if a type is a tuple type. */
export function isTuple(t: Type): t is TupleType {
  return t.kind === "tuple";
}

/** Get bit width for numeric types, 0 otherwise. */
export function getBits(t: Type): number {
  return t.kind === "numeric" ? t.bits : 0;
}

/**
 * Check if source type is assignable to target type.
 * - Dynamic → anything: always OK
 * - Bool → Bool: exact match
 * - Numeric → Numeric: same prefix family, source.bits <= target.bits
 * - Pointer → Pointer: inner types must be compatible
 * - Array → Array: same length, inner types must be compatible
 * - Bool ↔ Numeric: never OK
 */
export function isAssignable(source: Type, target: Type): boolean {
  if (isDynamic(source)) return true;
  if (isBool(target)) return isBool(source);
  if (isBool(source)) return false;
  if (isPointer(target)) {
    if (!isPointer(source)) return false;
    return isAssignable(source.inner, target.inner);
  }
  if (isPointer(source)) return false;
  if (isArray(target)) {
    if (!isArray(source)) return false;
    if (source.length !== target.length) return false;
    return isAssignable(source.inner, target.inner);
  }
  if (isArray(source)) return false;
  if (isStruct(target)) {
    if (!isStruct(source)) return false;
    if (source.name !== target.name) return false;
    if (source.fields.length !== target.fields.length) return false;
    for (let i = 0; i < source.fields.length; i++) {
      if (!isAssignable(source.fields[i]!.type, target.fields[i]!.type))
        return false;
    }
    return true;
  }
  if (isStruct(source)) return false;
  if (isTuple(target)) {
    if (!isTuple(source)) return false;
    if (source.elements.length !== target.elements.length) return false;
    for (let i = 0; i < source.elements.length; i++) {
      if (!isAssignable(source.elements[i]!, target.elements[i]!)) return false;
    }
    return true;
  }
  if (isTuple(source)) return false;
  if (!isNumeric(target) || !isNumeric(source)) return false;
  return source.prefix === target.prefix && source.bits <= target.bits;
}

/**
 * Widen two types: if one is dynamic, use the other.
 * If both concrete numeric, find the smallest type that can hold both ranges:
 * - Same prefix: use the wider bit width.
 * - Mixed signed/unsigned (U+I): result is signed (I) with doubled bits.
 * - Any float (F): result is float with max bits.
 */
export function widen(a: Type, b: Type): Type {
  if (isDynamic(a)) return b;
  if (isDynamic(b)) return a;
  if (isNumeric(a) && isNumeric(b)) {
    // Any float dominates
    if (a.prefix === "F" || b.prefix === "F") {
      return numeric("F", Math.max(a.bits, b.bits));
    }
    // Mixed signed/unsigned: result is signed with doubled bits
    if (a.prefix !== b.prefix) {
      return numeric("I", Math.max(a.bits, b.bits) * 2);
    }
    // Same prefix: use wider
    return a.bits >= b.bits ? a : b;
  }
  return a;
}

/** Parse a type name string into a Type. Supports &TypeName and &mut TypeName for pointers. */
export function parseTypeName(name: string): Type {
  return resolveBuiltinType(name);
}

/** Resolve a builtin type name to a Type. Does not look up user-defined types. */
export function resolveBuiltinType(name: string): Type {
  if (name === "Bool") return bool();
  if (name === "Void") return voidType();
  const ptrMatch = name.match(/^&mut\s+(.+)$/);
  if (ptrMatch) {
    return pointer(resolveBuiltinType(ptrMatch[1]!), true);
  }
  const ptrMatch2 = name.match(/^&(.+)$/);
  if (ptrMatch2) {
    return pointer(resolveBuiltinType(ptrMatch2[1]!), false);
  }
  const match = name.match(/^([UIF])(\d+)$/);
  if (match) {
    const prefix = match[1] as "U" | "I" | "F";
    const bits = Number(match[2]);
    return numeric(prefix, bits);
  }
  return dynamic();
}

/** Convert a Type back to a string for error messages. */
export function typeName(t: Type): string {
  if (t.kind === "numeric") return `${t.prefix}${t.bits}`;
  if (t.kind === "bool") return "Bool";
  if (t.kind === "void") return "Void";
  if (t.kind === "pointer") return `&${typeName(t.inner)}`;
  if (t.kind === "array") return `[${typeName(t.inner)}; ${t.length}]`;
  if (t.kind === "struct") return t.name;
  if (t.kind === "tuple") return `(${t.elements.map(typeName).join(", ")})`;
  if (t.kind === "unresolved") return t.name;
  return "dynamic";
}

/** Check if two struct types are structurally equal. */
function structsEqual(a: StructType, b: StructType): boolean {
  if (a.name !== b.name) return false;
  if (a.fields.length !== b.fields.length) return false;
  for (let i = 0; i < a.fields.length; i++) {
    if (a.fields[i]!.name !== b.fields[i]!.name) return false;
    if (!typesEqual(a.fields[i]!.type, b.fields[i]!.type)) return false;
  }
  return true;
}

/** Check if two types are exactly equal (structural equality). */
export function typesEqual(a: Type | undefined, b: Type): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "bool") return true;
  if (a.kind === "void") return true;
  if (a.kind === "dynamic") return b.kind === "dynamic";
  if (isNumeric(a) && isNumeric(b))
    return a.prefix === b.prefix && a.bits === b.bits;
  if (a.kind === "struct" && b.kind === "struct") return structsEqual(a, b);
  return false;
}
