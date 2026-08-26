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

/** A `<` operator token. */
export interface LessToken {
  kind: "Less";
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

/** A `+=` compound-assignment token. */
export interface PlusAssignToken {
  kind: "PlusAssign";
}

/** A `,` tuple separator token. */
export interface CommaToken {
  kind: "Comma";
}

/** A `.` tuple-index token. */
export interface DotToken {
  kind: "Dot";
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

/** An opening square-bracket token. */
export interface LBracketToken {
  kind: "LBracket";
}

/** A closing square-bracket token. */
export interface RBracketToken {
  kind: "RBracket";
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
  | LessToken
  | RefToken
  | DerefToken
  | AssignToken
  | PlusAssignToken
  | CommaToken
  | DotToken
  | SemicolonToken
  | LBraceToken
  | RBraceToken
  | LParenToken
  | RParenToken
  | LBracketToken
  | RBracketToken;

/** A single token plus the index just past it. */
interface ReadToken {
  kind: "token";
  token: TuffToken;
  next: number;
}

/** A tokenization failure: an unrecognized character. */
export interface TokenizeError {
  kind: "error";
  character: string;
  line: number;
}

/** The result of tokenizing: the token list, or a tokenization error. */
export type TokenizeResult = TuffToken[] | TokenizeError;

/**
 * Read a punctuation or operator token starting at an index.
 * @param text {string} - The expression text.
 * @param j {number} - The index of the first non-whitespace character.
 * @returns {ReadToken | null} The token and the index just past it, or null if no punctuation matches.
 */
function readPunct(text: string, j: number): ReadToken | null {
  const ch = text[j] ?? "";
  if (ch === "(")
    return { kind: "token", token: { kind: "LParen" }, next: j + 1 };
  if (ch === ")")
    return { kind: "token", token: { kind: "RParen" }, next: j + 1 };
  if (text.startsWith("||", j))
    return { kind: "token", token: { kind: "Or" }, next: j + 2 };
  if (text.startsWith("&&", j))
    return { kind: "token", token: { kind: "And" }, next: j + 2 };
  if (text.startsWith("+=", j))
    return { kind: "token", token: { kind: "PlusAssign" }, next: j + 2 };
  if (ch === "+")
    return { kind: "token", token: { kind: "Plus" }, next: j + 1 };
  if (text.startsWith("==", j))
    return { kind: "token", token: { kind: "Equal" }, next: j + 2 };
  if (ch === "<")
    return { kind: "token", token: { kind: "Less" }, next: j + 1 };
  if (ch === "&") return { kind: "token", token: { kind: "Ref" }, next: j + 1 };
  if (ch === "*")
    return { kind: "token", token: { kind: "Deref" }, next: j + 1 };
  if (ch === "=")
    return { kind: "token", token: { kind: "Assign" }, next: j + 1 };
  if (ch === ",")
    return { kind: "token", token: { kind: "Comma" }, next: j + 1 };
  if (ch === ".") return { kind: "token", token: { kind: "Dot" }, next: j + 1 };
  if (ch === ";")
    return { kind: "token", token: { kind: "Semicolon" }, next: j + 1 };
  if (ch === "{")
    return { kind: "token", token: { kind: "LBrace" }, next: j + 1 };
  if (ch === "}")
    return { kind: "token", token: { kind: "RBrace" }, next: j + 1 };
  if (ch === "[")
    return { kind: "token", token: { kind: "LBracket" }, next: j + 1 };
  if (ch === "]")
    return { kind: "token", token: { kind: "RBracket" }, next: j + 1 };
  return null;
}

/**
 * Read a number, boolean, or identifier token starting at an index.
 * @param text {string} - The expression text.
 * @param j {number} - The index of the first non-whitespace character.
 * @returns {ReadToken | TokenizeError} The token and the index just past it, or a tokenization error.
 */
function readWord(text: string, j: number): ReadToken | TokenizeError {
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
    character: text[j] ?? "",
    line: 1 + (text.slice(0, j).match(/\n/g) ?? []).length,
  };
}

/**
 * Read one token starting at an index, skipping leading whitespace.
 * @param text {string} - The expression text.
 * @param i {number} - The index to read from.
 * @returns {ReadToken | TokenizeError | null} The token and the index just past it, a tokenization error, or null if only whitespace remains.
 */
function readToken(text: string, i: number): ReadToken | TokenizeError | null {
  let j = i;
  while (j < text.length && /\s/.test(text[j] ?? "")) j++;
  if (j >= text.length) return null;
  return readPunct(text, j) ?? readWord(text, j);
}

/**
 * Render a token as a short detail string for error messages.
 * @param token {TuffToken | undefined} - The token to render.
 * @returns {string} The identifier name, number value, or token kind.
 */
export function tokenDetail(token: TuffToken | undefined): string {
  if (!token) return "";
  if (token.kind === "Ident") return token.name;
  if (token.kind === "Number") return String(token.value);
  return token.kind;
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
