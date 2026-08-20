import type { StatementAssign, Value, ValueDeref, ValueIndexAssign } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import type { Outcome } from "./outcome.js";
import { promote, typeToString, type Type } from "./types.js";
import { valueToNumber, valueToTyped, type ValueContext } from "./values.js";
import {
  isArray,
  isPointer,
  type Scopes,
  type TypedValue,
  type TypedValueArray,
  type TypedValueFloat,
  type TypedValueInt,
  type Variable,
} from "./typedValues.js";

/**
 * Evaluate an assignment to an identifier or a dereference (`*ptr = value`).
 * Type correctness is guaranteed by the static `typecheck` pass, so this only
 * resolves values. `+=` is numeric addition.
 */
export function evalAssign(statement: StatementAssign, scopes: Scopes, ctx: ValueContext): Outcome {
  const target = statement.target;
  const value = valueToTyped(statement.value, scopes, ctx);
  if (!value.ok) {
    return { kind: "error", error: value.error };
  }
  if (target.kind === "ident") {
    return evalIdentAssign(statement, target.name, value.value, scopes);
  }
  if (target.kind === "deref") {
    return evalDerefAssign(statement, target, value.value, scopes, ctx);
  }
  if (target.kind === "indexAssign") {
    return evalIndexAssign(statement, target, value.value, scopes, ctx);
  }
  // The parser only produces ident, deref, or index targets; defensive fallback.
  return {
    kind: "error",
    error: {
      kind: "TypeMismatch",
      name: "=",
      expected: "lvalue",
      actual: statement.target.kind,
      position: statement.position,
    },
  };
}

/** Type guard: is this a numeric (integer or float) typed value? */
function isNumeric(t: TypedValue): t is TypedValueInt | TypedValueFloat {
  return t.kind === "int" || t.kind === "float";
}

/** The static `Type` of a numeric typed value (for `+=` promotion). */
function numericType(t: TypedValueInt | TypedValueFloat): Type {
  return t.kind === "int" ? { kind: "int", name: t.name } : { kind: "float", name: t.name };
}

/**
 * Write a value to a variable: a plain assignment, or addition typed by
 * promotion when `compound` (`+=`). The typecheck pass guarantees the
 * promoted type is assignable to the variable's type.
 */
function writeValue(variable: Variable, value: TypedValue, compound: boolean): void {
  if (compound) {
    const base = variable.value;
    // The typecheck pass guarantees both sides are numeric; defensive fallback.
    if (!isNumeric(base) || !isNumeric(value)) {
      variable.value = value;
      return;
    }
    const sum = base.value + value.value;
    const promoted = promote(numericType(base), numericType(value));
    // The typecheck pass guarantees a common type; defensive fallback.
    if (!promoted) {
      variable.value = value;
      return;
    }
    if (promoted.kind === "int") {
      variable.value = { kind: "int", name: promoted.name, value: sum };
    } else if (promoted.kind === "float") {
      variable.value = { kind: "float", name: promoted.name, value: sum };
    } else {
      // Promotion of two numeric types is always int or float; defensive.
      variable.value = value;
    }
    return;
  }
  variable.value = value;
}

/** Evaluate `ident = value` or `ident += value` on a looked-up variable. */
function evalIdentAssign(
  statement: StatementAssign,
  name: string,
  value: TypedValue,
  scopes: Scopes,
): Outcome {
  const variable = lookup(scopes, name);
  if (!variable) {
    return {
      kind: "error",
      error: { kind: "UnknownIdentifier", name, position: statement.position },
    };
  }
  if (!variable.mutable) {
    return {
      kind: "error",
      error: { kind: "ImmutableAssignment", name, position: statement.position },
    };
  }
  writeValue(variable, value, statement.compound === "+=");
  return { kind: "void" };
}

/** Evaluate `*ptr = value` by writing through the (mutable) pointer. */
function evalDerefAssign(
  statement: StatementAssign,
  target: ValueDeref,
  value: TypedValue,
  scopes: Scopes,
  ctx: ValueContext,
): Outcome {
  const pointer = valueToTyped(target.target, scopes, ctx);
  if (!pointer.ok) {
    return { kind: "error", error: pointer.error };
  }
  if (!isPointer(pointer.value)) {
    return {
      kind: "error",
      error: {
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: typeToString(pointer.value),
        position: statement.position,
      },
    };
  }
  writeValue(pointer.value.ref, value, statement.compound === "+=");
  return { kind: "void" };
}

/**
 * Evaluate `arr[i] = value` by writing the element into the (mutable) array.
 * The target is an identifier or a dereference (`*ptr`), which may nest.
 */
function evalIndexAssign(
  statement: StatementAssign,
  target: ValueIndexAssign,
  value: TypedValue,
  scopes: Scopes,
  ctx: ValueContext,
): Outcome {
  const array = resolveArrayTarget(target.target, scopes, ctx);
  if (!array.ok) {
    return { kind: "error", error: array.error };
  }
  const index = valueToNumber(target.index, scopes, ctx, "[");
  if (!index.ok) {
    return { kind: "error", error: index.error };
  }
  const element = array.value.elements[index.value];
  if (element === undefined) {
    return {
      kind: "error",
      error: {
        kind: "IndexOutOfBounds",
        index: index.value,
        length: array.value.elements.length,
        position: statement.position,
      },
    };
  }
  array.value.elements[index.value] = value;
  return { kind: "void" };
}

/** Resolve an index-assignment target (an ident or a deref chain) to its array value. */
function resolveArrayTarget(
  target: Value,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValueArray, EvalError> {
  if (target.kind === "ident") {
    const variable = lookup(scopes, target.name);
    if (!variable) {
      return err({ kind: "UnknownIdentifier", name: target.name, position: target.position });
    }
    // A mutable pointer to an array resolves to the array it points at
    // (matching `*ptr = value` semantics).
    const value =
      isPointer(variable.value) && variable.value.mutable
        ? variable.value.ref.value
        : variable.value;
    if (!isArray(value)) {
      return err({
        kind: "TypeMismatch",
        name: "[",
        expected: "array<number>",
        actual: typeToString(variable.value),
        position: target.position,
      });
    }
    return ok(value);
  }
  if (target.kind === "deref") {
    return resolveDerefArrayTarget(target, scopes, ctx);
  }
  // The parser only produces ident or deref targets; this is a defensive fallback.
  return err({
    kind: "TypeMismatch",
    name: "[",
    expected: "lvalue",
    actual: target.kind,
    position: target.position,
  });
}

/** Resolve a `*ptr` index-assignment target to the array the pointer refers to. */
function resolveDerefArrayTarget(
  target: ValueDeref,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValueArray, EvalError> {
  const pointer = valueToTyped(target.target, scopes, ctx);
  if (!pointer.ok) {
    return pointer;
  }
  if (!isPointer(pointer.value)) {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "ptr<number>",
      actual: typeToString(pointer.value),
      position: target.position,
    });
  }
  const pointee = pointer.value.ref.value;
  if (!isArray(pointee)) {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: typeToString(pointee),
      position: target.position,
    });
  }
  return ok(pointee);
}
