export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EvalError =
  | { kind: "invalid-token"; index: number; token: string }
  | { kind: "unexpected-end"; index: number }
  | { kind: "unbalanced-paren"; index: number }
  | { kind: "unknown-variable"; index: number; name: string }
  | { kind: "immutable-variable"; index: number; name: string };

export type Token = { value: string; index: number };

export type AstNode =
  | { kind: "num"; value: number; index: number }
  | { kind: "var"; name: string; index: number }
  | { kind: "neg"; operand: AstNode; index: number }
  | {
      kind: "binary";
      op: "+" | "-" | "*";
      left: AstNode;
      right: AstNode;
      index: number;
    }
  | {
      kind: "let";
      name: string;
      mut: boolean;
      value: AstNode;
      body: AstNode;
      index: number;
    }
  | { kind: "assign"; name: string; value: AstNode; index: number }
  | { kind: "seq"; first: AstNode; rest: AstNode; index: number }
  | { kind: "block"; body: AstNode; index: number };
