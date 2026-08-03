export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" };

export type AST =
  | { type: "number"; value: number }
  | { type: "binary"; operator: "+" | "-" | "*" | "/"; left: AST; right: AST }
  | { type: "unary"; operator: "-"; operand: AST };
