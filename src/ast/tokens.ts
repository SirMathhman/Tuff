// ============= TOKEN TYPES =============

// Core token kinds (max 5 per union)
type StructuredTokenKind =
  | KeywordToken
  | IdentifierToken
  | LiteralToken
  | OperatorToken;

type SimpleTokenKind = DelimiterToken | PunctuationToken | EOFToken;

/**
 * Token types with position tracking for error reporting
 */
export type Token = StructuredTokenKind | SimpleTokenKind;

export interface KeywordToken {
  kind: "keyword";
  position: number;
  value: string;
  keyword: string;
}

export interface IdentifierToken {
  kind: "identifier";
  position: number;
  value: string;
}

export interface LiteralToken {
  kind: "literal";
  position: number;
  value: string;
  literalKind: "int" | "float" | "string";
  suffix?: string;
}

export interface OperatorToken {
  kind: "operator";
  position: number;
  value: string;
}

export interface DelimiterToken {
  kind: "delimiter";
  position: number;
  value: string;
}

export interface PunctuationToken {
  kind: "punctuation";
  position: number;
  value: string;
}

export interface EOFToken {
  kind: "eof";
  position: number;
  value: "";
}

// Language keywords
export const KEYWORDS = new Set([
  "let",
  "mut",
  "fn",
  "if",
  "else",
  "while",
  "for",
  "in",
  "struct",
  "type",
  "match",
  "case",
  "default",
  "yield",
  "this",
  "true",
  "false",
  "out",
  "import",
  "use",
  "from",
  "extern",
]);

// Type guards for tokens
export function isKeywordToken(token: Token): token is KeywordToken {
  return token.kind === "keyword";
}

export function isIdentifierToken(token: Token): token is IdentifierToken {
  return token.kind === "identifier";
}

export function isLiteralToken(token: Token): token is LiteralToken {
  return token.kind === "literal";
}

export function isOperatorToken(token: Token): token is OperatorToken {
  return token.kind === "operator";
}

export function isDelimiterToken(token: Token): token is DelimiterToken {
  return token.kind === "delimiter";
}

export function isPunctuationToken(token: Token): token is PunctuationToken {
  return token.kind === "punctuation";
}

export function isEOFToken(token: Token): token is EOFToken {
  return token.kind === "eof";
}
