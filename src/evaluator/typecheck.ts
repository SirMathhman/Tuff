import type {
  Program,
  Statement,
  StatementAssign,
  StatementBreak,
  StatementContinue,
  StatementFor,
  StatementWhile,
  Value,
  ValueDeref,
  ValueIndexAssign,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup, withScope } from "../core/scopes.js";
import { checkExpression, checkNumericCoercible } from "./checkExpressions.js";
import { expressionType, typeToString, typesEqual, type DeclScopes, type Type } from "./types.js";

/** The base identifier name of an lvalue (an ident, or a deref/index chain ending in one). */
function baseIdentName(value: Value): string {
  if (value.kind === "deref") {
    return baseIdentName(value.target);
  }
  if (value.kind === "indexAssign") {
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

/**
 * Check a list of statements, tracking declarations across nested scopes.
 * `inLoop` is true when the list is a `while` body, so a `break` is valid.
 */
function checkStatements(
  statements: Statement[],
  scopes: DeclScopes,
  inLoop: boolean,
): Result<null, EvalError> {
  for (const statement of statements) {
    const result = checkStatement(statement, scopes, inLoop);
    if (!result.ok) {
      return result;
    }
  }
  return ok(null);
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

/** Check an assignment statement: `ident = value` or `*ptr = value` (and `+=`). */
function checkAssign(statement: StatementAssign, scopes: DeclScopes): Result<null, EvalError> {
  const target = statement.target;
  const name = baseIdentName(target);
  const value = checkExpression(statement.value, scopes);
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
    return checkIndexAssign(target, name, actual, check, scopes);
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
): Result<null, EvalError> {
  const mutableTarget = checkMutableArrayTarget(target.target, scopes);
  if (!mutableTarget.ok) {
    return mutableTarget;
  }
  const index = checkExpression(target.index, scopes);
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

/** Check a `while` loop: the condition is a value and the body is checked in a loop scope. */
function checkWhile(statement: StatementWhile, scopes: DeclScopes): Result<null, EvalError> {
  const condition = checkExpression(statement.condition, scopes);
  if (!condition.ok) {
    return condition;
  }
  const coercible = checkNumericCoercible(statement.condition, scopes, "while");
  if (!coercible.ok) {
    return coercible;
  }
  return withScope(scopes, () => checkStatements(statement.body, scopes, true));
}

/**
 * Check a `for (i in start..end)` loop (exclusive of `end`): both range bounds
 * must be numbers, and the body is checked in a loop scope where the variable
 * is a mutable number.
 */
function checkFor(statement: StatementFor, scopes: DeclScopes): Result<null, EvalError> {
  const start = checkExpression(statement.start, scopes);
  if (!start.ok) {
    return start;
  }
  const end = checkExpression(statement.end, scopes);
  if (!end.ok) {
    return end;
  }
  for (const bound of [statement.start, statement.end]) {
    if (expressionType(bound, scopes).kind !== "number") {
      return err({
        kind: "TypeMismatch",
        name: "..",
        expected: "number",
        actual: typeToString(expressionType(bound, scopes)),
        position: bound.position,
      });
    }
  }
  return withScope(scopes, () => {
    scopes[scopes.length - 1].set(statement.variable, { type: { kind: "number" }, mutable: true });
    return checkStatements(statement.body, scopes, true);
  });
}

/** Check a `break` or `continue` statement: it must be inside a loop body. */
function checkLoopControl(
  statement: StatementBreak | StatementContinue,
  inLoop: boolean,
): Result<null, EvalError> {
  if (inLoop) {
    return ok(null);
  }
  return err({
    kind: statement.kind === "break" ? "BreakOutsideLoop" : "ContinueOutsideLoop",
    position: statement.position,
  });
}

/**
 * Check a single statement, validating types and identifier declarations.
 * `inLoop` is true when the statement is inside a `while` body.
 */
function checkStatement(
  statement: Statement,
  scopes: DeclScopes,
  inLoop: boolean,
): Result<null, EvalError> {
  if (statement.kind === "let") {
    const initializer = checkExpression(statement.value, scopes);
    if (!initializer.ok) {
      return initializer;
    }
    const type = expressionType(statement.value, scopes);
    scopes[scopes.length - 1].set(statement.name, { type, mutable: statement.mutable });
    return ok(null);
  }

  if (statement.kind === "assign") {
    return checkAssign(statement, scopes);
  }

  if (statement.kind === "return") {
    const value = checkExpression(statement.value, scopes);
    if (!value.ok) {
      return value;
    }
    return checkNumericCoercible(statement.value, scopes, "return");
  }

  if (statement.kind === "block") {
    return withScope(scopes, () => checkStatements(statement.statements, scopes, inLoop));
  }

  if (statement.kind === "if") {
    const condition = checkExpression(statement.condition, scopes);
    if (!condition.ok) {
      return condition;
    }
    const coercible = checkNumericCoercible(statement.condition, scopes, "if");
    if (!coercible.ok) {
      return coercible;
    }
    const then = withScope(scopes, () => checkStatements(statement.then, scopes, inLoop));
    if (!then.ok) {
      return then;
    }
    if (statement.else) {
      const elseBranch = statement.else;
      return withScope(scopes, () => checkStatements(elseBranch, scopes, inLoop));
    }
    return ok(null);
  }

  if (statement.kind === "while") {
    return checkWhile(statement, scopes);
  }

  if (statement.kind === "for") {
    return checkFor(statement, scopes);
  }

  // break / continue
  return checkLoopControl(statement, inLoop);
}

/**
 * Statically type-check a parsed program, walking every code path (including
 * branches that may never execute at runtime). Catches `TypeMismatch` and
 * `UnknownIdentifier` errors before evaluation.
 * @param program - The program from `parse`.
 * @returns `ok(null)` when the program is well-typed, or the first `EvalError`.
 */
export function typecheck(program: Program): Result<null, EvalError> {
  return checkStatements(program.statements, [new Map()], false);
}
