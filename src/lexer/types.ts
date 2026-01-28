// Stage 0: TypeScript
// Lexer types and token definitions

/**
 * Position information for error reporting and source mapping
 */
export interface Position {
  line: number
  column: number
  offset: number
}

/**
 * Source location range
 */
export interface SourceLocation {
  start: Position
  end: Position
  source: string
}

/**
 * Token types for the Tuff language
 */
export enum TokenType {
  // Literals
  IntLiteral = "IntLiteral",
  FloatLiteral = "FloatLiteral",
  StringLiteral = "StringLiteral",
  BoolLiteral = "BoolLiteral",
  Identifier = "Identifier",

  // Keywords
  Let = "Let",
  Const = "Const",
  Fn = "Fn",
  Struct = "Struct",
  Enum = "Enum",
  Impl = "Impl",
  Trait = "Trait",
  Use = "Use",
  If = "If",
  Else = "Else",
  While = "While",
  For = "For",
  In = "In",
  Return = "Return",
  Break = "Break",
  Continue = "Continue",
  Match = "Match",
  True = "True",
  False = "False",
  Null = "Null",
  Self_ = "Self",
  Pub = "Pub",
  Priv = "Priv",
  Mut = "Mut",
  As = "As",
  Type = "Type",

  // Operators
  Plus = "Plus",
  Minus = "Minus",
  Star = "Star",
  Slash = "Slash",
  Percent = "Percent",
  Caret = "Caret",
  Ampersand = "Ampersand",
  Pipe = "Pipe",
  Bang = "Bang",
  Question = "Question",
  Eq = "Eq",
  EqEq = "EqEq",
  NotEq = "NotEq",
  Lt = "Lt",
  LtEq = "LtEq",
  Gt = "Gt",
  GtEq = "GtEq",
  AndAnd = "AndAnd",
  OrOr = "OrOr",
  PlusEq = "PlusEq",
  MinusEq = "MinusEq",
  StarEq = "StarEq",
  SlashEq = "SlashEq",
  PercentEq = "PercentEq",
  AmpersandEq = "AmpersandEq",
  PipeEq = "PipeEq",
  CaretEq = "CaretEq",
  LtLt = "LtLt",
  GtGt = "GtGt",
  DotDot = "DotDot",
  DotDotEq = "DotDotEq",
  Arrow = "Arrow",
  FatArrow = "FatArrow",
  DoubleColon = "DoubleColon",

  // Delimiters
  LParen = "LParen",
  RParen = "RParen",
  LBrace = "LBrace",
  RBrace = "RBrace",
  LBracket = "LBracket",
  RBracket = "RBracket",
  Comma = "Comma",
  Dot = "Dot",
  Colon = "Colon",
  Semicolon = "Semicolon",

  // Special
  EOF = "EOF",
  Error = "Error",
  Newline = "Newline",
}

/**
 * A single token
 */
export interface Token {
  type: TokenType
  value: string
  location: SourceLocation
}

/**
 * Lexer interface
 */
export interface Lexer {
  tokenize(input: string): Token[]
  nextToken(): Token
  peek(): Token
  peekAhead(n: number): Token
}

/**
 * Lexical analysis result
 */
export interface LexerOutput {
  tokens: Token[]
  errors: LexError[]
}

/**
 * Lexical analysis error
 */
export interface LexError {
  message: string
  location: SourceLocation
}
