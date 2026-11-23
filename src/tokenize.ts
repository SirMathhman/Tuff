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
  | AndToken;

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isLetter(char: string): boolean {
  return (
    (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_"
  );
}

// The token for a run of letters. `let` and `mut` are keywords, not names.
function wordToken(word: string, pos: number): Token {
  if (word === "let") {
    return { kind: "let", pos };
  }
  if (word === "mut") {
    return { kind: "mut", pos };
  }
  if (word === "true" || word === "false") {
    return { kind: "boolean", value: word === "true", pos };
  }
  return { kind: "name", name: word, pos };
}

export function tokenize(source: string): Result<Token[], TuffError> {
  let tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (isDigit(char)) {
      let end = index;
      while (end < source.length && isDigit(source.charAt(end))) {
        end++;
      }
      tokens = [
        ...tokens,
        {
          kind: "number",
          value: Number(source.slice(index, end)),
          pos: index,
        },
      ];
      index = end;
    } else if (isLetter(char)) {
      let end = index;
      while (end < source.length && isLetter(source.charAt(end))) {
        end++;
      }
      const word = source.slice(index, end);
      tokens = [...tokens, wordToken(word, index)];
      index = end;
    } else if (char === "+" || char === "-" || char === "*") {
      tokens = [...tokens, { kind: "operator", symbol: char, pos: index }];
      index++;
    } else if (char === "(" || char === "{") {
      tokens = [...tokens, { kind: "open", symbol: char, pos: index }];
      index++;
    } else if (char === ")" || char === "}") {
      tokens = [...tokens, { kind: "close", symbol: char, pos: index }];
      index++;
    } else if (char === "|" && source.charAt(index + 1) === "|") {
      tokens = [...tokens, { kind: "or", pos: index }];
      index += 2;
    } else if (char === "&" && source.charAt(index + 1) === "&") {
      tokens = [...tokens, { kind: "and", pos: index }];
      index += 2;
    } else if (char === "&") {
      tokens = [...tokens, { kind: "ampersand", pos: index }];
      index++;
    } else if (char === "=") {
      tokens = [...tokens, { kind: "equals", pos: index }];
      index++;
    } else if (char === ";") {
      tokens = [...tokens, { kind: "semicolon", pos: index }];
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
  return ok(tokens);
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
