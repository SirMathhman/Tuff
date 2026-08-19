import type { Program, Statement, Value } from "./ast.js";
import { err, ok, type EvalError, type Result } from "./errors.js";

type Variable = { value: number; mutable: boolean };

/** A stack of variable scopes, innermost last. */
type Scopes = Map<string, Variable>[];

/** Find a variable by walking the scopes from innermost outward. */
function lookup(scopes: Scopes, name: string): Variable | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const variable = scopes[i].get(name);
    if (variable) {
      return variable;
    }
  }
  return undefined;
}

/** A value with its type, so `==` can compare type-strictly. */
type TypedValue = { type: "number"; value: number } | { type: "bool"; value: boolean };

/**
 * Evaluate a value expression to a typed value, or an error for undeclared
 * identifiers. `==` compares type-strictly: a bool and a number are never
 * equal. Variables are untyped numbers.
 */
function valueToTyped(value: Value, scopes: Scopes): Result<TypedValue, EvalError> {
  if (value.kind === "number") {
    return ok({ type: "number", value: value.value });
  }
  if (value.kind === "bool") {
    return ok({ type: "bool", value: value.value });
  }
  if (value.kind === "binary") {
    const left = valueToTyped(value.left, scopes);
    if (!left.ok) {
      return left;
    }
    const right = valueToTyped(value.right, scopes);
    if (!right.ok) {
      return right;
    }
    if (value.operator === "==") {
      const equal = left.value.type === right.value.type && left.value.value === right.value.value;
      return ok({ type: "number", value: equal ? 1 : 0 });
    }
    // "<" compares numerically; bools coerce to 1/0.
    const leftNum = left.value.type === "bool" ? (left.value.value ? 1 : 0) : left.value.value;
    const rightNum = right.value.type === "bool" ? (right.value.value ? 1 : 0) : right.value.value;
    return ok({ type: "number", value: leftNum < rightNum ? 1 : 0 });
  }
  const variable = lookup(scopes, value.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
  }
  return ok({ type: "number", value: variable.value });
}

/** Convert a value expression to a number, or an error for undeclared identifiers. */
function valueToNumber(value: Value, scopes: Scopes): Result<number, EvalError> {
  const typed = valueToTyped(value, scopes);
  if (!typed.ok) {
    return typed;
  }
  return ok(typed.value.type === "bool" ? (typed.value.value ? 1 : 0) : typed.value.value);
}

/** Evaluate a single statement within the current scope stack. */
function evalStatement(statement: Statement, scopes: Scopes): Result<number, EvalError> {
  if (statement.kind === "let") {
    const value = valueToNumber(statement.value, scopes);
    if (!value.ok) {
      return value;
    }
    scopes[scopes.length - 1].set(statement.name, {
      value: value.value,
      mutable: statement.mutable,
    });
    return ok(0);
  }

  if (statement.kind === "assign") {
    const variable = lookup(scopes, statement.name);
    if (!variable) {
      return err({ kind: "UnknownIdentifier", name: statement.name, position: statement.position });
    }
    if (!variable.mutable) {
      return err({
        kind: "ImmutableAssignment",
        name: statement.name,
        position: statement.position,
      });
    }
    const value = valueToNumber(statement.value, scopes);
    if (!value.ok) {
      return value;
    }
    variable.value = value.value;
    return ok(0);
  }

  if (statement.kind === "block") {
    scopes.push(new Map());
    const result = evalStatements(statement.statements, scopes, false);
    scopes.pop();
    return result;
  }

  const value = valueToNumber(statement.value, scopes);
  if (!value.ok) {
    return value;
  }
  return ok(value.value);
}

/**
 * Evaluate a list of statements; a `return` short-circuits the rest. Only the
 * top level (`requireReturn`) must end in a `return`.
 */
function evalStatements(
  statements: Statement[],
  scopes: Scopes,
  requireReturn: boolean,
): Result<number, EvalError> {
  for (const statement of statements) {
    const result = evalStatement(statement, scopes);
    if (!result.ok) {
      return result;
    }
    if (statement.kind === "return") {
      return result;
    }
  }
  return requireReturn ? err({ kind: "MissingReturn" }) : ok(0);
}

/**
 * Evaluate a parsed program.
 * @param program - The program from `parse`.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evalProgram(program: Program): Result<number, EvalError> {
  return evalStatements(program.statements, [new Map()], true);
}
