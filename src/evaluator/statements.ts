import type { Statement, StatementFor, StatementWhile, Value } from "../core/ast.js";
import { withScope } from "../core/scopes.js";
import { evalAssign } from "./evalAssignments.js";
import type { Outcome } from "./outcome.js";
import { valueToNumber, valueToTyped, type Scopes, type TypedValueRange } from "./values.js";

/** Evaluate a `while (condition) { ... }` loop, re-checking the condition each pass. */
function evalWhile(statement: StatementWhile, scopes: Scopes): Outcome {
  while (true) {
    const condition = valueToNumber(statement.condition, scopes);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    if (condition.value === 0) {
      break;
    }
    const body = withScope(scopes, () => evalStatements(statement.body, scopes, false));
    if (body.kind === "break") {
      break;
    }
    if (body.kind === "continue") {
      continue;
    }
    if (body.kind !== "void") {
      return body;
    }
  }
  return { kind: "void" };
}

/**
 * Evaluate a `for (i in start..end) { ... }` loop over a numeric range, exclusive
 * of `end`. The loop variable is a fresh mutable number each iteration.
 */
function evalFor(statement: StatementFor, scopes: Scopes): Outcome {
  const range = valueToTyped(statement.range, scopes);
  if (!range.ok) {
    return { kind: "error", error: range.error };
  }
  // The typecheck pass guarantees `statement.range` is a `range<number>`.
  const bounds = range.value as TypedValueRange;
  for (let i = bounds.start; i < bounds.end; i++) {
    const body = withScope(scopes, () => {
      scopes[scopes.length - 1].set(statement.variable, {
        value: { kind: "number", value: i },
        mutable: true,
      });
      return evalStatements(statement.body, scopes, false);
    });
    if (body.kind === "break") {
      break;
    }
    if (body.kind === "continue") {
      continue;
    }
    if (body.kind !== "void") {
      return body;
    }
  }
  return { kind: "void" };
}

/**
 * Evaluate a `return` value or a bare final expression: both yield the
 * program's numeric result.
 */
function evalResultExpression(value: Value, scopes: Scopes): Outcome {
  const number = valueToNumber(value, scopes);
  if (!number.ok) {
    return { kind: "error", error: number.error };
  }
  return { kind: "value", value: number.value };
}

/** Evaluate a single statement within the current scope stack. */
function evalStatement(statement: Statement, scopes: Scopes): Outcome {
  if (statement.kind === "let") {
    const value = valueToTyped(statement.value, scopes);
    if (!value.ok) {
      return { kind: "error", error: value.error };
    }
    scopes[scopes.length - 1].set(statement.name, {
      value: value.value,
      mutable: statement.mutable,
    });
    return { kind: "void" };
  }

  if (statement.kind === "assign") {
    return evalAssign(statement, scopes);
  }

  if (statement.kind === "return") {
    return evalResultExpression(statement.value, scopes);
  }

  // A bare expression is the implicit program result (final top-level only).
  if (statement.kind === "expr") {
    return evalResultExpression(statement.value, scopes);
  }

  if (statement.kind === "block") {
    return withScope(scopes, () => evalStatements(statement.statements, scopes, false));
  }

  if (statement.kind === "if") {
    const condition = valueToNumber(statement.condition, scopes);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    const branch = condition.value !== 0 ? statement.then : (statement.else ?? []);
    return withScope(scopes, () => evalStatements(branch, scopes, false));
  }

  if (statement.kind === "break") {
    return { kind: "break" };
  }

  if (statement.kind === "continue") {
    return { kind: "continue" };
  }

  if (statement.kind === "for") {
    return evalFor(statement, scopes);
  }

  return evalWhile(statement, scopes);
}

/**
 * Evaluate a list of statements; a `return` short-circuits the rest. Only the
 * top level (`requireReturn`) must end in a `return`.
 */
export function evalStatements(
  statements: Statement[],
  scopes: Scopes,
  requireReturn: boolean,
): Outcome {
  for (const statement of statements) {
    const result = evalStatement(statement, scopes);
    if (result.kind !== "void") {
      return result;
    }
  }
  return requireReturn ? { kind: "error", error: { kind: "MissingReturn" } } : { kind: "void" };
}
