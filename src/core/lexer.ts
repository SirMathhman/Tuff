import { err, ok, type EvalError, type Result } from "./errors.js";

/** The `let` keyword. */
export interface TokenLet {
  kind: "let";
  position: number;
}

/** The `mut` keyword. */
export interface TokenMut {
  kind: "mut";
  position: number;
}

/** The `return` keyword. */
export interface TokenReturn {
  kind: "return";
  position: number;
}

/** The `if` keyword. */
export interface TokenIf {
  kind: "if";
  position: number;
}

/** The `else` keyword. */
export interface TokenElse {
  kind: "else";
  position: number;
}

/** The `while` keyword. */
export interface TokenWhile {
  kind: "while";
  position: number;
}

/** The `for` keyword. */
export interface TokenFor {
  kind: "for";
  position: number;
}

/** The `in` keyword (range loops). */
export interface TokenIn {
  kind: "in";
  position: number;
}

/** An identifier. */
export interface TokenIdent {
  kind: "ident";
  value: string;
  position: number;
}

/** A numeric literal, optionally suffixed with a type (`100U8`, `1USize`, `1.5F64`). */
export interface TokenNumber {
  kind: "number";
  value: number;
  /** The type suffix (`u8`, `i32`, `f32`, ...), when present. */
  suffix?: string;
  position: number;
}

/** A boolean literal. */
export interface TokenBool {
  kind: "bool";
  value: boolean;
  position: number;
}

/** The `=` assignment operator. */
export interface TokenAssign {
  kind: "assign";
  position: number;
}

/** The `+=` compound assignment operator. */
export interface TokenCompoundAssign {
  kind: "compoundAssign";
  operator: "+=";
  position: number;
}

/** A binary operator. */
export interface TokenBinary {
  kind: "binary";
  operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "+";
  position: number;
}

/** A `;` statement terminator. */
export interface TokenSemicolon {
  kind: "semicolon";
  position: number;
}

/** The `&` / `&mut` address-of operator. */
export interface TokenAddressOf {
  kind: "addressOf";
  mutable: boolean;
  position: number;
}

/** The `*` dereference operator. */
export interface TokenDeref {
  kind: "deref";
  position: number;
}

/** A `{` token. */
export interface TokenLbrace {
  kind: "lbrace";
  position: number;
}

/** A `}` token. */
export interface TokenRbrace {
  kind: "rbrace";
  position: number;
}

/** A `(` token. */
export interface TokenLparen {
  kind: "lparen";
  position: number;
}

/** A `)` token. */
export interface TokenRparen {
  kind: "rparen";
  position: number;
}

/** A `[` token. */
export interface TokenLbracket {
  kind: "lbracket";
  position: number;
}

/** A `]` token. */
export interface TokenRbracket {
  kind: "rbracket";
  position: number;
}

/** A `,` token. */
export interface TokenComma {
  kind: "comma";
  position: number;
}

/** The `..` range operator (exclusive of the end, in `for` loops). */
export interface TokenRange {
  kind: "range";
  position: number;
}

/** The `break` keyword. */
export interface TokenBreak {
  kind: "break";
  position: number;
}

/** The `continue` keyword. */
export interface TokenContinue {
  kind: "continue";
  position: number;
}

/** The `match` keyword. */
export interface TokenMatch {
  kind: "match";
  position: number;
}

/** The `case` keyword. */
export interface TokenCase {
  kind: "case";
  position: number;
}

/** The `is` type-test operator. */
export interface TokenIs {
  kind: "is";
  position: number;
}

/** The `=>` arm arrow. */
export interface TokenArrow {
  kind: "arrow";
  position: number;
}

/** The `_` wildcard pattern. */
export interface TokenWildcard {
  kind: "wildcard";
  position: number;
}

/** A lexical token with its zero-based source position. */
export type Token =
  | TokenLet
  | TokenMut
  | TokenReturn
  | TokenIf
  | TokenElse
  | TokenWhile
  | TokenFor
  | TokenIn
  | TokenBreak
  | TokenContinue
  | TokenMatch
  | TokenCase
  | TokenIs
  | TokenArrow
  | TokenWildcard
  | TokenIdent
  | TokenNumber
  | TokenBool
  | TokenAssign
  | TokenCompoundAssign
  | TokenBinary
  | TokenSemicolon
  | TokenAddressOf
  | TokenDeref
  | TokenLbrace
  | TokenRbrace
  | TokenLparen
  | TokenRparen
  | TokenLbracket
  | TokenRbracket
  | TokenComma
  | TokenRange;

const IDENT_RE = /^[A-Za-z_$][\w$]*/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?/;
/** The integer-type literal suffixes in their canonical spelling (`100U8`, `1I32`, `1USize`, ...). */
const INT_SUFFIXES = new Set(["U8", "U16", "U32", "U64", "USize", "I8", "I16", "I32", "I64"]);
/** The float-type literal suffixes in their canonical spelling (`1.5F32`, `1F64`, ...). */
const FLOAT_SUFFIXES = new Set(["F32", "F64"]);
/** The lowercase spellings of the valid suffixes, for the `InvalidNumberSuffix` error. */
const LOWER_SUFFIXES = new Set(
  [...INT_SUFFIXES, ...FLOAT_SUFFIXES].map((suffix) => suffix.toLowerCase()),
);
const SINGLE_CHAR_TOKENS: Record<
  string,
  | "assign"
  | "semicolon"
  | "addressOf"
  | "deref"
  | "lbrace"
  | "rbrace"
  | "lparen"
  | "rparen"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "wildcard"
> = {
  "=": "assign",
  ";": "semicolon",
  "&": "addressOf",
  "*": "deref",
  "{": "lbrace",
  "}": "rbrace",
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
  ",": "comma",
  _: "wildcard",
};

const TWO_CHAR_OPERATORS: Record<string, "==" | "!=" | "<=" | ">="> = {
  "==": "==",
  "!=": "!=",
  "<=": "<=",
  ">=": ">=",
};

/** A successful match: the produced token and how many source chars to skip. */
interface Match {
  token: Token;
  advance: number;
}

/** Matches the multi-char specials `+=`, `&mut`, and `..`. */
function matchSpecial(source: string, i: number): Match | undefined {
  if (source.startsWith("+=", i)) {
    return {
      token: { kind: "compoundAssign", operator: "+=", position: i },
      advance: 2,
    };
  }
  if (source.startsWith("..", i)) {
    return { token: { kind: "range", position: i }, advance: 2 };
  }
  if (source.startsWith("&mut", i)) {
    return { token: { kind: "addressOf", mutable: true, position: i }, advance: 4 };
  }
  return undefined;
}

/** Matches two-char (`==`, `!=`, `<=`, `>=`) and single-char (`<`, `>`, `+`) binary operators. */
function matchBinary(source: string, i: number): Match | undefined {
  const twoCharOperator = TWO_CHAR_OPERATORS[source.slice(i, i + 2)];
  if (twoCharOperator) {
    return { token: { kind: "binary", operator: twoCharOperator, position: i }, advance: 2 };
  }
  if (source.startsWith("=>", i)) {
    return { token: { kind: "arrow", position: i }, advance: 2 };
  }
  const char = source[i];
  if (char === "<" || char === ">" || char === "+") {
    return { token: { kind: "binary", operator: char, position: i }, advance: 1 };
  }
  return undefined;
}

/** Matches the single-char punctuation table (`SINGLE_CHAR_TOKENS`). */
function matchSingleChar(source: string, i: number): Match | undefined {
  const kind = SINGLE_CHAR_TOKENS[source[i]];
  if (!kind) {
    return undefined;
  }
  const token: Token =
    kind === "addressOf"
      ? { kind: "addressOf", mutable: false, position: i }
      : { kind, position: i };
  return { token, advance: 1 };
}

/** Matches identifiers, keywords, and boolean literals. */
function matchWord(source: string, i: number): Match | undefined {
  const word = IDENT_RE.exec(source.slice(i))?.[0];
  if (!word) {
    return undefined;
  }
  const token: Token =
    word === "true" || word === "false"
      ? { kind: "bool", value: word === "true", position: i }
      : word === "let" ||
          word === "mut" ||
          word === "return" ||
          word === "if" ||
          word === "else" ||
          word === "while" ||
          word === "for" ||
          word === "in" ||
          word === "break" ||
          word === "continue" ||
          word === "match" ||
          word === "case" ||
          word === "is"
        ? { kind: word, position: i }
        : { kind: "ident", value: word, position: i };
  return { token, advance: word.length };
}

/**
 * Matches a numeric literal, optionally followed by an uppercase type suffix
 * (integer suffixes on integer literals, float suffixes on any literal).
 * A lowercase suffix (`100u8`, `1.5f32`) is a dedicated error; any other word
 * after the number is left for the caller to tokenize as an identifier.
 */
function matchNumber(source: string, i: number): Result<Match, EvalError> | undefined {
  const match = NUMBER_RE.exec(source.slice(i));
  if (!match) {
    return undefined;
  }
  const fractional = match[0].includes(".");
  const rest = source.slice(i + match[0].length);
  const suffixMatch = /^[A-Za-z][A-Za-z0-9]*/.exec(rest)?.[0];
  if (suffixMatch) {
    const isIntSuffix = INT_SUFFIXES.has(suffixMatch);
    const isFloatSuffix = FLOAT_SUFFIXES.has(suffixMatch);
    if (!isIntSuffix && !isFloatSuffix && LOWER_SUFFIXES.has(suffixMatch)) {
      // A lowercase spelling of a valid suffix: a dedicated error, not an identifier.
      return err({
        kind: "InvalidNumberSuffix",
        suffix: suffixMatch,
        position: i + match[0].length,
      });
    }
    // Integer suffixes apply only to integer literals (`1.5U8` is not a u8);
    // float suffixes apply to any numeric literal (`1F32` is a 1.0 f32).
    const valid = fractional ? isFloatSuffix : isIntSuffix || isFloatSuffix;
    if (valid) {
      return ok({
        token: {
          kind: "number",
          value: Number(match[0]),
          suffix: suffixMatch.toLowerCase(),
          position: i,
        },
        advance: match[0].length + suffixMatch.length,
      });
    }
  }
  return ok({
    token: { kind: "number", value: Number(match[0]), position: i },
    advance: match[0].length,
  });
}

/**
 * Tokenize a source program.
 * @param source - The source text to tokenize.
 * @returns A `Result` carrying the token list, or an `UnexpectedToken` or
 * `InvalidNumberSuffix` error.
 */
export function tokenize(source: string): Result<Token[], EvalError> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const match =
      matchSpecial(source, i) ??
      matchBinary(source, i) ??
      matchSingleChar(source, i) ??
      matchWord(source, i);
    if (match) {
      tokens.push(match.token);
      i += match.advance;
      continue;
    }
    const number = matchNumber(source, i);
    if (!number) {
      return err({ kind: "UnexpectedToken", character: char, position: i });
    }
    if (!number.ok) {
      return number;
    }
    tokens.push(number.value.token);
    i += number.value.advance;
  }
  return ok(tokens);
}
