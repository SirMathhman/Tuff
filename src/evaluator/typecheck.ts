import type {
  Program,
  Statement,
  StatementBreak,
  StatementContinue,
  StatementFor,
  StatementIf,
  StatementLet,
  StatementReturn,
  StatementWhile,
  Value,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { withScope } from "../core/scopes.js";
import { checkAssign } from "./checkAssignments.js";
import { checkExpression } from "./checkExpressions.js";
import { checkBool, checkNumericCoercible, type BlockChecker } from "./checkPredicates.js";
import { typeToString, type DeclScopes, type Type } from "./types.js";

/**
 * Check a `{ ... }` block value's statements in a fresh scope. Passed to the
 * expression checker as an explicit dependency (which cannot import this
 * module without a cycle). Returns the block value's type (that of its final
 * bare expression).
 */
function checkBlock(statements: Statement[], scopes: DeclScopes): Result<Type, EvalError> {
  return withScope(scopes, () => checkStatements(statements, scopes, false, true, checkBlock));
}

/**
 * Check a list of statements, tracking declarations across nested scopes.
 * `inLoop` is true when the list is a `while` body, so a `break` is valid.
 * `inBlockValue` is true when the list is a `{ ... }` block value, so a
 * `return` is rejected (a block value yields its final bare expression).
 * Returns the type of the final statement when it is a bare expression, else
 * `number` (used as the block value's type).
 */
function checkStatements(
  statements: Statement[],
  scopes: DeclScopes,
  inLoop: boolean,
  inBlockValue: boolean,
  block: BlockChecker,
): Result<Type, EvalError> {
  let lastType: Type = { kind: "number" };
  for (const statement of statements) {
    const result = checkStatement(statement, scopes, inLoop, inBlockValue, block);
    if (!result.ok) {
      return result;
    }
    lastType = statement.kind === "expr" ? result.value : { kind: "number" };
  }
  return ok(lastType);
}

/** Check a `let` statement: the initializer is declared and well-typed. */
function checkLet(
  statement: StatementLet,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const initializer = checkExpression(statement.value, scopes, block);
  if (!initializer.ok) {
    return initializer;
  }
  const type = initializer.value;
  scopes[scopes.length - 1].set(statement.name, { type, mutable: statement.mutable });
  return ok({ kind: "number" });
}

/** Check a `return` statement: the value is declared and numeric-coercible. */
function checkReturn(
  statement: StatementReturn,
  scopes: DeclScopes,
  inBlockValue: boolean,
  block: BlockChecker,
): Result<Type, EvalError> {
  if (inBlockValue) {
    return err({ kind: "ReturnInBlockValue", position: statement.position });
  }
  const value = checkExpression(statement.value, scopes, block);
  if (!value.ok) {
    return value;
  }
  const coercible = checkNumericCoercible(value.value, "return", statement.value.position);
  if (!coercible.ok) {
    return coercible;
  }
  return ok({ kind: "number" });
}

/** Check a loop condition: it is a value of type `Bool`. */
function checkLoopCondition(
  condition: Value,
  scopes: DeclScopes,
  name: string,
  block: BlockChecker,
): Result<null, EvalError> {
  const checked = checkExpression(condition, scopes, block);
  if (!checked.ok) {
    return checked;
  }
  return checkBool(checked.value, name, condition.position);
}

/** Check a `while` loop: the condition is a value and the body is checked in a loop scope. */
function checkWhile(
  statement: StatementWhile,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const condition = checkLoopCondition(statement.condition, scopes, "while", block);
  if (!condition.ok) {
    return condition;
  }
  return withScope(scopes, () => checkStatements(statement.body, scopes, true, false, block));
}

/**
 * Check a `for (i in range)` loop: the range must be an integer range (a
 * `start..end` expression or a variable of range type over any integer type),
 * and the body is checked in a loop scope where the variable is a mutable
 * value of the range's element type.
 */
function checkFor(
  statement: StatementFor,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const range = checkExpression(statement.range, scopes, block);
  if (!range.ok) {
    return range;
  }
  const rangeType = range.value;
  if (rangeType.kind !== "range" || rangeType.element.kind !== "int") {
    return err({
      kind: "TypeMismatch",
      name: "in",
      expected: "range<integer>",
      actual: typeToString(rangeType),
      position: statement.range.position,
    });
  }
  const elementType = rangeType.element;
  return withScope(scopes, () => {
    scopes[scopes.length - 1].set(statement.variable, { type: elementType, mutable: true });
    return checkStatements(statement.body, scopes, true, false, block);
  });
}

/** Check a `break` or `continue` statement: it must be inside a loop body. */
function checkLoopControl(
  statement: StatementBreak | StatementContinue,
  inLoop: boolean,
): Result<Type, EvalError> {
  if (inLoop) {
    return ok({ kind: "number" });
  }
  return err({
    kind: statement.kind === "break" ? "BreakOutsideLoop" : "ContinueOutsideLoop",
    position: statement.position,
  });
}

/** Check an `if` statement: the condition is a `Bool` and both branches are checked. */
function checkIf(
  statement: StatementIf,
  scopes: DeclScopes,
  inLoop: boolean,
  inBlockValue: boolean,
  block: BlockChecker,
): Result<Type, EvalError> {
  const condition = checkLoopCondition(statement.condition, scopes, "if", block);
  if (!condition.ok) {
    return condition;
  }
  const then = withScope(scopes, () =>
    checkStatements(statement.then, scopes, inLoop, inBlockValue, block),
  );
  if (!then.ok) {
    return then;
  }
  if (statement.else) {
    const elseBranch = statement.else;
    return withScope(scopes, () =>
      checkStatements(elseBranch, scopes, inLoop, inBlockValue, block),
    );
  }
  return ok({ kind: "number" });
}

/**
 * Check a single statement, validating types and identifier declarations.
 * `inLoop` is true when the statement is inside a `while` body; `inBlockValue`
 * is true when it is inside a `{ ... }` block value, where `return` is
 * rejected.
 */
function checkStatement(
  statement: Statement,
  scopes: DeclScopes,
  inLoop: boolean,
  inBlockValue: boolean,
  block: BlockChecker,
): Result<Type, EvalError> {
  if (statement.kind === "let") {
    return checkLet(statement, scopes, block);
  }

  if (statement.kind === "assign") {
    const result = checkAssign(statement, scopes, block);
    if (!result.ok) {
      return result;
    }
    return ok({ kind: "number" });
  }

  if (statement.kind === "return") {
    return checkReturn(statement, scopes, inBlockValue, block);
  }

  // A bare expression is a value; its numeric-coercibility is enforced only
  // when it is the top-level program result (see `typecheck`).
  if (statement.kind === "expr") {
    return checkExpression(statement.value, scopes, block);
  }

  if (statement.kind === "block") {
    return withScope(scopes, () =>
      checkStatements(statement.statements, scopes, inLoop, inBlockValue, block),
    );
  }

  if (statement.kind === "if") {
    return checkIf(statement, scopes, inLoop, inBlockValue, block);
  }

  if (statement.kind === "while") {
    return checkWhile(statement, scopes, block);
  }

  if (statement.kind === "for") {
    return checkFor(statement, scopes, block);
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
  const result = checkStatements(program.statements, scopes, false, false, checkBlock);
  if (!result.ok) {
    return result;
  }
  // The top-level final bare expression is the implicit program result, so it
  // must coerce to a number just like a `return` value.
  const last = program.statements[program.statements.length - 1];
  if (last && last.kind === "expr") {
    const checked = checkExpression(last.value, scopes, checkBlock);
    if (!checked.ok) {
      return checked;
    }
    return checkNumericCoercible(checked.value, "return", last.value.position);
  }
  return ok(null);
}
