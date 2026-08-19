import { err, ok, type EvalError, type Result } from "./errors.js";

const NUMBER = "-?\\d+(?:\\.\\d+)?";
const IDENT = "[A-Za-z_$][\\w$]*";
const LET_RE = new RegExp(`^\\s*let\\s+(mut\\s+)?(${IDENT})\\s*=\\s*(${NUMBER})\\s*$`);
const ASSIGN_RE = new RegExp(`^\\s*(${IDENT})\\s*=\\s*(${NUMBER})\\s*$`);
const RETURN_RE = new RegExp(`^\\s*return\\s+(${NUMBER}|${IDENT})\\s*$`);

/**
 * Evaluate a program of `let`/`let mut` declarations, assignments, and `return` statements.
 * @param expression - The program to evaluate.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evaluate(expression: string): Result<number, EvalError> {
  const variables = new Map<string, { value: number; mutable: boolean }>();
  const statements = expression
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

  if (statements.length === 0) {
    return err({ kind: "EmptyProgram" });
  }

  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];

    const letMatch = LET_RE.exec(statement);
    if (letMatch) {
      variables.set(letMatch[2], {
        value: Number(letMatch[3]),
        mutable: letMatch[1] !== undefined,
      });
      continue;
    }

    const assignMatch = ASSIGN_RE.exec(statement);
    if (assignMatch) {
      const variable = variables.get(assignMatch[1]);
      if (!variable) {
        return err({ kind: "UnknownIdentifier", name: assignMatch[1], index });
      }
      if (!variable.mutable) {
        return err({ kind: "ImmutableAssignment", name: assignMatch[1], index });
      }
      variable.value = Number(assignMatch[2]);
      continue;
    }

    const returnMatch = RETURN_RE.exec(statement);
    if (returnMatch) {
      const value = returnMatch[1];
      const variable = variables.get(value);
      if (variable) {
        return ok(variable.value);
      }
      if (/^[A-Za-z_$]/.test(value)) {
        return err({ kind: "UnknownIdentifier", name: value, index });
      }
      return ok(Number(value));
    }

    return err({ kind: "UnexpectedStatement", statement, index });
  }

  return err({ kind: "MissingReturn" });
}
