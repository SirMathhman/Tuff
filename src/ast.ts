import type { BinaryOp } from "./grammar";

export type AstNode =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | {
      kind: "binary";
      op: BinaryOp;
      left: AstNode;
      right: AstNode;
    }
  | { kind: "identifier"; name: string }
  | { kind: "let"; name: string; value: AstNode; mutable: boolean }
  | { kind: "assign"; name: string; value: AstNode }
  | { kind: "augassign"; name: string; op: "+"; value: AstNode }
  | { kind: "block"; statements: AstNode[] }
  | {
      kind: "if";
      condition: AstNode;
      then: AstNode;
      elseBranch: AstNode;
    }
  | { kind: "loop"; body: AstNode[] }
  | { kind: "break"; value: AstNode }
  | { kind: "while"; condition: AstNode; body: AstNode[] };
