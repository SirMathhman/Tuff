export type AstNode =
  | { kind: "number"; value: number }
  | { kind: "binary"; op: "+" | "-" | "*"; left: AstNode; right: AstNode };
