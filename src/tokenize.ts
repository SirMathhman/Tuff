import type { TuffError } from "./errors.ts";
import { err, ok } from "./result.ts";
import type { Result } from "./result.ts";

export interface NumberToken {
  kind: "number";
  value: number;
  pos: number;
}

export interface OperatorToken {
  kind: "operator";
  symbol: "+" | "-" | "*";
  pos: number;
}

export type OpenSymbol = "(" | "{";
export type CloseSymbol = ")" | "}";

export interface OpenToken {
  kind: "open";
  symbol: OpenSymbol;
  pos: number;
}

export interface CloseToken {
  kind: "close";
  symbol: CloseSymbol;
  pos: number;
}

export interface NameToken {
  kind: "name";
  name: string;
  pos: number;
}

export interface LetToken {
  kind: "let";
  pos: number;
}

export interface MutToken {
  kind: "mut";
  pos: number;
}

export interface AmpersandToken {
  kind: "ampersand";
  pos: number;
}

export interface EqualsToken {
  kind: "equals";
  pos: number;
}

export interface SemicolonToken {
  kind: "semicolon";
  pos: number;
}

export interface BooleanToken {
  kind: "boolean";
  value: boolean;
  pos: number;
}

export interface OrToken {
  kind: "or";
  pos: number;
}

export interface AndToken {
  kind: "and";
  pos: number;
}

export interface IfToken {
  kind: "if";
  pos: number;
}

export interface ElseToken {
  kind: "else";
  pos: number;
}

export type ComparisonSymbol = "<" | ">" | "<=" | ">=" | "==" | "!=";

export interface ComparisonToken {
  kind: "comparison";
  symbol: ComparisonSymbol;
  pos: number;
}

// Two-character symbols come first, so "<=" is not read as "<" then "=".
const COMPARISON_SYMBOLS: readonly ComparisonSymbol[] = [
  "<=",
  ">=",
  "==",
  "!=",
  "<",
  ">",
];

// The comparison operator starting at `index`, or undefined if there is none.
function comparisonAt(
  source: string,
  index: number,
): ComparisonSymbol | undefined {
  return COMPARISON_SYMBOLS.find((symbol) => source.startsWith(symbol, index));
}

export type Token =
  | NumberToken
  | OperatorToken
  | OpenToken
  | CloseToken
  | NameToken
  | LetToken
  | MutToken
  | AmpersandToken
  | EqualsToken
  | SemicolonToken
  | BooleanToken
  | OrToken
  | AndToken
  | ComparisonToken
  | IfToken
  | ElseToken;

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isLetter(char: string): boolean {
  return (
    (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_"
  );
}

// The token for a run of letters. `let`, `mut`, `if`, and `else` are keywords,
// not names.
function wordToken(word: string, pos: number): Token {
  if (word === "let") {
    return { kind: "let", pos };
  }
  if (word === "mut") {
    return { kind: "mut", pos };
  }
  if (word === "if") {
    return { kind: "if", pos };
  }
  if (word === "else") {
    return { kind: "else", pos };
  }
  if (word === "true" || word === "false") {
    return { kind: "boolean", value: word === "true", pos };
  }
  return { kind: "name", name: word, pos };
}

// Splits the source into tokens in one pass. Tokens go into a local buffer that
// is written by index only and returned once complete, so the tokenizer is
// linear. This is the one place where an array is mutated (see invariant 7).
export function tokenize(source: string): Result<Token[], TuffError> {
  const buffer: Token[] = [];
  let count = 0;
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const comparison = comparisonAt(source, index);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      buffer[count] = {
        kind: "number",
        value: Number(source.slice(index, end)),
        pos: index,
      };
      count++;
      index = end;
    } else if (isLetter(char)) {
      let end = index;
      while (end < source.length && isLetter(source.charAt(end))) {
        end++;
      }
      buffer[count] = wordToken(source.slice(index, end), index);
      count++;
      index = end;
    } else if (char === "+" || char === "-" || char === "*") {
      buffer[count] = { kind: "operator", symbol: char, pos: index };
      count++;
      index++;
    } else if (char === "(" || char === "{") {
      buffer[count] = { kind: "open", symbol: char, pos: index };
      count++;
      index++;
    } else if (char === ")" || char === "}") {
      buffer[count] = { kind: "close", symbol: char, pos: index };
      count++;
      index++;
    } else if (char === "|" && source.charAt(index + 1) === "|") {
      buffer[count] = { kind: "or", pos: index };
      count++;
      index += 2;
    } else if (char === "&" && source.charAt(index + 1) === "&") {
      buffer[count] = { kind: "and", pos: index };
      count++;
      index += 2;
    } else if (char === "&") {
      buffer[count] = { kind: "ampersand", pos: index };
      count++;
      index++;
    } else if (comparison !== undefined) {
      buffer[count] = { kind: "comparison", symbol: comparison, pos: index };
      count++;
      index += comparison.length;
    } else if (char === "=") {
      buffer[count] = { kind: "equals", pos: index };
      count++;
      index++;
    } else if (char === ";") {
      buffer[count] = { kind: "semicolon", pos: index };
      count++;
      index++;
    } else if (char.trim() === "") {
      index++;
    } else {
      return err({
        what: "Unexpected character",
        where: index,
        why: `"${char}" is not a digit, an operator (+, -, *), or whitespace`,
        fix: `Remove "${char}" or replace it with a number or operator`,
      });
    }
  }
  return ok(buffer.slice(0, count));
}

// The source text a token stands for, for use in messages.
export function tokenText(token: Token): string {
  if (token.kind === "number") {
    return String(token.value);
  }
  if (
    token.kind === "operator" ||
    token.kind === "open" ||
    token.kind === "close"
  ) {
    return token.symbol;
  }
  if (token.kind === "name") {
    return token.name;
  }
  if (token.kind === "let") {
    return "let";
  }
  if (token.kind === "mut") {
    return "mut";
  }
  if (token.kind === "ampersand") {
    return "&";
  }
  if (token.kind === "equals") {
    return "=";
  }
  if (token.kind === "boolean") {
    return token.value ? "true" : "false";
  }
  if (token.kind === "comparison") {
    return token.symbol;
  }
  if (token.kind === "if") {
    return "if";
  }
  if (token.kind === "else") {
    return "else";
  }
  if (token.kind === "or") {
    return "||";
  }
  if (token.kind === "and") {
    return "&&";
  }
  return ";";
}

// The source text of the token at `index`, or "" past the end.
export function textAt(tokens: Token[], index: number): string {
  const token = tokens[index];
  return token === undefined ? "" : tokenText(token);
}

// The sign of the "+" or "-" operator at `index`, or undefined if there is none.
export function signAt(tokens: Token[], index: number): 1 | -1 | undefined {
  const token = tokens[index];
  if (token?.kind !== "operator") {
    return undefined;
  }
  if (token.symbol === "+") {
    return 1;
  }
  if (token.symbol === "-") {
    return -1;
  }
  return undefined;
}

// True when the token at `index` is the "*" operator.
export function isStarAt(tokens: Token[], index: number): boolean {
  const token = tokens[index];
  return token?.kind === "operator" && token.symbol === "*";
}

// The closing symbol that matches an opening symbol.
export function closerFor(symbol: OpenSymbol): CloseSymbol {
  return symbol === "(" ? ")" : "}";
}

// The opening symbol that matches a closing symbol.
export function openerFor(symbol: CloseSymbol): OpenSymbol {
  return symbol === ")" ? "(" : "{";
}
