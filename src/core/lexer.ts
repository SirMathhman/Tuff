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

/** An identifier. */
export interface TokenIdent {
  kind: "ident";
  value: string;
  position: number;
}

/** A numeric literal. */
export interface TokenNumber {
  kind: "number";
  value: number;
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

/** A lexical token with its zero-based source position. */
export type Token =
  | TokenLet
  | TokenMut
  | TokenReturn
  | TokenIf
  | TokenElse
  | TokenWhile
  | TokenBreak
  | TokenContinue
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
  | TokenComma;

const IDENT_RE = /^[A-Za-z_$][\w$]*/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?/;
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
};

/**
 * Tokenize a source program.
 * @param source - The source text to tokenize.
 * @returns A `Result` carrying the token list, or an `UnexpectedToken` error.
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
    const twoCharOperators: Record<string, "==" | "!=" | "<=" | ">="> = {
      "==": "==",
      "!=": "!=",
      "<=": "<=",
      ">=": ">=",
    };
    if (source.startsWith("+=", i)) {
      tokens.push({ kind: "compoundAssign", operator: "+=", position: i });
      i += 2;
      continue;
    }
    if (source.startsWith("&mut", i)) {
      tokens.push({ kind: "addressOf", mutable: true, position: i });
      i += 4;
      continue;
    }
    const twoChar = source.slice(i, i + 2);
    const twoCharOperator = twoCharOperators[twoChar];
    if (twoCharOperator) {
      tokens.push({ kind: "binary", operator: twoCharOperator, position: i });
      i += 2;
      continue;
    }
    if (char === "<" || char === ">" || char === "+") {
      tokens.push({ kind: "binary", operator: char, position: i });
      i += 1;
      continue;
    }
    const singleCharKind = SINGLE_CHAR_TOKENS[char];
    if (singleCharKind) {
      if (singleCharKind === "addressOf") {
        tokens.push({ kind: "addressOf", mutable: false, position: i });
      } else {
        tokens.push({ kind: singleCharKind, position: i });
      }
      i++;
      continue;
    }
    const rest = source.slice(i);
    const identMatch = IDENT_RE.exec(rest);
    if (identMatch) {
      const word = identMatch[0];
      if (word === "true" || word === "false") {
        tokens.push({ kind: "bool", value: word === "true", position: i });
      } else if (
        word === "let" ||
        word === "mut" ||
        word === "return" ||
        word === "if" ||
        word === "else" ||
        word === "while" ||
        word === "break" ||
        word === "continue"
      ) {
        tokens.push({ kind: word, position: i });
      } else {
        tokens.push({ kind: "ident", value: word, position: i });
      }
      i += word.length;
      continue;
    }
    const numberMatch = NUMBER_RE.exec(rest);
    if (numberMatch) {
      tokens.push({ kind: "number", value: Number(numberMatch[0]), position: i });
      i += numberMatch[0].length;
      continue;
    }
    return err({ kind: "UnexpectedToken", character: char, position: i });
  }
  return ok(tokens);
}
