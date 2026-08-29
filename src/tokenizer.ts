import { OPERATOR_PRECEDENCE } from "./ast.ts";

/**
 * A token produced by the tokenizer.
 */
export interface Token {
  /** The token kind. */
  type:
    | "num"
    | "op"
    | "lparen"
    | "rparen"
    | "lbrace"
    | "rbrace"
    | "ident"
    | "kw-let"
    | "kw-mut"
    | "kw-true"
    | "kw-false"
    | "kw-if"
    | "kw-else"
    | "assign"
    | "semi"
    | "amp"
    | "invalid"
    | "eof";
  /** The token text. */
  text: string;
  /** The position of the token in the input. */
  position: number;
}

/**
 * Single-character punctuation mapped to its token type.
 */
const PUNCT: Record<string, Token["type"]> = {
  "=": "assign",
  "&": "amp",
  ";": "semi",
  "(": "lparen",
  "{": "lbrace",
  ")": "rparen",
  "}": "rbrace",
};

/**
 * The result of reading one token from the input.
 */
interface ReadToken {
  /** The token read. */
  token: Token;
  /** The index just past the token. */
  next: number;
}

/**
 * Read a single token starting at an index.
 * @param {string} input - The input string.
 * @param {number} i - The index to start reading at.
 * @returns {ReadToken} The token and the index just past it.
 */
function readToken(input: string, i: number): ReadToken {
  const ch = input[i]!;
  if (ch >= "0" && ch <= "9") {
    let j = i;
    while (j < input.length && isDigit(input[j]!)) {
      j += 1;
    }
    return {
      token: { type: "num", text: input.slice(i, j), position: i },
      next: j,
    };
  }
  const multi = readMultiCharOp(input, i);
  if (multi !== null) {
    return multi;
  }
  if (ch in OPERATOR_PRECEDENCE) {
    return { token: { type: "op", text: ch, position: i }, next: i + 1 };
  }
  if (isLetter(ch)) {
    let j = i;
    while (j < input.length && (isLetter(input[j]!) || isDigit(input[j]!))) {
      j += 1;
    }
    const text = input.slice(i, j);
    const type =
      text === "let"
        ? "kw-let"
        : text === "mut"
          ? "kw-mut"
          : text === "true"
            ? "kw-true"
            : text === "false"
              ? "kw-false"
              : text === "if"
                ? "kw-if"
                : text === "else"
                  ? "kw-else"
                  : "ident";
    return {
      token: { type, text, position: i },
      next: j,
    };
  }
  const punct = PUNCT[ch];
  if (punct !== undefined) {
    return { token: { type: punct, text: ch, position: i }, next: i + 1 };
  }
  return { token: { type: "invalid", text: ch, position: i }, next: i + 1 };
}

/**
 * Read a multi-character operator (||, &&, ==) starting at an index.
 * @param {string} input - The input string.
 * @param {number} i - The index to start reading at.
 * @returns {ReadToken | null} The operator token, or null if no multi-char operator starts here.
 */
function readMultiCharOp(input: string, i: number): ReadToken | null {
  const pair = input.slice(i, i + 2);
  if (pair === "||" || pair === "&&" || pair === "==") {
    return { token: { type: "op", text: pair, position: i }, next: i + 2 };
  }
  return null;
}

/**
 * Tokenize an expression into a list of tokens.
 * @param {string} input - The expression to tokenize.
 * @returns {Token[]} The list of tokens, ending with an eof token.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === " ") {
      i += 1;
      continue;
    }
    const { token, next } = readToken(input, i);
    tokens.push(token);
    i = next;
  }
  tokens.push({ type: "eof", text: "", position: i });
  return tokens;
}

/**
 * Check whether a character is an ASCII letter.
 * @param {string} ch - The character to check.
 * @returns {boolean} True if the character is a letter.
 */
function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

/**
 * Check whether a character is an ASCII digit.
 * @param {string} ch - The character to check.
 * @returns {boolean} True if the character is a digit.
 */
function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
