export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "=" | "+=" | "-=" | "*=" | "/=" | "<" | ">" | "<=" | ">=" | "==" | "!=" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "identifier"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "semicolon"; value: ";" };

export type AST =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "binary"; operator: "+" | "-" | "*" | "/" | "<" | ">" | "<=" | ">=" | "==" | "!="; left: AST; right: AST }
  | { type: "unary"; operator: "-"; operand: AST }
  | { type: "identifier"; name: string }
  | { type: "let"; name: string; mutable: boolean; value: AST }
  | { type: "assign"; name: string; operator: "=" | "+=" | "-=" | "*=" | "/="; value: AST }
  | { type: "block"; statements: AST[] };
