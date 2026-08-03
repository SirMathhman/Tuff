export type Token =
  | { type: "number"; value: number }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "or" }
  | { type: "and" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "let" }
  | { type: "mut" }
  | { type: "if" }
  | { type: "else" }
  | { type: "while" }
  | { type: "true" }
  | { type: "false" }
  | { type: "identifier"; name: string }
  | { type: "equals" }
  | { type: "plus_equals" }
  | { type: "equals_equals" }
  | { type: "not_equals" }
  | { type: "less_than" }
  | { type: "less_than_or_equal" }
  | { type: "greater_than" }
  | { type: "greater_than_or_equal" }
  | { type: "semicolon" }
  | { type: "eof" };

type OperatorTokenType =
  | "plus"
  | "minus"
  | "star"
  | "or"
  | "and"
  | "lparen"
  | "rparen"
  | "lbrace"
  | "rbrace"
  | "equals"
  | "plus_equals"
  | "equals_equals"
  | "not_equals"
  | "less_than"
  | "less_than_or_equal"
  | "greater_than"
  | "greater_than_or_equal"
  | "semicolon";

import { LexError } from "./errors";

const OPERATORS: Array<[string, OperatorTokenType]> = [
  ["||", "or"],
  ["&&", "and"],
  ["==", "equals_equals"],
  ["!=", "not_equals"],
  ["<=", "less_than_or_equal"],
  [">=", "greater_than_or_equal"],
  ["<", "less_than"],
  [">", "greater_than"],
  ["+=", "plus_equals"],
  ["+", "plus"],
  ["-", "minus"],
  ["*", "star"],
  ["(", "lparen"],
  [")", "rparen"],
  ["{", "lbrace"],
  ["}", "rbrace"],
  ["=", "equals"],
  [";", "semicolon"],
];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === " ") {
      i++;
    } else if (/\d/.test(ch!)) {
      let value = "";
      while (i < source.length && /\d/.test(source[i]!)) {
        value += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(value) });
    } else if (/[a-zA-Z]/.test(ch!)) {
      let name = "";
      while (i < source.length && /[a-zA-Z]/.test(source[i]!)) {
        name += source[i];
        i++;
      }
      if (name === "let") {
        tokens.push({ type: "let" });
      } else if (name === "mut") {
        tokens.push({ type: "mut" });
      } else if (name === "if") {
        tokens.push({ type: "if" });
      } else if (name === "else") {
        tokens.push({ type: "else" });
      } else if (name === "while") {
        tokens.push({ type: "while" });
      } else if (name === "true") {
        tokens.push({ type: "true" });
      } else if (name === "false") {
        tokens.push({ type: "false" });
      } else {
        tokens.push({ type: "identifier", name });
      }
    } else {
      const operator = OPERATORS.find(([text]) => source.startsWith(text, i));
      if (operator) {
        tokens.push({ type: operator[1] });
        i += operator[0].length;
      } else {
        throw new LexError(`Unexpected character: ${ch}`);
      }
    }
  }

  tokens.push({ type: "eof" });
  return tokens;
}
