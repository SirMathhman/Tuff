import { err, type EvalError, type Result } from "../errors.js";
import type { Token } from "../lexer.js";

/**
 * A cursor over the token stream. The parser advances it with `advance` and
 * inspects it with `peek`/`atEnd` — it never matches statements by fixed
 * token offsets or range-length arithmetic.
 */
export interface Cursor {
  tokens: Token[];
  source: string;
  pos: number;
  /** Source offset where the current statement began (for error text). */
  statementStart: number;
}

export function peek(cursor: Cursor): Token | undefined {
  return cursor.tokens[cursor.pos];
}

export function advance(cursor: Cursor): void {
  cursor.pos++;
}

export function atEnd(cursor: Cursor): boolean {
  return cursor.pos >= cursor.tokens.length;
}

/**
 * The source text of the statement the cursor is currently parsing: from the
 * statement's first token up to the current cursor position.
 */
function statementText(cursor: Cursor): string {
  const end = atEnd(cursor) ? cursor.source.length : peek(cursor)!.position;
  return cursor.source.slice(cursor.statementStart, end).trim();
}

export function unexpected(cursor: Cursor): Result<never, EvalError> {
  return err({
    kind: "UnexpectedStatement",
    statement: statementText(cursor),
    position: cursor.statementStart,
  });
}
