import type { Program } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import type { Token } from "../core/lexer.js";
import { type Cursor } from "./cursor.js";
import { parseBlockValue, parseStatements } from "./statements.js";

/**
 * Parse a token stream into a program using a cursor-based recursive descent
 * approach.
 * @param tokens - The token list from `tokenize`.
 * @param source - The original source text (used for error messages).
 * @returns A `Result` carrying the program, or a structured `EvalError`.
 */
export function parse(tokens: Token[], source: string): Result<Program, EvalError> {
  const cursor: Cursor = { tokens, source, pos: 0, statementStart: 0 };
  const statements = parseStatements(cursor, false, true, parseBlockValue);
  if (!statements.ok) {
    return statements;
  }
  if (statements.value.length === 0) {
    return err({ kind: "EmptyProgram" });
  }
  return ok({ statements: statements.value });
}
