/** A numeric literal token. */
export interface NumberToken {
  kind: "Number";
  value: number;
}

/** A boolean literal token. */
export interface BoolToken {
  kind: "Bool";
  value: number;
}

/** An identifier token. */
export interface IdentToken {
  kind: "Ident";
  name: string;
}

/** A `||` operator token. */
export interface OrToken {
  kind: "Or";
}

/** A `&&` operator token. */
export interface AndToken {
  kind: "And";
}

/** A `+` operator token. */
export interface PlusToken {
  kind: "Plus";
}

/** A `==` operator token. */
export interface EqualToken {
  kind: "Equal";
}

/** An opening parenthesis token. */
export interface LParenToken {
  kind: "LParen";
}

/** A closing parenthesis token. */
export interface RParenToken {
  kind: "RParen";
}

/** A token produced by the tuff expression tokenizer. */
export type TuffToken =
  | NumberToken
  | BoolToken
  | IdentToken
  | OrToken
  | AndToken
  | PlusToken
  | EqualToken
  | LParenToken
  | RParenToken;

/** A single token plus the index just past it. */
interface ReadToken {
  token: TuffToken;
  next: number;
}

/**
 * Read one token starting at an index, skipping leading whitespace.
 * @param text {string} - The expression text.
 * @param i {number} - The index to read from.
 * @returns {ReadToken | null} The token and the index just past it, or null if only whitespace remains.
 * @throws {Error} If the text contains an unrecognized character.
 */
function readToken(text: string, i: number): ReadToken | null {
  let j = i;
  while (j < text.length && /\s/.test(text[j] ?? "")) j++;
  if (j >= text.length) return null;
  const ch = text[j] ?? "";
  if (ch === "(") return { token: { kind: "LParen" }, next: j + 1 };
  if (ch === ")") return { token: { kind: "RParen" }, next: j + 1 };
  if (text.startsWith("||", j)) return { token: { kind: "Or" }, next: j + 2 };
  if (text.startsWith("&&", j)) return { token: { kind: "And" }, next: j + 2 };
  if (ch === "+") return { token: { kind: "Plus" }, next: j + 1 };
  if (text.startsWith("==", j))
    return { token: { kind: "Equal" }, next: j + 2 };
  const rest = text.slice(j);
  const num = rest.match(/^-?\d+(\.\d+)?/);
  if (num) {
    return {
      token: { kind: "Number", value: Number(num[0]) },
      next: j + num[0].length,
    };
  }
  if (/^true\b/.test(rest))
    return { token: { kind: "Bool", value: 1 }, next: j + 4 };
  if (/^false\b/.test(rest))
    return { token: { kind: "Bool", value: 0 }, next: j + 5 };
  const ident = rest.match(/^\w+/);
  if (ident) {
    return {
      token: { kind: "Ident", name: ident[0] },
      next: j + ident[0].length,
    };
  }
  throw new Error(
    `Unexpected character ${JSON.stringify(ch)} in ${JSON.stringify(text)}`,
  );
}

/**
 * Tokenize an expression string into a flat list of tokens.
 * @param text {string} - The expression text.
 * @returns {TuffToken[]} The tokens in source order.
 * @throws {Error} If the text contains an unrecognized character.
 */
export function tokenize(text: string): TuffToken[] {
  const tokens: TuffToken[] = [];
  let i = 0;
  while (i < text.length) {
    const read = readToken(text, i);
    if (!read) break;
    tokens.push(read.token);
    i = read.next;
  }
  return tokens;
}
