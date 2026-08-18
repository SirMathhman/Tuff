/**
 * A single lexical token produced by {@link tokenize}.
 */
export type Token =
  | { kind: "number"; value: string; offset: number }
  | { kind: "plus"; offset: number }
  | { kind: "minus"; offset: number }
  | { kind: "invalid"; value: string; offset: number };

/**
 * Splits source text into tokens, skipping whitespace.
 *
 * @param source - The source text to tokenize.
 * @returns The list of tokens, each carrying its true source offset.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "+") {
      tokens.push({ kind: "plus", offset: i });
      i += 1;
      continue;
    }
    if (ch === "-") {
      tokens.push({ kind: "minus", offset: i });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const start = i;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        i += 1;
      }
      tokens.push({ kind: "number", value: source.slice(start, i), offset: start });
      continue;
    }
    tokens.push({ kind: "invalid", value: ch, offset: i });
    i += 1;
  }
  return tokens;
}
