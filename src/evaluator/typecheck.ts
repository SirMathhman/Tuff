import type { Program, Statement, Value } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";
import { lookup, withScope, type ScopeStack } from "../scopes.js";

/**
 * A static type: a primitive, or a (possibly nested) pointer carrying a
 * mutability flag. Pointers are structured so `&mut` can be distinguished
 * from `&` when checking assignments through a dereference.
 */
type Type =
  { kind: "number" } | { kind: "bool" } | { kind: "ptr"; mutable: boolean; pointee: Type };

/** Render a type as its display name (e.g. `ptr<number>`), for error messages. */
function typeToString(type: Type): string {
  if (type.kind === "ptr") {
    return `ptr<${typeToString(type.pointee)}>`;
  }
  return type.kind;
}

/** Two types are equal when their display names match. */
function typesEqual(a: Type, b: Type): boolean {
  return typeToString(a) === typeToString(b);
}

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

/** A variable's declared type and mutability, tracked across scopes. */
interface Decl {
  type: Type;
  mutable: boolean;
}

/** A stack of variable declarations, innermost last. */
type DeclScopes = ScopeStack<Decl>;

/**
 * The static type of a value expression. Literals carry their own type;
 * identifiers take the type of their declaration; every binary operator
 * (`==`, `!=`, `<`, `<=`, `>`, `>=`) yields a number; `&name` yields a
 * pointer to the variable's type; `*ptr` yields the pointed-to type.
 */
function expressionType(value: Value, scopes: DeclScopes): Type {
  if (value.kind === "number") {
    return { kind: "number" };
  }
  if (value.kind === "bool") {
    return { kind: "bool" };
  }
  if (value.kind === "binary") {
    return { kind: "number" };
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

/** Check a binary operation's operands: identifiers declared, and no pointer operands to ordering operators. */
function checkBinary(
  value: Extract<Value, { kind: "binary" }>,
  scopes: DeclScopes,
): Result<null, EvalError> {
  const left = checkExpression(value.left, scopes);
  if (!left.ok) {
    return left;
  }
  const right = checkExpression(value.right, scopes);
  if (!right.ok) {
    return right;
  }
  if (value.operator !== "==" && value.operator !== "!=") {
    // Ordering operators compare numerically; pointers have no numeric value.
    for (const operand of [value.left, value.right]) {
      const type = expressionType(operand, scopes);
      if (type.kind === "ptr") {
        return err({
          kind: "TypeMismatch",
          name: value.operator,
          expected: "number",
          actual: typeToString(type),
          position: value.position,
        });
      }
    }
  }
  return ok(null);
}

/**
 * Check that every identifier in a value expression is declared in the current
 * scope stack. Returns an `UnknownIdentifier` error for the first undeclared
 * reference found.
 */
function checkExpression(value: Value, scopes: DeclScopes): Result<null, EvalError> {
  if (value.kind === "ident") {
    if (!lookup(scopes, value.name)) {
      return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
    }
    return ok(null);
  }
  if (value.kind === "binary") {
    return checkBinary(value, scopes);
  }
  if (value.kind === "addressOf") {
    if (value.target.kind !== "ident") {
      return err({
        kind: "TypeMismatch",
        name: "&",
        expected: "number",
        actual: typeToString(expressionType(value.target, scopes)),
        position: value.position,
      });
    }
    return checkExpression(value.target, scopes);
  }
  if (value.kind === "deref") {
    const target = checkExpression(value.target, scopes);
    if (!target.ok) {
      return target;
    }
    const targetType = expressionType(value.target, scopes);
    if (targetType.kind !== "ptr") {
      return err({
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: typeToString(targetType),
        position: value.position,
      });
    }
    return ok(null);
  }
  return ok(null);
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
