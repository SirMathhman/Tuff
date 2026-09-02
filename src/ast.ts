export type Expr =
  | { kind: "ident"; name: string }
  | { kind: "lit"; value: string }
  | { kind: "addressOf"; target: Expr }
  | { kind: "deref"; target: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "member"; object: Expr; property: string }
  | { kind: "call"; callee: Expr; args: Expr[] };

export type Statement =
  | { kind: "let"; name: string; init: Expr }
  | { kind: "letMut"; name: string; init: Expr }
  | { kind: "assign"; name: string; value: Expr }
  | { kind: "derefAssign"; target: Expr; value: Expr }
  | { kind: "block"; statements: Statement[] }
  | { kind: "expr"; value: Expr };
