import {
  EvalErrorCode,
  err,
  type EvalFailure,
  type EvalSuccess,
} from "./errors.ts";

export interface NumToken {
  type: "num";
  value: number;
}

export interface OpToken {
  type: "op";
  op: "+" | "-" | "*" | "/";
}

export interface ParenToken {
  type: "paren";
  paren: "(" | ")" | "{" | "}";
}

export interface IdentToken {
  type: "ident";
  name: string;
}

export interface KeywordToken {
  type: "keyword";
  keyword: "let" | "mut";
}

export interface AssignToken {
  type: "assign";
}

export interface SemicolonToken {
  type: "semicolon";
}

export interface RefToken {
  type: "ref";
}

export interface BoolToken {
  type: "bool";
  value: boolean;
}

export interface OrToken {
  type: "or";
}

export type Token =
  | NumToken
  | OpToken
  | ParenToken
  | IdentToken
  | KeywordToken
  | AssignToken
  | SemicolonToken
  | RefToken
  | BoolToken
  | OrToken;

export interface TokenizeSuccess extends EvalSuccess {
  tokens: Token[];
}

export type TokenizeResult = TokenizeSuccess | EvalFailure;

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;
    if (ch === " ") {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j] ?? "")) j++;
      tokens.push({ type: "num", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", op: ch });
      i++;
      continue;
    }
    if (ch === "(" || ch === ")" || ch === "{" || ch === "}") {
      tokens.push({ type: "paren", paren: ch });
      i++;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "assign" });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
      continue;
    }
    if (ch === "&") {
      tokens.push({ type: "ref" });
      i++;
      continue;
    }
    if (ch === "|") {
      if (input[i + 1] === "|") {
        tokens.push({ type: "or" });
        i += 2;
        continue;
      }
      return err(
        EvalErrorCode.UnexpectedCharacter,
        input,
        `Unexpected character "|". Use "||" for logical or.`,
        i,
      );
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j] ?? "")) j++;
      const word = input.slice(i, j);
      if (word === "let") tokens.push({ type: "keyword", keyword: "let" });
      else if (word === "mut") tokens.push({ type: "keyword", keyword: "mut" });
      else if (word === "true") tokens.push({ type: "bool", value: true });
      else if (word === "false") tokens.push({ type: "bool", value: false });
      else tokens.push({ type: "ident", name: word });
      i = j;
      continue;
    }
    return err(
      EvalErrorCode.UnexpectedCharacter,
      input,
      `Unexpected character "${ch}". Only digits, + - * /, ( ) { }, let, =, ;, &, ||, true, false, and identifiers are allowed.`,
      i,
    );
  }
  return { ok: true, value: 0, tokens };
}
