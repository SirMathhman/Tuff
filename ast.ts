export type Expr =
  | { kind: "number"; value: number }
  | { kind: "binary"; op: "+" | "-" | "*"; left: Expr; right: Expr }
  | { kind: "variable"; name: string }
  | { kind: "let"; name: string; value: Expr }
  | { kind: "block"; statements: Expr[] };
