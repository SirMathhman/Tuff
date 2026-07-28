export type AstNode =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "||"; left: AstNode; right: AstNode }
  | { kind: "identifier"; name: string }
  | { kind: "let"; name: string; value: AstNode }
  | { kind: "block"; statements: AstNode[] };
