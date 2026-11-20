import { TuffErrorKind, type TuffError } from "./errors.ts";
import type { Span } from "./span.ts";
import { err, ok, type Result } from "./result.ts";

/** A lexeme and where it sits in the source. */
export interface Token {
  text: string;
  span: Span;
}

/**
 * Splits Tuff source into tokens. Whitespace is skipped.
 *
 * @param source - The Tuff source to split.
 * @returns The tokens, or an `UnexpectedCharacter` error at the first character that starts no token.
 */
export function tokenize(source: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  const pattern = /\s*(\d+|[A-Za-z]+|[-+*/(){}=;])/y;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (match === null) {
      const rest = source.slice(index);
      const start = index + (rest.length - rest.trimStart().length);
      if (start >= source.length) break;
      return err({ kind: TuffErrorKind.UnexpectedCharacter, span: { start, end: start + 1 } });
    }
    const text = match[1] ?? "";
    const end = pattern.lastIndex;
    tokens.push({ text, span: { start: end - text.length, end } });
    index = end;
  }
  return ok(tokens);
}
