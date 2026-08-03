export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "=" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "identifier"; value: string }
  | { type: "semicolon"; value: ";" };

export type AST =
  | { type: "number"; value: number }
  | { type: "binary"; operator: "+" | "-" | "*" | "/"; left: AST; right: AST }
  | { type: "unary"; operator: "-"; operand: AST }
  | { type: "identifier"; name: string }
  | { type: "let"; name: string; value: AST }
  | { type: "block"; statements: AST[] };
