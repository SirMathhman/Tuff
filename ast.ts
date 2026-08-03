import type { BinaryOp } from "./operators";

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "variable"; name: string }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "if"; condition: Expr; then: Expr; otherwise: Expr | null }
  | { kind: "block"; statements: Stmt[] };

export type Stmt =
  | { kind: "let"; name: string; mutable: boolean; value: Expr }
  | { kind: "assign"; name: string; value: Expr }
  | { kind: "compound_assign"; name: string; op: BinaryOp; value: Expr }
  | { kind: "expr"; expr: Expr }
  | { kind: "block"; statements: Stmt[] };
