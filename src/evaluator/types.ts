import type { Value, ValueBlock, ValueIf, ValueMatch } from "../core/ast.js";
import { lookup, withScope, type ScopeStack } from "../core/scopes.js";

/** The `number` type. */
export interface TypeNumber {
  kind: "number";
}

/** The `bool` type. */
export interface TypeBool {
  kind: "bool";
}

/** An array of a single element type. */
export interface TypeArray {
  kind: "array";
  element: Type;
}

/**
 * A (possibly nested) pointer carrying a mutability flag. Pointers are
 * structured so `&mut` can be distinguished from `&` when checking
 * assignments through a dereference.
 */
export interface TypePtr {
  kind: "ptr";
  mutable: boolean;
  pointee: Type;
}

/** A numeric range (`start..end`), exclusive of `end`. */
export interface TypeRange {
  kind: "range";
  element: Type;
}

/** A static type: a primitive, an array, a pointer, or a range. */
export type Type = TypeNumber | TypeBool | TypeArray | TypePtr | TypeRange;

/** Render a type as its display name (e.g. `ptr<number>`, `array<number>`). */
export function typeToString(type: Type): string {
  if (type.kind === "ptr") {
    return `ptr<${typeToString(type.pointee)}>`;
  }
  if (type.kind === "array") {
    return `array<${typeToString(type.element)}>`;
  }
  if (type.kind === "range") {
    return `range<${typeToString(type.element)}>`;
  }
  return type.kind;
}

/** Two types are equal when their structure matches (kind, element, pointee, mutability). */
export function typesEqual(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "array" && b.kind === "array") {
    return typesEqual(a.element, b.element);
  }
  if (a.kind === "ptr" && b.kind === "ptr") {
    return a.mutable === b.mutable && typesEqual(a.pointee, b.pointee);
  }
  if (a.kind === "range" && b.kind === "range") {
    return typesEqual(a.element, b.element);
  }
  return true;
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
  if (value.kind === "indexAssign") {
    const target = expressionType(value.target, scopes);
    const arrayType = target.kind === "ptr" ? target.pointee : target;
    return arrayType.kind === "array" ? arrayType.element : { kind: "number" };
  }
  if (value.kind === "range") {
    return { kind: "range", element: expressionType(value.start, scopes) };
  }
  if (value.kind === "if") {
    return ifType(value, scopes);
  }
  if (value.kind === "match") {
    return matchType(value, scopes);
  }
  if (value.kind === "block") {
    return blockType(value, scopes);
  }
  return lookup(scopes, value.name)?.type ?? { kind: "number" };
}

/**
 * The static type of an `if` expression: the type of its branches (the
 * typecheck pass guarantees both branches share one type).
 */
function ifType(value: ValueIf, scopes: DeclScopes): Type {
  return expressionType(value.then, scopes);
}

/**
 * The static type of a `match` expression: the type of its arms (the
 * typecheck pass guarantees all arms share one type).
 */
function matchType(value: ValueMatch, scopes: DeclScopes): Type {
  const first = value.arms[0];
  return first ? expressionType(first.value, scopes) : { kind: "number" };
}

/**
 * The static type of a `{ ... }` block value: the type of its final bare
 * expression, with the block's top-level `let` declarations in scope.
 */
function blockType(value: ValueBlock, scopes: DeclScopes): Type {
  return withScope(scopes, () => {
    for (const statement of value.statements) {
      if (statement.kind === "let") {
        const type = expressionType(statement.value, scopes);
        scopes[scopes.length - 1].set(statement.name, { type, mutable: statement.mutable });
      }
    }
    const last = value.statements[value.statements.length - 1];
    if (last && last.kind === "expr") {
      return expressionType(last.value, scopes);
    }
    return { kind: "number" };
  });
}
