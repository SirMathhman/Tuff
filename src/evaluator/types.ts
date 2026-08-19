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

/** A fixed-width integer type (`u8`, `i32`, ...), distinct from `number`. */
export interface TypeInt {
  kind: "int";
  /** The suffix name: `u8`, `u16`, `u32`, `u64`, `i8`, `i16`, `i32`, or `i64`. */
  name: string;
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
export type Type = TypeNumber | TypeBool | TypeInt | TypeArray | TypePtr | TypeRange;

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
  if (type.kind === "int") {
    return type.name;
  }
  return type.kind;
}

/** The promotion rank of an integer type: wider types rank higher; `number` is widest. */
const INT_RANK: Record<string, number> = {
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 3,
  i32: 3,
  u64: 4,
  i64: 4,
};

/** The inclusive value range of each integer type. */
const INT_BOUNDS: Record<string, [number, number]> = {
  u8: [0, 255],
  u16: [0, 65535],
  u32: [0, 4294967295],
  u64: [0, 2 ** 64 - 1],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-(2 ** 31), 2 ** 31 - 1],
  i64: [-(2 ** 63), 2 ** 63 - 1],
};

/** Whether a literal value fits in the named integer type. */
export function intLiteralInRange(name: string, value: number): boolean {
  const bounds = INT_BOUNDS[name];
  return bounds ? value >= bounds[0] && value <= bounds[1] : false;
}

/**
 * Promote two arithmetic operand types to their common result type: the wider
 * of two integer types, or `number` when either operand is a `number`.
 */
export function promote(a: Type, b: Type): Type {
  if (a.kind === "number" || b.kind === "number") {
    return { kind: "number" };
  }
  if (a.kind === "int" && b.kind === "int") {
    return INT_RANK[a.name] >= INT_RANK[b.name] ? a : b;
  }
  return { kind: "number" };
}

/**
 * Resolve a type name as written in an `is` type-test to a `Type`. Accepts
 * the integer names (`U8`..`U64`, `I8`..`I64`, case-insensitive), `Number`,
 * and `Bool`; returns `undefined` for anything else.
 */
export function typeFromName(name: string): Type | undefined {
  const lower = name.toLowerCase();
  if (INT_BOUNDS[lower]) {
    return { kind: "int", name: lower };
  }
  if (lower === "number") {
    return { kind: "number" };
  }
  if (lower === "bool") {
    return { kind: "bool" };
  }
  return undefined;
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
  if (a.kind === "int" && b.kind === "int") {
    return a.name === b.name;
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
    return value.suffix ? { kind: "int", name: value.suffix } : { kind: "number" };
  }
  if (value.kind === "bool") {
    return { kind: "bool" };
  }
  if (value.kind === "binary") {
    // `+` promotes its operands; comparisons and equality yield a number.
    if (value.operator === "+") {
      return promote(expressionType(value.left, scopes), expressionType(value.right, scopes));
    }
    return { kind: "number" };
  }
  if (value.kind === "is") {
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
