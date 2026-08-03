export type Value = number | boolean | IntegerValue | BoolValue | FunctionValue | ArrayValue;

export type IntegerTypeName = "U8" | "U16" | "U32" | "U64" | "I8" | "I16" | "I32" | "I64";

export interface IntegerValue {
  readonly kind: IntegerTypeName;
  readonly value: number;
}

export interface BoolValue {
  readonly kind: "bool";
  readonly value: boolean;
}

export interface FunctionValue {
  readonly kind: "function";
  readonly name: string;
  readonly params: Param[];
  readonly returnType?: TypeName;
  readonly body: AST;
  readonly closure: unknown;
}

export interface ArrayValue {
  readonly kind: "array";
  readonly elementType: TypeName;
  readonly elements: Value[];
}

export interface Param {
  name: string;
  typeName?: TypeName;
}

export type TypeName = IntegerTypeName | "Bool" | ArrayTypeName;

export interface ArrayTypeName {
  readonly kind: "array";
  readonly elementType: TypeName;
  readonly size: number;
}

export interface NumberLiteral {
  value: number;
  typeName?: IntegerTypeName;
}

export type Token =
  | ({ type: "number" } & NumberLiteral)
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "%" | "=" | "+=" | "-=" | "*=" | "/=" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "!" | "&&" | "||" | "=>" | "is" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "bracket"; value: "[" | "]" }
  | { type: "identifier"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "colon"; value: ":" }
  | { type: "comma"; value: "," }
  | { type: "semicolon"; value: ";" };

export type AST =
  | ({ type: "number" } & NumberLiteral)
  | { type: "boolean"; value: boolean }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&&" | "||" | "is"; left: AST; right: AST }
  | { type: "unary"; operator: "-" | "!"; operand: AST }
  | { type: "identifier"; name: string }
  | { type: "typeRef"; name: TypeName }
  | { type: "let"; name: string; mutable: boolean; typeName?: TypeName; value: AST }
  | { type: "assign"; name: string; operator: "=" | "+=" | "-=" | "*=" | "/="; value: AST }
  | { type: "indexAssign"; target: AST; index: AST; operator: "=" | "+=" | "-=" | "*=" | "/="; value: AST }
  | { type: "if"; condition: AST; then: AST; else: AST | null }
  | { type: "while"; condition: AST; body: AST }
  | { type: "fn"; name: string; params: Param[]; returnType?: TypeName; body: AST }
  | { type: "call"; callee: AST; args: AST[] }
  | { type: "array"; elements: AST[] }
  | { type: "index"; target: AST; index: AST }
  | { type: "block"; statements: AST[] };
