import { err, ok, type EvalError, type Result } from "./errors.js";

const NUMBER = "-?\\d+(?:\\.\\d+)?";
const LET_RE = new RegExp(`^\\s*let\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(${NUMBER})\\s*$`);
const RETURN_RE = new RegExp(`^\\s*return\\s+(${NUMBER}|[A-Za-z_$][\\w$]*)\\s*$`);

/**
 * Evaluate a program of `let` and `return` statements.
 * @param expression - The program to evaluate.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evaluate(expression: string): Result<number, EvalError> {
  const variables = new Map<string, number>();
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
      variables.set(letMatch[1], Number(letMatch[2]));
      continue;
    }

    const returnMatch = RETURN_RE.exec(statement);
    if (returnMatch) {
      const value = returnMatch[1];
      if (variables.has(value)) {
        return ok(variables.get(value)!);
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
