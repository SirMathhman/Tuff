import type { StatementAssign, Value, ValueDeref, ValueIndexAssign } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import { checkExpression } from "./checkExpressions.js";
import type { BlockChecker } from "./checkPredicates.js";
import {
  INT_ANY,
  isSubtype,
  isUnsignedInt,
  promote,
  typeToString,
  type DeclScopes,
  type Type,
} from "./types.js";

/** The base identifier name of an lvalue (an ident, or a deref/index chain ending in one). */
function baseIdentName(value: Value): string {
  if (value.kind === "deref" || value.kind === "indexAssign") {
    return baseIdentName(value.target);
  }
  if (value.kind === "ident") {
    return value.name;
  }
  return "";
}

/**
 * Check that the array an index assignment writes into is mutable, returning
 * the base identifier name for error payloads. An ident must be declared
 * `mut`; a deref must point through a mutable pointer.
 */
function checkMutableArrayTarget(
  target: Value,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<string, EvalError> {
  if (target.kind === "ident") {
    const decl = lookup(scopes, target.name);
    if (!decl) {
      return err({ kind: "UnknownIdentifier", name: target.name, position: target.position });
    }
    if (!decl.mutable) {
      // A mutable pointer to an array permits element writes even when the
      // pointer variable itself is not `mut` (matching `*ptr = value`).
      if (!(decl.type.kind === "ptr" && decl.type.mutable)) {
        return err({ kind: "ImmutableAssignment", name: target.name, position: target.position });
      }
    }
    return ok(target.name);
  }
  if (target.kind === "deref") {
    const pointee = checkMutablePointer(target, target.position, scopes, block);
    if (!pointee.ok) {
      return pointee;
    }
    return ok(baseIdentName(target));
  }
  // The parser only produces ident or deref targets; this is a defensive fallback.
  const targetType = checkExpression(target, scopes, block);
  if (!targetType.ok) {
    return targetType;
  }
  return err({
    kind: "TypeMismatch",
    name: "[",
    expected: "array<number>",
    actual: typeToString(targetType.value),
    position: target.position,
  });
}

/**
 * Check that `target` is a mutable pointer and return its pointee type.
 * Shared by `*ptr = value` and the array-mutability check for `arr[i] = value`.
 */
function checkMutablePointer(
  target: ValueDeref,
  position: number,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const pointer = checkExpression(target.target, scopes, block);
  if (!pointer.ok) {
    return pointer;
  }
  const pointerType = pointer.value;
  if (pointerType.kind !== "ptr") {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "ptr<number>",
      actual: typeToString(pointerType),
      position,
    });
  }
  if (!pointerType.mutable) {
    return err({ kind: "ImmutableAssignment", name: baseIdentName(target), position });
  }
  return ok(pointerType.pointee);
}

/**
 * Check a `+=` assignment: the target and the value must be numeric, and the
 * promoted type of the two must be assignable to the target's type (e.g.
 * `x: u16; x += 1U8` is valid because `u16 + u8` is `u16`).
 */
function checkCompound(
  name: string,
  target: Type,
  actual: Type,
  position: number,
): Result<null, EvalError> {
  const numeric = (t: Type): boolean => t.kind === "int" || t.kind === "float";
  if (!numeric(target) || !numeric(actual)) {
    const mismatch = !numeric(target) ? target : actual;
    return err({
      kind: "TypeMismatch",
      name,
      expected: "number",
      actual: typeToString(mismatch),
      position,
    });
  }
  const promoted = promote(target, actual);
  if (!promoted || !isSubtype(promoted, target)) {
    return err({
      kind: "TypeMismatch",
      name,
      expected: typeToString(target),
      actual: typeToString(promoted ?? actual),
      position,
    });
  }
  return ok(null);
}

/** Check a plain assignment: the value's type must be a subtype of the target's type. */
function checkPlain(
  name: string,
  target: Type,
  actual: Type,
  position: number,
): Result<null, EvalError> {
  if (!isSubtype(actual, target)) {
    return err({
      kind: "TypeMismatch",
      name,
      expected: typeToString(target),
      actual: typeToString(actual),
      position,
    });
  }
  return ok(null);
}

/**
 * Check an index assignment target (`arr[i] = value`): the array must be
 * mutable, the index a number, and the value must match the element type.
 */
function checkIndexAssign(
  target: ValueIndexAssign,
  name: string,
  actual: Type,
  check: (name: string, target: Type, actual: Type, position: number) => Result<null, EvalError>,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  const mutableTarget = checkMutableArrayTarget(target.target, scopes, block);
  if (!mutableTarget.ok) {
    return mutableTarget;
  }
  const index = checkExpression(target.index, scopes, block);
  if (!index.ok) {
    return index;
  }
  // Resolve through a mutable pointer to the array it points at (matching
  // `*ptr = value` semantics); otherwise the target must be an array directly.
  const targetChecked = checkExpression(target.target, scopes, block);
  if (!targetChecked.ok) {
    return targetChecked;
  }
  let targetType = targetChecked.value;
  if (targetType.kind === "ptr") {
    targetType = targetType.pointee;
  }
  if (targetType.kind !== "array") {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: typeToString(targetType),
      position: target.position,
    });
  }
  const indexType = index.value;
  const validIndex =
    indexType.kind === "int" && (indexType.name === INT_ANY || isUnsignedInt(indexType.name));
  if (!validIndex) {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "usize",
      actual: typeToString(indexType),
      position: target.index.position,
    });
  }
  return check(name, targetType.element, actual, target.position);
}

/** Check an assignment statement: `ident = value` or `*ptr = value` (and `+=`). */
export function checkAssign(
  statement: StatementAssign,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  const target = statement.target;
  const name = baseIdentName(target);
  const value = checkExpression(statement.value, scopes, block);
  if (!value.ok) {
    return value;
  }
  const actual = value.value;
  const check = statement.compound ? checkCompound : checkPlain;

  if (target.kind === "ident") {
    const decl = lookup(scopes, target.name);
    if (!decl) {
      return err({ kind: "UnknownIdentifier", name: target.name, position: statement.position });
    }
    return check(name, decl.type, actual, statement.position);
  }

  // Deref target (`*ptr = value`): the pointer must be mutable and the value
  // must match the pointee type.
  if (target.kind === "deref") {
    const pointee = checkMutablePointer(target, statement.position, scopes, block);
    if (!pointee.ok) {
      return pointee;
    }
    return check(name, pointee.value, actual, statement.position);
  }

  // Index target (`arr[i] = value`): the array must be mutable, the index a
  // number, and the value must match the element type.
  if (target.kind === "indexAssign") {
    return checkIndexAssign(target, name, actual, check, scopes, block);
  }

  // The parser only produces ident, deref, or index targets; defensive fallback.
  const targetType = checkExpression(target, scopes, block);
  if (!targetType.ok) {
    return targetType;
  }
  return err({
    kind: "TypeMismatch",
    name: "*",
    expected: "ptr<number>",
    actual: typeToString(targetType.value),
    position: statement.position,
  });
}
