export type Value = number | boolean | U8Value | U16Value | U32Value | U64Value | I8Value | I16Value | I64Value | FunctionValue;

export interface U8Value {
  readonly kind: "u8";
  readonly value: number;
}

export interface U16Value {
  readonly kind: "u16";
  readonly value: number;
}

export interface U32Value {
  readonly kind: "u32";
  readonly value: number;
}

export interface U64Value {
  readonly kind: "u64";
  readonly value: number;
}

export interface I8Value {
  readonly kind: "i8";
  readonly value: number;
}

export interface I16Value {
  readonly kind: "i16";
  readonly value: number;
}

export interface I64Value {
  readonly kind: "i64";
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

export type TypeName = "U8" | "U16" | "U32" | "U64" | "I8" | "I16" | "I32" | "I64" | "Bool";

export type Token =
  | { type: "number"; value: number; u8?: boolean; u16?: boolean; u32?: boolean; u64?: boolean; i8?: boolean; i16?: boolean; i64?: boolean }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "%" | "=" | "+=" | "-=" | "*=" | "/=" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "!" | "&&" | "||" | "=>" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "identifier"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "colon"; value: ":" }
  | { type: "comma"; value: "," }
  | { type: "semicolon"; value: ";" };

export type AST =
  | { type: "number"; value: number; u8?: boolean; u16?: boolean; u32?: boolean; u64?: boolean; i8?: boolean; i16?: boolean; i64?: boolean }
  | { type: "boolean"; value: boolean }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&&" | "||"; left: AST; right: AST }
  | { type: "unary"; operator: "-" | "!"; operand: AST }
  | { type: "identifier"; name: string }
  | { type: "let"; name: string; mutable: boolean; typeName?: TypeName; value: AST }
  | { type: "assign"; name: string; operator: "=" | "+=" | "-=" | "*=" | "/="; value: AST }
  | { type: "if"; condition: AST; then: AST; else: AST | null }
  | { type: "while"; condition: AST; body: AST }
  | { type: "fn"; name: string; params: Param[]; returnType?: TypeName; body: AST }
  | { type: "call"; callee: AST; args: AST[] }
  | { type: "block"; statements: AST[] };
