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

/** Convert a value expression to a number, or an error for undeclared identifiers. */
function valueToNumber(value: Value, scopes: Scopes): Result<number, EvalError> {
  if (value.kind === "number") {
    return ok(value.value);
  }
  if (value.kind === "bool") {
    return ok(value.value ? 1 : 0);
  }
  if (value.kind === "binary") {
    const left = valueToNumber(value.left, scopes);
    if (!left.ok) {
      return left;
    }
    const right = valueToNumber(value.right, scopes);
    if (!right.ok) {
      return right;
    }
    return ok(left.value === right.value ? 1 : 0);
  }
  const variable = lookup(scopes, value.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
  }
  return ok(variable.value);
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
