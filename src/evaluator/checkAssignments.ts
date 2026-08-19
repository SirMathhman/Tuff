import type { StatementAssign, Value, ValueDeref, ValueIndexAssign } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import { checkExpression, type BlockChecker } from "./checkExpressions.js";
import { expressionType, typeToString, typesEqual, type DeclScopes, type Type } from "./types.js";

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
function checkMutableArrayTarget(target: Value, scopes: DeclScopes): Result<string, EvalError> {
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
    const pointee = checkMutablePointer(target, target.position, scopes);
    if (!pointee.ok) {
      return pointee;
    }
    return ok(baseIdentName(target));
  }
  // The parser only produces ident or deref targets; this is a defensive fallback.
  return err({
    kind: "TypeMismatch",
    name: "[",
    expected: "array<number>",
    actual: typeToString(expressionType(target, scopes)),
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
): Result<Type, EvalError> {
  const pointerType = expressionType(target.target, scopes);
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

/** Check a `+=` assignment: both the target and the value must be numbers. */
function checkCompound(
  name: string,
  target: Type,
  actual: Type,
  position: number,
): Result<null, EvalError> {
  const mismatch = target.kind !== "number" ? target : actual;
  if (mismatch.kind !== "number") {
    return err({
      kind: "TypeMismatch",
      name,
      expected: "number",
      actual: typeToString(mismatch),
      position,
    });
  }
  return ok(null);
}

/** Check a plain assignment: the value's type must equal the target's type. */
function checkPlain(
  name: string,
  target: Type,
  actual: Type,
  position: number,
): Result<null, EvalError> {
  if (!typesEqual(actual, target)) {
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
  const mutableTarget = checkMutableArrayTarget(target.target, scopes);
  if (!mutableTarget.ok) {
    return mutableTarget;
  }
  const index = checkExpression(target.index, scopes, block);
  if (!index.ok) {
    return index;
  }
  // Resolve through a mutable pointer to the array it points at (matching
  // `*ptr = value` semantics); otherwise the target must be an array directly.
  let targetType = expressionType(target.target, scopes);
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
  const indexType = expressionType(target.index, scopes);
  if (indexType.kind !== "number") {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "number",
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
  const actual = expressionType(statement.value, scopes);
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
    const pointee = checkMutablePointer(target, statement.position, scopes);
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
  return err({
    kind: "TypeMismatch",
    name: "*",
    expected: "ptr<number>",
    actual: typeToString(expressionType(target, scopes)),
    position: statement.position,
  });
}
