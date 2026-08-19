import type {
  Program,
  Statement,
  StatementBreak,
  StatementContinue,
  StatementFor,
  StatementIf,
  StatementWhile,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { withScope } from "../core/scopes.js";
import { checkAssign } from "./checkAssignments.js";
import {
  checkExpression,
  checkNumericCoercible,
  registerBlockChecker,
} from "./checkExpressions.js";
import { expressionType, typeToString, type DeclScopes } from "./types.js";

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
 * Check a `for (i in range)` loop: the range must be a numeric range (a
 * `start..end` expression or a variable of range type), and the body is
 * checked in a loop scope where the variable is a mutable number.
 */
function checkFor(statement: StatementFor, scopes: DeclScopes): Result<null, EvalError> {
  const range = checkExpression(statement.range, scopes);
  if (!range.ok) {
    return range;
  }
  const rangeType = expressionType(statement.range, scopes);
  if (rangeType.kind !== "range" || rangeType.element.kind !== "number") {
    return err({
      kind: "TypeMismatch",
      name: "in",
      expected: "range<number>",
      actual: typeToString(rangeType),
      position: statement.range.position,
    });
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

/** Check an `if` statement: the condition is numeric-coercible and both branches are checked. */
function checkIf(
  statement: StatementIf,
  scopes: DeclScopes,
  inLoop: boolean,
): Result<null, EvalError> {
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

  // A bare expression is a value; its numeric-coercibility is enforced only
  // when it is the top-level program result (see `typecheck`).
  if (statement.kind === "expr") {
    return checkExpression(statement.value, scopes);
  }

  if (statement.kind === "block") {
    return withScope(scopes, () => checkStatements(statement.statements, scopes, inLoop));
  }

  if (statement.kind === "if") {
    return checkIf(statement, scopes, inLoop);
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
  const scopes: DeclScopes = [new Map()];
  const result = checkStatements(program.statements, scopes, false);
  if (!result.ok) {
    return result;
  }
  // The top-level final bare expression is the implicit program result, so it
  // must coerce to a number just like a `return` value.
  const last = program.statements[program.statements.length - 1];
  if (last && last.kind === "expr") {
    return checkNumericCoercible(last.value, scopes, "return");
  }
  return ok(null);
}

// The expression checker needs this to check `{ ... }` block values; registering
// it here (rather than importing it there) keeps the module graph acyclic.
registerBlockChecker((statements, scopes) =>
  withScope(scopes, () => checkStatements(statements, scopes, false)),
);
