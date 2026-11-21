import { peekName, type Problem } from "../lexing";
import { err, ok, type Result } from "../result";
import { lookup } from "../scope";
import { type Cursor, type NamedVariable } from "../types";

/**
 * The entry points of the grammar that a fragment re-enters. Expressions contain blocks, and blocks contain
 * statements, which contain expressions. To keep the files of this directory free of import cycles, the
 * expression fragments take the statement entry points from this record, which index.ts builds once.
 */
export interface Grammar {
  /**
   * Parses the statements at the cursor, stopping at the first position where no statement starts.
   */
  statements(text: string, cursor: Cursor): Problem | undefined;
  /**
   * Parses a block used as a statement, in a new scope.
   */
  statementBlock(text: string, cursor: Cursor): Problem | undefined;
}

/**
 * Maximum number of times a loop may run. A loop that would run longer is reported as an
 * error rather than hanging.
 */
export const MAX_LOOP_ITERATIONS = 10000;

/**
 * Runs a parse with "break" allowed or disallowed, restoring the previous setting afterwards.
 *
 * @param cursor - The parse state, whose breakable flag is changed for the duration.
 * @param breakable - Whether "break" is allowed inside the parse.
 * @param parse - The parse to run.
 * @returns The result of the parse.
 */
export function inBreakContext<T>(cursor: Cursor, breakable: boolean, parse: () => T): T {
  const outerBreakable = cursor.breakable;
  cursor.breakable = breakable;
  const result = parse();
  cursor.breakable = outerBreakable;
  return result;
}

/**
 * Reads the variable name at the cursor and finds it in scope.
 *
 * @param text - The source being parsed.
 * @param cursor - The read position, advanced past the variable name.
 * @returns An Ok result with the variable, or an Err result with the first problem found.
 */
export function findVariable(text: string, cursor: Cursor): Result<NamedVariable, Problem> {
  const name = peekName(text, cursor);
  const start = cursor.pos;
  cursor.pos += name.length;
  const binding = lookup(cursor.scope, name);
  if (binding === undefined) {
    return err({ offset: start, expected: `a variable in scope (no "${name}" is defined)` });
  }
  return ok({ name, start, binding });
}
