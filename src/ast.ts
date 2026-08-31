export type AstNode =
  | { type: "number"; value: number }
  | { type: "add"; left: AstNode; right: AstNode };
