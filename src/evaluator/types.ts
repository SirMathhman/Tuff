import type { Value } from "../ast.js";
import { lookup, type ScopeStack } from "../scopes.js";

/**
 * A static type: a primitive, an array, or a (possibly nested) pointer
 * carrying a mutability flag. Pointers are structured so `&mut` can be
 * distinguished from `&` when checking assignments through a dereference.
 */
export type Type =
  | { kind: "number" }
  | { kind: "bool" }
  | { kind: "array"; element: Type }
  | { kind: "ptr"; mutable: boolean; pointee: Type };

/** Render a type as its display name (e.g. `ptr<number>`, `array<number>`). */
export function typeToString(type: Type): string {
  if (type.kind === "ptr") {
    return `ptr<${typeToString(type.pointee)}>`;
  }
  if (type.kind === "array") {
    return `array<${typeToString(type.element)}>`;
  }
  return type.kind;
}

/** Two types are equal when their display names match. */
export function typesEqual(a: Type, b: Type): boolean {
  return typeToString(a) === typeToString(b);
}

/** A variable's declared type and mutability, tracked across scopes. */
export interface Decl {
  type: Type;
  mutable: boolean;
}

/** A stack of variable declarations, innermost last. */
export type DeclScopes = ScopeStack<Decl>;

/**
 * The static type of a value expression. Literals carry their own type;
 * identifiers take the type of their declaration; every binary operator
 * (`==`, `!=`, `<`, `<=`, `>`, `>=`, `+`) yields a number; `[...]` yields an
 * array of its element type; `arr[i]` yields the array's element type;
 * `&name` yields a pointer to the variable's type; `*ptr` yields the
 * pointed-to type.
 */
export function expressionType(value: Value, scopes: DeclScopes): Type {
  if (value.kind === "number") {
    return { kind: "number" };
  }
  if (value.kind === "bool") {
    return { kind: "bool" };
  }
  if (value.kind === "binary") {
    return { kind: "number" };
  }
  if (value.kind === "array") {
    const element: Type =
      value.elements.length > 0 ? expressionType(value.elements[0], scopes) : { kind: "number" };
    return { kind: "array", element };
  }
  if (value.kind === "index") {
    const target = expressionType(value.target, scopes);
    return target.kind === "array" ? target.element : { kind: "number" };
  }
  if (value.kind === "addressOf") {
    return { kind: "ptr", mutable: value.mutable, pointee: expressionType(value.target, scopes) };
  }
  if (value.kind === "deref") {
    const target = expressionType(value.target, scopes);
    return target.kind === "ptr" ? target.pointee : target;
  }
  return lookup(scopes, value.name)?.type ?? { kind: "number" };
}
