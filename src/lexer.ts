import { err, ok, type EvalError, type Result } from "./errors.js";

/** A lexical token with its zero-based source position. */
export type Token =
  | { kind: "let"; position: number }
  | { kind: "mut"; position: number }
  | { kind: "return"; position: number }
  | { kind: "ident"; value: string; position: number }
  | { kind: "number"; value: number; position: number }
  | { kind: "bool"; value: boolean; position: number }
  | { kind: "assign"; position: number }
  | { kind: "binary"; operator: "==" | "<"; position: number }
  | { kind: "semicolon"; position: number }
  | { kind: "lbrace"; position: number }
  | { kind: "rbrace"; position: number };

const IDENT_RE = /^[A-Za-z_$][\w$]*/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?/;
const SINGLE_CHAR_TOKENS: Record<string, "assign" | "semicolon" | "lbrace" | "rbrace"> = {
  "=": "assign",
  ";": "semicolon",
  "{": "lbrace",
  "}": "rbrace",
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
    if (source.startsWith("==", i)) {
      tokens.push({ kind: "binary", operator: "==", position: i });
      i += 2;
      continue;
    }
    if (char === "<") {
      tokens.push({ kind: "binary", operator: "<", position: i });
      i += 1;
      continue;
    }
    const singleCharKind = SINGLE_CHAR_TOKENS[char];
    if (singleCharKind) {
      tokens.push({ kind: singleCharKind, position: i });
      i++;
      continue;
    }
    const rest = source.slice(i);
    const identMatch = IDENT_RE.exec(rest);
    if (identMatch) {
      const word = identMatch[0];
      if (word === "true" || word === "false") {
        tokens.push({ kind: "bool", value: word === "true", position: i });
      } else if (word === "let" || word === "mut" || word === "return") {
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
