import type { Statement } from "../ast.js";
import type { EvalError } from "../errors.js";
import { lookup, valueToNumber, valueToTyped, type Scopes } from "./values.js";

/**
 * The outcome of evaluating a statement or statement list. `value` means a
 * `return` short-circuited; `void` means it completed normally; `error` means
 * evaluation failed.
 */
export type Outcome =
  { kind: "value"; value: number } | { kind: "void" } | { kind: "error"; error: EvalError };

/**
 * Evaluate an `ident = value` or `ident += value` assignment. Type correctness
 * is guaranteed by the static `typecheck` pass, so this only resolves values.
 * `+=` is numeric addition.
 */
function evalAssign(statement: Extract<Statement, { kind: "assign" }>, scopes: Scopes): Outcome {
  const variable = lookup(scopes, statement.name);
  if (!variable) {
    return {
      kind: "error",
      error: { kind: "UnknownIdentifier", name: statement.name, position: statement.position },
    };
  }
  if (!variable.mutable) {
    return {
      kind: "error",
      error: { kind: "ImmutableAssignment", name: statement.name, position: statement.position },
    };
  }
  const value = valueToTyped(statement.value, scopes);
  if (!value.ok) {
    return { kind: "error", error: value.error };
  }
  if (statement.compound) {
    const base = variable.value.type === "number" ? variable.value.value : 0;
    const addend = value.value.type === "number" ? value.value.value : 0;
    variable.value = { type: "number", value: base + addend };
    return { kind: "void" };
  }
  variable.value = value.value;
  return { kind: "void" };
}

/** Evaluate a `while (condition) { ... }` loop, re-checking the condition each pass. */
function evalWhile(statement: Extract<Statement, { kind: "while" }>, scopes: Scopes): Outcome {
  while (true) {
    const condition = valueToNumber(statement.condition, scopes);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    if (condition.value === 0) {
      break;
    }
    scopes.push(new Map());
    const body = evalStatements(statement.body, scopes, false);
    scopes.pop();
    if (body.kind !== "void") {
      return body;
    }
  }
  return { kind: "void" };
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
    const value = valueToNumber(statement.value, scopes);
    if (!value.ok) {
      return { kind: "error", error: value.error };
    }
    return { kind: "value", value: value.value };
  }

  if (statement.kind === "block") {
    scopes.push(new Map());
    const result = evalStatements(statement.statements, scopes, false);
    scopes.pop();
    return result;
  }

  if (statement.kind === "if") {
    const condition = valueToNumber(statement.condition, scopes);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    const branch = condition.value !== 0 ? statement.then : (statement.else ?? []);
    scopes.push(new Map());
    const result = evalStatements(branch, scopes, false);
    scopes.pop();
    return result;
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
