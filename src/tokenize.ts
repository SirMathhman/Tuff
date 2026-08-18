export type Token =
  | number
  | "+"
  | "-"
  | "*"
  | "&"
  | "("
  | ")"
  | "{"
  | "}"
  | "let"
  | "true"
  | "false"
  | "="
  | ";"
  | string;

/**
 * All non-identifier string tokens. Identifiers are any other string.
 */
const NON_IDENTIFIERS: ReadonlySet<string> = new Set([
  "let",
  "mut",
  "if",
  "else",
  "true",
  "false",
  "=",
  ";",
  "+",
  "-",
  "*",
  "&",
  "(",
  ")",
  "{",
  "}",
]);

export function isIdentifier(token: Token): token is string {
  return typeof token === "string" && !NON_IDENTIFIERS.has(token);
}

/**
 * Splits an expression into tokens, or returns null when the input
 * contains a non-numeric operand. Whitespace between tokens is allowed.
 */
export function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const pattern = /(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([(){}=;&])|([*+-])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex && input.slice(lastIndex, match.index).trim() !== "") {
      return null;
    }
    if (match[1] !== undefined) {
      tokens.push(Number(match[1]));
    } else if (match[2] !== undefined) {
      const word = match[2];
      tokens.push(
        word === "let" || word === "true" || word === "false"
          ? word
          : word === "mut"
            ? "mut"
            : word,
      );
    } else if (match[3] !== undefined) {
      tokens.push(match[3] as "(" | ")" | "{" | "}" | "=" | ";" | "&");
    } else {
      tokens.push(match[4] as "+" | "-" | "*");
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < input.length) {
    return null;
  }
  return tokens;
}
