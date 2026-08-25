import type { Token } from "../lexer.ts";

export type LiteralValue = number | boolean;

export type Expr =
  | {
      literal: LiteralValue;
      kind?: "int" | "float";
      position: number;
    }
  | { identifier: string; position: number }
  | {
      binary: {
        op: "||" | "&&" | "<" | "==" | "+" | "-" | "*";
        left: Expr;
        right: Expr;
      };
      position: number;
    }
  | { grouped: Expr; position: number }
  | { range: { start: Expr; end: Expr }; position: number };

export type IfStatement = {
  condition: Expr;
  thenBlock: Statement[];
  elseBlock?: Statement[];
};

export type WhileStatement = { condition: Expr; body: Statement[] };

export type ForStatement = {
  variable: string;
  range: Expr;
  body: Statement[];
};

export type MatchCase = {
  pattern:
    | {
        kind: "literal";
        value: number | boolean;
        numericKind?: "int" | "float";
      }
    | { kind: "wildcard" };
  block: Statement[];
};

export type MatchStatement = { scrutinee: Expr; cases: MatchCase[] };

export type Declaration = {
  name: string;
  mutable: boolean;
  expr: Expr;
  position: number;
};

export type Assignment = {
  name: string;
  op: "=" | "+=";
  expr: Expr;
  position: number;
};

export type Return = { expr: Expr; position: number };

export type Statement =
  | { block: Statement[]; position: number }
  | { declaration: Declaration; position: number }
  | { assignment: Assignment; position: number }
  | { return: Return; position: number }
  | { if: IfStatement; position: number }
  | { while: WhileStatement; position: number }
  | { for: ForStatement; position: number }
  | { match: MatchStatement; position: number }
  | { break: { position: number }; position: number }
  | { continue: { position: number }; position: number };

export const NAME_KEYWORDS = [
  "let",
  "mut",
  "return",
  "true",
  "false",
  "if",
  "else",
  "while",
  "break",
  "continue",
  "match",
  "case",
  "for",
  "in",
];

export type Cursor = { tokens: Token[]; i: number };

export function peek(c: Cursor): Token | undefined {
  return c.tokens[c.i];
}

export function advance(c: Cursor): Token {
  const t = c.tokens[c.i]!;
  c.i++;
  return t;
}
