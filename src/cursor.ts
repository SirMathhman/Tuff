import type { Token } from "./tokenizer.ts";

/**
 * A cursor over a list of tokens.
 */
export interface Cursor {
  /** The tokens. */
  tokens: Token[];
  /** The index of the current token. */
  index: number;
}

/**
 * Get the token at the cursor's current position.
 * @param {Cursor} cursor - The token cursor.
 * @returns {Token} The current token.
 */
export function peek(cursor: Cursor): Token {
  return cursor.tokens[cursor.index]!;
}

/**
 * Get the token a fixed number of positions ahead of the cursor.
 * @param {Cursor} cursor - The token cursor.
 * @param {number} offset - How many tokens ahead to look.
 * @returns {Token} The token at that offset, or the eof token past the end.
 */
export function peekAt(cursor: Cursor, offset: number): Token {
  const index = cursor.index + offset;
  if (index >= cursor.tokens.length) {
    return cursor.tokens[cursor.tokens.length - 1]!;
  }
  return cursor.tokens[index]!;
}

/**
 * Check whether the tokens after an opening brace start a block.
 * @param {Cursor} cursor - The token cursor, positioned after the brace.
 * @returns {boolean} True if a let-binding or assignment follows.
 */
export function isBlockStart(cursor: Cursor): boolean {
  const first = peek(cursor);
  if (first.type === "kw-let") {
    return true;
  }
  return first.type === "ident" && peekAt(cursor, 1).type === "assign";
}
