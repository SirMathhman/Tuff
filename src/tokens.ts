export type TokenKind =
  | "eof"
  | "newline"
  | "ident"
  | "number"
  | "string"
  | "lparen"
  | "rparen"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "colon"
  | "semicolon"
  | "dot"
  | "arrow"
  | "fat_arrow"
  | "op"
  | "kw";

export type Token = {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  line: number;
  col: number;
};

export const KEYWORDS = new Set([
  "let",
  "mut",
  "fn",
  "class",
  "type",
  "struct",
  "module",
  "from",
  "use",
  "extern",
  "if",
  "else",
  "while",
  "loop",
  "break",
  "continue",
  "yield",
  "is",
  "match",
  "true",
  "false",
  "None",
]);
