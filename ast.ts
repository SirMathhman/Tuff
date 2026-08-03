export type Expr =
  | { kind: "number"; value: number }
  | { kind: "binary"; op: "+" | "-" | "*"; left: Expr; right: Expr };
