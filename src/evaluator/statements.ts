import type {
  Statement,
  StatementAssign,
  StatementWhile,
  Value,
  ValueDeref,
  ValueIndexAssign,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup, withScope } from "../core/scopes.js";
import { typeToString } from "./types.js";
import {
  isArray,
  isPointer,
  valueToNumber,
  valueToTyped,
  type Scopes,
  type TypedValue,
  type TypedValueArray,
  type Variable,
} from "./values.js";

/** A `return` short-circuited evaluation with its value. */
export interface OutcomeValue {
  kind: "value";
  value: number;
}

/** Evaluation completed normally. */
export interface OutcomeVoid {
  kind: "void";
}

/** Evaluation failed with a structured error. */
export interface OutcomeError {
  kind: "error";
  error: EvalError;
}

/** A `break` exited the enclosing `while` loop. */
export interface OutcomeBreak {
  kind: "break";
}

/** A `continue` skipped to the next iteration of the enclosing `while` loop. */
export interface OutcomeContinue {
  kind: "continue";
}

/**
 * The outcome of evaluating a statement or statement list. `value` means a
 * `return` short-circuited; `void` means it completed normally; `break` means
 * a `while` loop was exited; `continue` means the loop skipped to its next
 * iteration; `error` means evaluation failed.
 */
export type Outcome = OutcomeValue | OutcomeVoid | OutcomeBreak | OutcomeContinue | OutcomeError;

/**
 * Evaluate an assignment to an identifier or a dereference (`*ptr = value`).
 * Type correctness is guaranteed by the static `typecheck` pass, so this only
 * resolves values. `+=` is numeric addition.
 */
function evalAssign(statement: StatementAssign, scopes: Scopes): Outcome {
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
  if (target.kind === "indexAssign") {
    return evalIndexAssign(statement, target, value.value, scopes);
  }
  // The parser only produces ident, deref, or index targets; defensive fallback.
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
  statement: StatementAssign,
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
  statement: StatementAssign,
  target: ValueDeref,
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

/**
 * Evaluate `arr[i] = value` by writing the element into the (mutable) array.
 * The target is an identifier or a dereference (`*ptr`), which may nest.
 */
function evalIndexAssign(
  statement: StatementAssign,
  target: ValueIndexAssign,
  value: TypedValue,
  scopes: Scopes,
): Outcome {
  const array = resolveArrayTarget(target.target, scopes);
  if (!array.ok) {
    return { kind: "error", error: array.error };
  }
  const index = valueToNumber(target.index, scopes);
  if (!index.ok) {
    return { kind: "error", error: index.error };
  }
  const element = array.value.elements[index.value];
  if (element === undefined) {
    return {
      kind: "error",
      error: {
        kind: "TypeMismatch",
        name: "[",
        expected: "number",
        actual: "out-of-range",
        position: statement.position,
      },
    };
  }
  array.value.elements[index.value] = value;
  return { kind: "void" };
}

/** Resolve an index-assignment target (an ident or a deref chain) to its array value. */
function resolveArrayTarget(target: Value, scopes: Scopes): Result<TypedValueArray, EvalError> {
  if (target.kind === "ident") {
    const variable = lookup(scopes, target.name);
    if (!variable) {
      return err({ kind: "UnknownIdentifier", name: target.name, position: target.position });
    }
    // A mutable pointer to an array resolves to the array it points at
    // (matching `*ptr = value` semantics).
    const value =
      isPointer(variable.value) && variable.value.mutable
        ? variable.value.ref.value
        : variable.value;
    if (!isArray(value)) {
      return err({
        kind: "TypeMismatch",
        name: "[",
        expected: "array<number>",
        actual: typeToString(variable.value),
        position: target.position,
      });
    }
    return ok(value);
  }
  if (target.kind === "deref") {
    const pointer = valueToTyped(target.target, scopes);
    if (!pointer.ok) {
      return pointer;
    }
    if (!isPointer(pointer.value)) {
      return err({
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: typeToString(pointer.value),
        position: target.position,
      });
    }
    const pointee = pointer.value.ref.value;
    if (!isArray(pointee)) {
      return err({
        kind: "TypeMismatch",
        name: "[",
        expected: "array<number>",
        actual: typeToString(pointee),
        position: target.position,
      });
    }
    return ok(pointee);
  }
  // The parser only produces ident or deref targets; this is a defensive fallback.
  return err({ kind: "UnknownIdentifier", name: "", position: target.position });
}

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

  if (statement.kind === "break") {
    return { kind: "break" };
  }

  if (statement.kind === "continue") {
    return { kind: "continue" };
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
