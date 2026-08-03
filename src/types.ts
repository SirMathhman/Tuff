export type Value = number | boolean | U8Value;

export interface U8Value {
  readonly kind: "u8";
  readonly value: number;
}

export type Token =
  | { type: "number"; value: number; u8?: boolean }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "=" | "+=" | "-=" | "*=" | "/=" | "<" | ">" | "<=" | ">=" | "==" | "!=" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "identifier"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "semicolon"; value: ";" };

export type AST =
  | { type: "number"; value: number; u8?: boolean }
  | { type: "boolean"; value: boolean }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "<" | ">" | "<=" | ">=" | "==" | "!="; left: AST; right: AST }
  | { type: "unary"; operator: "-"; operand: AST }
  | { type: "identifier"; name: string }
  | { type: "let"; name: string; mutable: boolean; value: AST }
  | { type: "assign"; name: string; operator: "=" | "+=" | "-=" | "*=" | "/="; value: AST }
  | { type: "if"; condition: AST; then: AST; else: AST | null }
  | { type: "while"; condition: AST; body: AST }
  | { type: "block"; statements: AST[] };
