export enum TokenType {
  // Keywords
  From,
  Use,
  Fn,
  Let,
  Mut,
  Yield,
  If,
  Else,
  While,
  Struct,
  Impl,
  Type,
  Is,
  Extern,
  Intrinsic,
  Out,

  // Literals
  Identifier,
  String,
  Number,

  // Operators & Punctuation
  Plus, // +
  Minus, // -
  Star, // *
  Slash, // /
  Percent, // %
  Equal, // =
  EqualEqual, // ==
  Bang, // !
  BangEqual, // !=
  Less, // <
  LessEqual, // <=
  Greater, // >
  GreaterEqual, // >=
  Ampersand, // &
  Pipe, // |
  Caret, // ^
  LessLess, // <<
  GreaterGreater, // >>
  AmpersandAmpersand, // &&
  PipePipe, // ||
  PlusEqual, // +=
  MinusEqual, // -=
  StarEqual, // *=
  SlashEqual, // /=
  DoubleColon, // ::
  Arrow, // =>
  Dot, // .
  DotDot, // ..
  Colon, // :
  Comma, // ,
  Semicolon, // ;
  OpenParen, // (
  CloseParen, // )
  OpenBrace, // {
  CloseBrace, // }
  OpenBracket, // [
  CloseBracket, // ]

  EOF,
}

export interface Token {
  type: TokenType;
  lexeme: string;
  literal?: any;
  line: number;
  column: number;
  offset: number;
  length: number;
}
