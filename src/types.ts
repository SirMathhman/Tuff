export type Value = number | boolean | U8Value | U16Value;

export interface U8Value {
  readonly kind: "u8";
  readonly value: number;
}

export interface U16Value {
  readonly kind: "u16";
  readonly value: number;
}

export type TypeName = "U8" | "U16";

export type Token =
  | { type: "number"; value: number; u8?: boolean; u16?: boolean }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "=" | "+=" | "-=" | "*=" | "/=" | "<" | ">" | "<=" | ">=" | "==" | "!=" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "identifier"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "colon"; value: ":" }
  | { type: "semicolon"; value: ";" };

export type AST =
  | { type: "number"; value: number; u8?: boolean; u16?: boolean }
  | { type: "boolean"; value: boolean }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "<" | ">" | "<=" | ">=" | "==" | "!="; left: AST; right: AST }
  | { type: "unary"; operator: "-"; operand: AST }
  | { type: "identifier"; name: string }
  | { type: "let"; name: string; mutable: boolean; typeName?: TypeName; value: AST }
  | { type: "assign"; name: string; operator: "=" | "+=" | "-=" | "*=" | "/="; value: AST }
  | { type: "if"; condition: AST; then: AST; else: AST | null }
  | { type: "while"; condition: AST; body: AST }
  | { type: "block"; statements: AST[] };
