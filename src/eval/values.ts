import { type Annotation, type IntType } from "../ast.ts";
import { type ErrorWhere, type Result, type TuffError, ok, typeMismatchAt } from "../errors.ts";

/**
 * A borrow of a binding: reads see the binding's current value, and writes go to it.
 */
export interface Reference {
  /** The binding the reference points to. */
  target: Scope;
  /** True for a writable borrow (&mut), false for a read-only one. */
  mutable: boolean;
}

/**
 * A sized integer. Its value is a bigint, so every type's range is exact, and it never equals a plain number.
 */
export interface Integer {
  /** The sized type, such as U8 or I64. */
  type: IntType;
  /** The value, within the type's range. */
  value: bigint;
}

/**
 * A runtime value: a plain number, a sized integer, a boolean, a one-character string, an array, or a reference.
 */
/**
 * A record: named fields, each holding a value. A record is never changed in place; a field write makes a new record.
 */
export interface RecordValue {
  /** The fields, keyed by name, in declaration order. */
  fields: Map<string, Value>;
}

export type Value = number | Integer | boolean | string | Value[] | Reference | RecordValue;

/**
 * Reports whether a value is a record.
 * @param value - The value to test.
 * @returns True when the value is a RecordValue.
 */
export function isRecord(value: Value): value is RecordValue {
  return typeof value === "object" && !Array.isArray(value) && "fields" in value;
}

/**
 * Returns a copy of an array value, copying nested arrays too, so the copy can change without touching its source.
 * @param value - The value to copy.
 * @returns The copied value; values other than arrays are returned as they are.
 */
export function copyValue(value: Value): Value {
  return Array.isArray(value) ? value.map(copyValue) : value;
}

/**
 * Reports whether a value is a sized integer.
 * @param value - The value to test.
 * @returns True when the value is an Integer.
 */
export function isInteger(value: Value): value is Integer {
  return typeof value === "object" && !Array.isArray(value) && "type" in value;
}

/**
 * Reports whether a value is a reference rather than an array, a sized integer, or a primitive.
 * @param value - The value to test.
 * @returns True when the value is a Reference.
 */
export function isReference(value: Value): value is Reference {
  return typeof value === "object" && !Array.isArray(value) && !isInteger(value) && !isRecord(value);
}

/**
 * Reports whether a value holds a reference whose target is not visible from the holder, at any depth.
 * A reference stays valid only while its target binding is in the scope chain.
 * @param value - The value to test.
 * @param holder - The scope that would hold the value.
 * @returns True when the value would outlive a reference target.
 */
export function escapes(value: Value, holder: Scope | undefined): boolean {
  if (isReference(value)) {
    return !isVisible(value.target, holder);
  }

  if (isRecord(value)) {
    return [...value.fields.values()].some((field) => escapes(field, holder));
  }

  if (Array.isArray(value)) {
    return value.some((element) => escapes(element, holder));
  }

  return false;
}

/**
 * Reports whether a scope is the target or one of its ancestors in the scope chain.
 * @param target - The scope to look for.
 * @param scope - The scope to search from.
 * @returns True when the target is in the chain.
 */
export function isVisible(target: Scope, scope: Scope | undefined): boolean {
  let current = scope;

  while (current !== undefined) {
    if (current === target) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

/**
 * The storage of one binding: its current value and whether an array in it has been moved.
 */
export interface Cell {
  /** The current value of the binding. */
  value: Value;
  /** True when a whole array was used by name and must be assigned before reuse. */
  moved: boolean;
  /** The type the binding was declared with, if any. Every later assignment must keep it. */
  annotation ?: Annotation;
}

/**
 * One let binding in the scope chain, innermost first.
 */
export interface Scope {
  /** The name the binding was declared with. */
  name: string;
  /** The storage of the binding. */
  cell: Cell;
  /** True when the binding was declared with mut. */
  mutable: boolean;
  /** The enclosing binding, or undefined for the outermost one. */
  parent?: Scope;
}

/**
 * Describes the type of a value for error messages.
 * @param value - The value to describe.
 * @returns A phrase such as "a number" or "an array whose elements are a boolean".
 */
export function typeName(value: Value): string {
  if (typeof value === "number") {
    return "a number";
  }

  if (isRecord(value)) {
    return `a record with fields ${[...value.fields.keys()].join(", ")}`;
  }

  if (isInteger(value)) {
    return `a ${value.type}`;
  }

  if (typeof value === "boolean") {
    return "a boolean";
  }

  if (typeof value === "string") {
    return "a string";
  }

  if (isReference(value)) {
    return "a reference";
  }

  const first = value[0];

  return first === undefined ? "an array" : `an array whose elements are ${typeName(first)}`;
}

/**
 * Reports whether two values have the same type. Two arrays match when their elements match;
 * an empty array has no element to compare, so it matches any array.
 * @param left - The first value.
 * @param right - The second value.
 * @returns True when the values have the same type.
 */
export function sameType(left: Value, right: Value): boolean {
  if (isInteger(left) || isInteger(right)) {
    return isInteger(left) && isInteger(right) && left.type === right.type;
  }

  if (isRecord(left) || isRecord(right)) {
    return isRecord(left) && isRecord(right) && left.fields.size === right.fields.size && [...left.fields].every(([name, field]) => {
      const other = right.fields.get(name);

      return other !== undefined && sameType(field, other);
    });
  }

  if (isReference(left) || isReference(right)) {
    return isReference(left) && isReference(right);
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    const first = left[0];
    const other = right[0];

    return first === undefined || other === undefined || sameType(first, other);
  }

  return typeof left === typeof right;
}

/**
 * Reads a value as a plain number.
 * @param value - The value to read.
 * @param where - The token that needs a number.
 * @returns The number, or a TypeMismatch error.
 */
export function asNumber(value: Value, where: ErrorWhere): Result<number, TuffError> {
  if (typeof value === "number") {
    return ok(value);
  }

  return typeMismatchAt(where, "a number", typeName(value));
}

/**
 * Reads a value as a boolean.
 * @param value - The value to read.
 * @param where - The token that needs a boolean.
 * @returns The boolean, or a TypeMismatch error.
 */
export function asBoolean(value: Value, where: ErrorWhere): Result<boolean, TuffError> {
  if (typeof value === "boolean") {
    return ok(value);
  }

  return typeMismatchAt(where, "a boolean", typeName(value));
}

