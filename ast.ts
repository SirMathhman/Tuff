export type Expr =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "variable"; name: string }
  | { kind: "binary"; op: "+" | "-" | "*" | "||"; left: Expr; right: Expr }
  | { kind: "block"; statements: Stmt[] };

export type Stmt =
  | { kind: "let"; name: string; mutable: boolean; value: Expr }
  | { kind: "assign"; name: string; value: Expr }
  | { kind: "expr"; expr: Expr }
  | { kind: "block"; statements: Stmt[] };
