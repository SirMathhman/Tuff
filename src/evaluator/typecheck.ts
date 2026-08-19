import type { Program, Statement, Value } from "../ast.js";
import { err, ok, type EvalError, type Result, type TypeName } from "../errors.js";
import { lookup, withScope, type ScopeStack } from "../scopes.js";

/** A variable's declared type and mutability, tracked across scopes. */
type Decl = { type: TypeName; mutable: boolean };

/** A stack of variable declarations, innermost last. */
type DeclScopes = ScopeStack<Decl>;

/**
 * The static type of a value expression. Literals carry their own type;
 * identifiers take the type of their declaration; every binary operator
 * (`==`, `!=`, `<`, `<=`, `>`, `>=`) yields a number; `&name` yields a
 * pointer to the variable's type; `*ptr` yields the pointed-to type.
 */
function expressionType(value: Value, scopes: DeclScopes): TypeName {
  if (value.kind === "number") {
    return "number";
  }
  if (value.kind === "bool") {
    return "bool";
  }
  if (value.kind === "binary") {
    return "number";
  }
  if (value.kind === "addressOf") {
    return `ptr<${expressionType(value.target, scopes)}>` as TypeName;
  }
  if (value.kind === "deref") {
    const target = expressionType(value.target, scopes);
    return target.startsWith("ptr<") ? (target.slice(4, -1) as TypeName) : target;
  }
  return lookup(scopes, value.name)?.type ?? "number";
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
    const left = checkExpression(value.left, scopes);
    if (!left.ok) {
      return left;
    }
    return checkExpression(value.right, scopes);
  }
  if (value.kind === "addressOf") {
    if (value.target.kind !== "ident") {
      return err({
        kind: "TypeMismatch",
        name: "&",
        expected: "number",
        actual: expressionType(value.target, scopes),
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
    if (!targetType.startsWith("ptr<")) {
      return err({
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: targetType,
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

/** Check an `ident = value` or `ident += value` assignment statement. */
function checkAssign(
  statement: Extract<Statement, { kind: "assign" }>,
  scopes: DeclScopes,
): Result<null, EvalError> {
  const decl = lookup(scopes, statement.name);
  if (!decl) {
    return err({
      kind: "UnknownIdentifier",
      name: statement.name,
      position: statement.position,
    });
  }
  const value = checkExpression(statement.value, scopes);
  if (!value.ok) {
    return value;
  }
  const actual = expressionType(statement.value, scopes);
  if (statement.compound) {
    // `+=` is numeric addition: both the variable and the value must be numbers.
    const mismatch = decl.type !== "number" ? decl.type : actual;
    if (mismatch !== "number") {
      return err({
        kind: "TypeMismatch",
        name: statement.name,
        expected: "number",
        actual: mismatch,
        position: statement.position,
      });
    }
    return ok(null);
  }
  if (actual !== decl.type) {
    return err({
      kind: "TypeMismatch",
      name: statement.name,
      expected: decl.type,
      actual,
      position: statement.position,
    });
  }
  return ok(null);
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
