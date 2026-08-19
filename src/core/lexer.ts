import { err, ok, type EvalError, type Result } from "./errors.js";

/** A lexical token with its zero-based source position. */
export type Token =
  | { kind: "let"; position: number }
  | { kind: "mut"; position: number }
  | { kind: "return"; position: number }
  | { kind: "if"; position: number }
  | { kind: "else"; position: number }
  | { kind: "while"; position: number }
  | { kind: "ident"; value: string; position: number }
  | { kind: "number"; value: number; position: number }
  | { kind: "bool"; value: boolean; position: number }
  | { kind: "assign"; position: number }
  | { kind: "compoundAssign"; operator: "+="; position: number }
  | {
      kind: "binary";
      operator: "==" | "!=" | "<" | "<=" | ">" | ">=" | "+";
      position: number;
    }
  | { kind: "semicolon"; position: number }
  | { kind: "addressOf"; mutable: boolean; position: number }
  | { kind: "deref"; position: number }
  | { kind: "lbrace"; position: number }
  | { kind: "rbrace"; position: number }
  | { kind: "lparen"; position: number }
  | { kind: "rparen"; position: number }
  | { kind: "lbracket"; position: number }
  | { kind: "rbracket"; position: number }
  | { kind: "comma"; position: number };

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
        word === "while"
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
