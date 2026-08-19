import type { StatementAssign, Value, ValueDeref, ValueIndexAssign } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import type { Outcome } from "./outcome.js";
import { typeToString } from "./types.js";
import { valueToNumber, valueToTyped, type ValueContext } from "./values.js";
import {
  isArray,
  isPointer,
  type Scopes,
  type TypedValue,
  type TypedValueArray,
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
    error: { kind: "UnknownIdentifier", name: "", position: statement.position },
  };
}

/**
 * Write a value to a variable: a plain assignment, or numeric addition when
 * `compound` (`+=`).
 */
function writeValue(variable: Variable, value: TypedValue, compound: boolean): void {
  if (compound) {
    const base = variable.value.kind === "number" ? variable.value.value : 0;
    const addend = value.kind === "number" ? value.value : 0;
    variable.value = { kind: "number", value: base + addend };
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
  const index = valueToNumber(target.index, scopes, ctx);
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
  return err({ kind: "UnknownIdentifier", name: "", position: target.position });
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
