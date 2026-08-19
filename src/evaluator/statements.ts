import type { Statement, StatementFor, StatementWhile, Value, ValueBlock } from "../core/ast.js";
import { err, type EvalError, type Result } from "../core/errors.js";
import { withScope } from "../core/scopes.js";
import { evalAssign } from "./evalAssignments.js";
import type { Outcome } from "./outcome.js";
import { typeToString } from "./types.js";
import { valueToNumber, valueToTyped, type ValueContext } from "./values.js";
import { isRange, type Scopes, type TypedValue } from "./typedValues.js";

// The value evaluator needs this to evaluate `{ ... }` block values; passing it
// explicitly (rather than registering it at load time) keeps the dependency
// visible. `evalBlockValue` is a hoisted function declaration, so this is safe.
const valueCtx: ValueContext = { evalBlock: evalBlockValue };

/** Evaluate a `while (condition) { ... }` loop, re-checking the condition each pass. */
function evalWhile(statement: StatementWhile, scopes: Scopes, ctx: ValueContext): Outcome {
  while (true) {
    const condition = valueToNumber(statement.condition, scopes, ctx);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    if (condition.value === 0) {
      break;
    }
    const body = withScope(scopes, () => evalStatements(statement.body, scopes, false, ctx));
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
function evalFor(statement: StatementFor, scopes: Scopes, ctx: ValueContext): Outcome {
  const range = valueToTyped(statement.range, scopes, ctx);
  if (!range.ok) {
    return { kind: "error", error: range.error };
  }
  // The typecheck pass guarantees `statement.range` is a `range<number>`; the
  // guard is a defensive fallback for a non-range value.
  if (!isRange(range.value)) {
    return {
      kind: "error",
      error: {
        kind: "TypeMismatch",
        name: "in",
        expected: "range<number>",
        actual: typeToString(range.value),
        position: statement.range.position,
      },
    };
  }
  for (let i = range.value.start; i < range.value.end; i++) {
    const body = withScope(scopes, () => {
      scopes[scopes.length - 1].set(statement.variable, {
        value: { kind: "number", value: i },
        mutable: true,
      });
      return evalStatements(statement.body, scopes, false, ctx);
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
function evalResultExpression(value: Value, scopes: Scopes, ctx: ValueContext): Outcome {
  const number = valueToNumber(value, scopes, ctx);
  if (!number.ok) {
    return { kind: "error", error: number.error };
  }
  return { kind: "value", value: number.value };
}

/** Evaluate a single statement within the current scope stack. */
function evalStatement(statement: Statement, scopes: Scopes, ctx: ValueContext): Outcome {
  if (statement.kind === "let") {
    const value = valueToTyped(statement.value, scopes, ctx);
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
    return evalAssign(statement, scopes, ctx);
  }

  if (statement.kind === "return") {
    return evalResultExpression(statement.value, scopes, ctx);
  }

  // A bare expression is the implicit program result (final top-level only).
  if (statement.kind === "expr") {
    return evalResultExpression(statement.value, scopes, ctx);
  }

  if (statement.kind === "block") {
    return withScope(scopes, () => evalStatements(statement.statements, scopes, false, ctx));
  }

  if (statement.kind === "if") {
    const condition = valueToNumber(statement.condition, scopes, ctx);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    const branch = condition.value !== 0 ? statement.then : (statement.else ?? []);
    return withScope(scopes, () => evalStatements(branch, scopes, false, ctx));
  }

  if (statement.kind === "break") {
    return { kind: "break" };
  }

  if (statement.kind === "continue") {
    return { kind: "continue" };
  }

  if (statement.kind === "for") {
    return evalFor(statement, scopes, ctx);
  }

  return evalWhile(statement, scopes, ctx);
}

/**
 * Evaluate a list of statements; a `return` short-circuits the rest. Only the
 * top level (`requireReturn`) must end in a `return`.
 */
export function evalStatements(
  statements: Statement[],
  scopes: Scopes,
  requireReturn: boolean,
  ctx: ValueContext = valueCtx,
): Outcome {
  for (const statement of statements) {
    const result = evalStatement(statement, scopes, ctx);
    if (result.kind !== "void") {
      return result;
    }
  }
  return requireReturn ? { kind: "error", error: { kind: "MissingReturn" } } : { kind: "void" };
}

/**
 * Evaluate a `{ ... }` block value: run its statements in a fresh scope, and
 * take the final bare expression's value (its type is preserved, so a block
 * can yield a non-number). The parser guarantees the last statement is an
 * `expr`; the fallback is defensive.
 */
function evalBlockValue(value: ValueBlock, scopes: Scopes): Result<TypedValue, EvalError> {
  return withScope(scopes, () => {
    const last = value.statements[value.statements.length - 1];
    if (!last || last.kind !== "expr") {
      return err({ kind: "UnknownIdentifier", name: "", position: value.position });
    }
    for (const statement of value.statements.slice(0, -1)) {
      const result = evalStatement(statement, scopes, valueCtx);
      if (result.kind === "error") {
        return err(result.error);
      }
      if (result.kind !== "void") {
        return err({ kind: "MissingReturn" });
      }
    }
    return valueToTyped(last.value, scopes, valueCtx);
  });
}
