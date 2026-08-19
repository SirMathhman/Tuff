import type { Program, Statement, Value } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";

/** A variable's declared type and mutability, tracked across scopes. */
type Decl = { type: "number" | "bool"; mutable: boolean };

/** A stack of variable declarations, innermost last. */
type DeclScopes = Map<string, Decl>[];

/** Find a declaration by walking the scopes from innermost outward. */
function lookupDecl(scopes: DeclScopes, name: string): Decl | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const decl = scopes[i].get(name);
    if (decl) {
      return decl;
    }
  }
  return undefined;
}

/**
 * The static type of a value expression. Literals carry their own type;
 * identifiers take the type of their declaration; every binary operator
 * (`==`, `!=`, `<`, `<=`, `>`, `>=`) yields a number.
 */
function expressionType(value: Value, scopes: DeclScopes): "number" | "bool" {
  if (value.kind === "number") {
    return "number";
  }
  if (value.kind === "bool") {
    return "bool";
  }
  if (value.kind === "binary") {
    return "number";
  }
  return lookupDecl(scopes, value.name)?.type ?? "number";
}

/**
 * Check that every identifier in a value expression is declared in the current
 * scope stack. Returns an `UnknownIdentifier` error for the first undeclared
 * reference found.
 */
function checkExpression(value: Value, scopes: DeclScopes): Result<null, EvalError> {
  if (value.kind === "ident") {
    if (!lookupDecl(scopes, value.name)) {
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
    const decl = lookupDecl(scopes, statement.name);
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

  if (statement.kind === "return") {
    return checkExpression(statement.value, scopes);
  }

  if (statement.kind === "block") {
    scopes.push(new Map());
    const result = checkStatements(statement.statements, scopes);
    scopes.pop();
    return result;
  }

  if (statement.kind === "if") {
    const condition = checkExpression(statement.condition, scopes);
    if (!condition.ok) {
      return condition;
    }
    scopes.push(new Map());
    const then = checkStatements(statement.then, scopes);
    scopes.pop();
    if (!then.ok) {
      return then;
    }
    if (statement.else) {
      scopes.push(new Map());
      const elseBranch = checkStatements(statement.else, scopes);
      scopes.pop();
      return elseBranch;
    }
    return ok(null);
  }

  // while
  const condition = checkExpression(statement.condition, scopes);
  if (!condition.ok) {
    return condition;
  }
  scopes.push(new Map());
  const body = checkStatements(statement.body, scopes);
  scopes.pop();
  return body;
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
