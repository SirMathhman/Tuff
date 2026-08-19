import type { Program } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";
import { evalStatements } from "./statements.js";

/**
 * Evaluate a parsed program.
 * @param program - The program from `parse`.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evalProgram(program: Program): Result<number, EvalError> {
  const outcome = evalStatements(program.statements, [new Map()], true);
  if (outcome.kind === "value") {
    return ok(outcome.value);
  }
  if (outcome.kind === "error") {
    return err(outcome.error);
  }
  return err({ kind: "MissingReturn" });
}
