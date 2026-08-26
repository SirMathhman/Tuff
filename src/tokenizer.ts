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

/** A `&` reference token. */
export interface RefToken {
  kind: "Ref";
}

/** A `*` dereference token. */
export interface DerefToken {
  kind: "Deref";
}

/** A `=` assignment token. */
export interface AssignToken {
  kind: "Assign";
}

/** A `;` statement separator token. */
export interface SemicolonToken {
  kind: "Semicolon";
}

/** A `{` block-opening token. */
export interface LBraceToken {
  kind: "LBrace";
}

/** A `}` block-closing token. */
export interface RBraceToken {
  kind: "RBrace";
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
  | RefToken
  | DerefToken
  | AssignToken
  | SemicolonToken
  | LBraceToken
  | RBraceToken
  | LParenToken
  | RParenToken;

/** A single token plus the index just past it. */
interface ReadToken {
  kind: "token";
  token: TuffToken;
  next: number;
}

/** A tokenization failure: an unrecognized character. */
export interface TokenizeError {
  kind: "error";
  message: string;
}

/** The result of tokenizing: the token list, or a tokenization error. */
export type TokenizeResult = TuffToken[] | TokenizeError;

/**
 * Read one token starting at an index, skipping leading whitespace.
 * @param text {string} - The expression text.
 * @param i {number} - The index to read from.
 * @returns {ReadToken | TokenizeError | null} The token and the index just past it, a tokenization error, or null if only whitespace remains.
 */
function readToken(
  text: string,
  i: number,
): ReadToken | TokenizeError | null {
  let j = i;
  while (j < text.length && /\s/.test(text[j] ?? "")) j++;
  if (j >= text.length) return null;
  const ch = text[j] ?? "";
  if (ch === "(")
    return { kind: "token", token: { kind: "LParen" }, next: j + 1 };
  if (ch === ")")
    return { kind: "token", token: { kind: "RParen" }, next: j + 1 };
  if (text.startsWith("||", j))
    return { kind: "token", token: { kind: "Or" }, next: j + 2 };
  if (text.startsWith("&&", j))
    return { kind: "token", token: { kind: "And" }, next: j + 2 };
  if (ch === "+")
    return { kind: "token", token: { kind: "Plus" }, next: j + 1 };
  if (text.startsWith("==", j))
    return { kind: "token", token: { kind: "Equal" }, next: j + 2 };
  if (ch === "&")
    return { kind: "token", token: { kind: "Ref" }, next: j + 1 };
  if (ch === "*")
    return { kind: "token", token: { kind: "Deref" }, next: j + 1 };
  if (ch === "=")
    return { kind: "token", token: { kind: "Assign" }, next: j + 1 };
  if (ch === ";")
    return { kind: "token", token: { kind: "Semicolon" }, next: j + 1 };
  if (ch === "{")
    return { kind: "token", token: { kind: "LBrace" }, next: j + 1 };
  if (ch === "}")
    return { kind: "token", token: { kind: "RBrace" }, next: j + 1 };
  const rest = text.slice(j);
  const num = rest.match(/^-?\d+(\.\d+)?/);
  if (num) {
    return {
      kind: "token",
      token: { kind: "Number", value: Number(num[0]) },
      next: j + num[0].length,
    };
  }
  if (/^true\b/.test(rest))
    return { kind: "token", token: { kind: "Bool", value: 1 }, next: j + 4 };
  if (/^false\b/.test(rest))
    return { kind: "token", token: { kind: "Bool", value: 0 }, next: j + 5 };
  const ident = rest.match(/^\w+/);
  if (ident) {
    return {
      kind: "token",
      token: { kind: "Ident", name: ident[0] },
      next: j + ident[0].length,
    };
  }
  return {
    kind: "error",
    message: `Unexpected character ${JSON.stringify(ch)} in ${JSON.stringify(text)}`,
  };
}

/**
 * Tokenize an expression string into a flat list of tokens.
 * @param text {string} - The expression text.
 * @returns {TokenizeResult} The tokens in source order, or a tokenization error.
 */
export function tokenize(text: string): TokenizeResult {
  const tokens: TuffToken[] = [];
  let i = 0;
  while (i < text.length) {
    const read = readToken(text, i);
    if (!read) break;
    if (read.kind === "error") return read;
    tokens.push(read.token);
    i = read.next;
  }
  return tokens;
}
