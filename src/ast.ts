import type { BinaryOp } from "./grammar";
import type { Type } from "./types";

export type AstNode =
  | { kind: "number"; value: number; type?: Type }
  | { kind: "boolean"; value: boolean; type?: Type }
  | {
      kind: "binary";
      op: BinaryOp;
      left: AstNode;
      right: AstNode;
      type?: Type;
    }
  | { kind: "unary"; op: "-"; operand: AstNode; type?: Type }
  | { kind: "identifier"; name: string; type?: Type }
  | {
      kind: "let";
      name: string;
      value: AstNode;
      mutable: boolean;
      type?: Type;
    }
  | { kind: "assign"; name: string; value: AstNode }
  | { kind: "augassign"; name: string; op: "+"; value: AstNode }
  | { kind: "block"; statements: AstNode[]; type?: Type }
  | {
      kind: "if";
      condition: AstNode;
      then: AstNode;
      elseBranch: AstNode;
    }
  | { kind: "loop"; body: AstNode[] }
  | { kind: "break"; value: AstNode }
  | { kind: "while"; condition: AstNode; body: AstNode[] }
  | { kind: "typecheck"; value: AstNode; type: Type }
  | {
      kind: "fn";
      name: string;
      params: { name: string; type?: Type }[];
      returnType?: Type;
      body: AstNode;
    }
  | { kind: "call"; callee: AstNode; args: AstNode[] };
