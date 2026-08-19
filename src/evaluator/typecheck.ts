import type { Program, Statement, Value } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";
import { lookup, withScope } from "../scopes.js";
import { checkExpression } from "./checkExpressions.js";
import { expressionType, typeToString, typesEqual, type DeclScopes, type Type } from "./types.js";

/** The base identifier name of an lvalue (an ident, or a deref chain ending in one). */
function baseIdentName(value: Value): string {
  if (value.kind === "deref") {
    return baseIdentName(value.target);
  }
  if (value.kind === "ident") {
    return value.name;
  }
  return "";
}

/** Check a list of statements, tracking declarations across nested scopes. */
function checkStatements(statements: Statement[], scopes: DeclScopes): Result<null, EvalError> {
  for (const statement of statements) {
    const result = checkStatement(statement, scopes);
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
function checkAssign(
  statement: Extract<Statement, { kind: "assign" }>,
  scopes: DeclScopes,
): Result<null, EvalError> {
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
    const pointerType = expressionType(target.target, scopes);
    if (pointerType.kind !== "ptr") {
      return err({
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: typeToString(pointerType),
        position: statement.position,
      });
    }
    if (!pointerType.mutable) {
      return err({ kind: "ImmutableAssignment", name, position: statement.position });
    }
    return check(name, pointerType.pointee, actual, statement.position);
  }

  // The parser only produces ident or deref targets; this is a defensive fallback.
  return err({
    kind: "TypeMismatch",
    name: "*",
    expected: "ptr<number>",
    actual: typeToString(expressionType(target, scopes)),
    position: statement.position,
  });
}

/** Check a single statement, validating types and identifier declarations. */
function checkStatement(statement: Statement, scopes: DeclScopes): Result<null, EvalError> {
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
    return checkExpression(statement.value, scopes);
  }

  if (statement.kind === "block") {
    return withScope(scopes, () => checkStatements(statement.statements, scopes));
  }

  if (statement.kind === "if") {
    const condition = checkExpression(statement.condition, scopes);
    if (!condition.ok) {
      return condition;
    }
    const then = withScope(scopes, () => checkStatements(statement.then, scopes));
    if (!then.ok) {
      return then;
    }
    if (statement.else) {
      const elseBranch = statement.else;
      return withScope(scopes, () => checkStatements(elseBranch, scopes));
    }
    return ok(null);
  }

  // while
  const condition = checkExpression(statement.condition, scopes);
  if (!condition.ok) {
    return condition;
  }
  return withScope(scopes, () => checkStatements(statement.body, scopes));
}

/**
 * Statically type-check a parsed program, walking every code path (including
 * branches that may never execute at runtime). Catches `TypeMismatch` and
 * `UnknownIdentifier` errors before evaluation.
 * @param program - The program from `parse`.
 * @returns `ok(null)` when the program is well-typed, or the first `EvalError`.
 */
export function typecheck(program: Program): Result<null, EvalError> {
  return checkStatements(program.statements, [new Map()]);
}
