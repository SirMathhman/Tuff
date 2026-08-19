import { err, ok, type EvalError, type Result } from "./errors.js";

const NUMBER = "-?\\d+(?:\\.\\d+)?";
const IDENT = "[A-Za-z_$][\\w$]*";
const VALUE = `(?:true|false|${NUMBER})`;
const LET_RE = new RegExp(`^\\s*let\\s+(mut\\s+)?(${IDENT})\\s*=\\s*(${VALUE})\\s*$`);
const ASSIGN_RE = new RegExp(`^\\s*(${IDENT})\\s*=\\s*(${VALUE})\\s*$`);
const RETURN_RE = new RegExp(`^\\s*return\\s+(${VALUE}|${IDENT})\\s*$`);

/** Convert a literal value token (`true`, `false`, or a number) to a number. */
function toNumber(value: string): number {
  if (value === "true") {
    return 1;
  }
  if (value === "false") {
    return 0;
  }
  return Number(value);
}

/**
 * Split a program into statements, flattening the contents of `{ ... }` blocks.
 * Unbalanced braces are left in place so they fail statement classification.
 */
function extractStatements(source: string): string[] {
  const statements: string[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "{") {
      let depth = 1;
      let end = i + 1;
      while (end < source.length && depth > 0) {
        if (source[end] === "{") {
          depth++;
        } else if (source[end] === "}") {
          depth--;
        }
        end++;
      }
      if (depth !== 0) {
        statements.push(source.slice(i));
        break;
      }
      statements.push(...extractStatements(source.slice(i + 1, end - 1)));
      i = end;
      continue;
    }
    if (char === "}") {
      statements.push(source.slice(i));
      break;
    }
    const semi = source.indexOf(";", i);
    const end = semi === -1 ? source.length : semi;
    statements.push(source.slice(i, end));
    i = end + 1;
  }
  return statements.map((statement) => statement.trim()).filter((statement) => statement !== "");
}

/**
 * Evaluate a program of `let`/`let mut` declarations, assignments, `return` statements,
 * and `{ ... }` blocks.
 * @param expression - The program to evaluate.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evaluate(expression: string): Result<number, EvalError> {
  const variables = new Map<string, { value: number; mutable: boolean }>();
  const statements = extractStatements(expression);

  if (statements.length === 0) {
    return err({ kind: "EmptyProgram" });
  }

  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];

    const letMatch = LET_RE.exec(statement);
    if (letMatch) {
      variables.set(letMatch[2], {
        value: toNumber(letMatch[3]),
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
      variable.value = toNumber(assignMatch[2]);
      continue;
    }

    const returnMatch = RETURN_RE.exec(statement);
    if (returnMatch) {
      const value = returnMatch[1];
      if (value === "true" || value === "false") {
        return ok(toNumber(value));
      }
      const variable = variables.get(value);
      if (variable) {
        return ok(variable.value);
      }
      if (/^[A-Za-z_$]/.test(value)) {
        return err({ kind: "UnknownIdentifier", name: value, index });
      }
      return ok(toNumber(value));
    }

    return err({ kind: "UnexpectedStatement", statement, index });
  }

  return err({ kind: "MissingReturn" });
}
