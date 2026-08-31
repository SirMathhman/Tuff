export type AstNode =
  | { type: "number"; value: number }
  | { type: "add"; left: AstNode; right: AstNode }
  | { type: "sub"; left: AstNode; right: AstNode }
  | { type: "mul"; left: AstNode; right: AstNode };
