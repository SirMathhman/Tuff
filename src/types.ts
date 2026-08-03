export type Value = number | boolean | U8Value | U16Value | FunctionValue;

export interface U8Value {
  readonly kind: "u8";
  readonly value: number;
}

export interface U16Value {
  readonly kind: "u16";
  readonly value: number;
}

export interface FunctionValue {
  readonly kind: "function";
  readonly name: string;
  readonly params: Param[];
  readonly returnType?: TypeName;
  readonly body: AST;
  readonly closure: unknown;
}

export interface Param {
  name: string;
  typeName?: TypeName;
}

export type TypeName = "U8" | "U16" | "I32";

export type Token =
  | { type: "number"; value: number; u8?: boolean; u16?: boolean }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "=" | "+=" | "-=" | "*=" | "/=" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "=>" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "identifier"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "colon"; value: ":" }
  | { type: "comma"; value: "," }
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
  | { type: "fn"; name: string; params: Param[]; returnType?: TypeName; body: AST }
  | { type: "call"; callee: AST; args: AST[] }
  | { type: "block"; statements: AST[] };
