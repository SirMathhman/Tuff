import type { Statement, Value } from "../core/ast.js";
import type { EvalError } from "../core/errors.js";
import { lookup, withScope } from "../core/scopes.js";
import { typeToString } from "./types.js";
import {
  isPointer,
  valueToNumber,
  valueToTyped,
  type Scopes,
  type TypedValue,
  type Variable,
} from "./values.js";

/**
 * The outcome of evaluating a statement or statement list. `value` means a
 * `return` short-circuited; `void` means it completed normally; `error` means
 * evaluation failed.
 */
export type Outcome =
  { kind: "value"; value: number } | { kind: "void" } | { kind: "error"; error: EvalError };

/**
 * Evaluate an assignment to an identifier or a dereference (`*ptr = value`).
 * Type correctness is guaranteed by the static `typecheck` pass, so this only
 * resolves values. `+=` is numeric addition.
 */
function evalAssign(statement: Extract<Statement, { kind: "assign" }>, scopes: Scopes): Outcome {
  const target = statement.target;
  const value = valueToTyped(statement.value, scopes);
  if (!value.ok) {
    return { kind: "error", error: value.error };
  }
  if (target.kind === "ident") {
    return evalIdentAssign(statement, target.name, value.value, scopes);
  }
  if (target.kind === "deref") {
    return evalDerefAssign(statement, target, value.value, scopes);
  }
  // The parser only produces ident or deref targets; this is a defensive fallback.
  return {
    kind: "error",
    error: { kind: "UnknownIdentifier", name: "", position: statement.position },
  };
}

/**
 * Write a value to a variable: a plain assignment, or numeric addition when
 * `compound` (`+=`).
 */
function writeValue(variable: Variable, value: TypedValue, compound: boolean): void {
  if (compound) {
    const base = variable.value.kind === "number" ? variable.value.value : 0;
    const addend = value.kind === "number" ? value.value : 0;
    variable.value = { kind: "number", value: base + addend };
    return;
  }
  variable.value = value;
}

/** Evaluate `ident = value` or `ident += value` on a looked-up variable. */
function evalIdentAssign(
  statement: Extract<Statement, { kind: "assign" }>,
  name: string,
  value: TypedValue,
  scopes: Scopes,
): Outcome {
  const variable = lookup(scopes, name);
  if (!variable) {
    return {
      kind: "error",
      error: { kind: "UnknownIdentifier", name, position: statement.position },
    };
  }
  if (!variable.mutable) {
    return {
      kind: "error",
      error: { kind: "ImmutableAssignment", name, position: statement.position },
    };
  }
  writeValue(variable, value, statement.compound === "+=");
  return { kind: "void" };
}

/** Evaluate `*ptr = value` by writing through the (mutable) pointer. */
function evalDerefAssign(
  statement: Extract<Statement, { kind: "assign" }>,
  target: Extract<Value, { kind: "deref" }>,
  value: TypedValue,
  scopes: Scopes,
): Outcome {
  const pointer = valueToTyped(target.target, scopes);
  if (!pointer.ok) {
    return { kind: "error", error: pointer.error };
  }
  if (!isPointer(pointer.value)) {
    return {
      kind: "error",
      error: {
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: typeToString(pointer.value),
        position: statement.position,
      },
    };
  }
  writeValue(pointer.value.ref, value, statement.compound === "+=");
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
    const body = withScope(scopes, () => evalStatements(statement.body, scopes, false));
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
