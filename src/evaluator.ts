import type { Program, Value } from "./ast.js";
import { err, ok, type EvalError, type Result } from "./errors.js";

type Variable = { value: number; mutable: boolean };

/** Convert a value expression to a number, or an error for undeclared identifiers. */
function valueToNumber(
  value: Value,
  variables: Map<string, Variable>,
  index: number,
): Result<number, EvalError> {
  if (value.kind === "number") {
    return ok(value.value);
  }
  if (value.kind === "bool") {
    return ok(value.value ? 1 : 0);
  }
  const variable = variables.get(value.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.name, index });
  }
  return ok(variable.value);
}

/**
 * Evaluate a parsed program.
 * @param program - The program from `parse`.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evalProgram(program: Program): Result<number, EvalError> {
  const variables = new Map<string, Variable>();

  for (const statement of program.statements) {
    if (statement.kind === "let") {
      const value = valueToNumber(statement.value, variables, statement.index);
      if (!value.ok) {
        return value;
      }
      variables.set(statement.name, { value: value.value, mutable: statement.mutable });
      continue;
    }

    if (statement.kind === "assign") {
      const variable = variables.get(statement.name);
      if (!variable) {
        return err({ kind: "UnknownIdentifier", name: statement.name, index: statement.index });
      }
      if (!variable.mutable) {
        return err({ kind: "ImmutableAssignment", name: statement.name, index: statement.index });
      }
      const value = valueToNumber(statement.value, variables, statement.index);
      if (!value.ok) {
        return value;
      }
      variable.value = value.value;
      continue;
    }

    const value = valueToNumber(statement.value, variables, statement.index);
    if (!value.ok) {
      return value;
    }
    return ok(value.value);
  }

  return err({ kind: "MissingReturn" });
}
