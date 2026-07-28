import type { BinaryOp } from "./grammar";
import type { TokenPos } from "./tokenizer";
import type { Type } from "./types";

export type AstNode =
  | { kind: "number"; value: number; type?: Type; pos?: TokenPos }
  | { kind: "boolean"; value: boolean; type?: Type; pos?: TokenPos }
  | {
      kind: "binary";
      op: BinaryOp;
      left: AstNode;
      right: AstNode;
      type?: Type;
      pos?: TokenPos;
    }
  | {
      kind: "unary";
      op: "-" | "&" | "*";
      operand: AstNode;
      type?: Type;
      pos?: TokenPos;
    }
  | { kind: "identifier"; name: string; type?: Type; pos?: TokenPos }
  | {
      kind: "let";
      name: string;
      value: AstNode;
      mutable: boolean;
      type?: Type;
      pos?: TokenPos;
    }
  | { kind: "assign"; name: string; value: AstNode; pos?: TokenPos }
  | { kind: "augassign"; name: string; op: "+"; value: AstNode; pos?: TokenPos }
  | { kind: "block"; statements: AstNode[]; type?: Type; pos?: TokenPos }
  | {
      kind: "if";
      condition: AstNode;
      then: AstNode;
      elseBranch: AstNode;
      pos?: TokenPos;
    }
  | { kind: "loop"; body: AstNode[]; pos?: TokenPos }
  | { kind: "break"; value: AstNode; pos?: TokenPos }
  | { kind: "while"; condition: AstNode; body: AstNode[]; pos?: TokenPos }
  | { kind: "typecheck"; value: AstNode; type: Type; pos?: TokenPos }
  | {
      kind: "fn";
      name: string;
      params: { name: string; type?: Type }[];
      returnType?: Type;
      body: AstNode;
      pos?: TokenPos;
    }
  | { kind: "call"; callee: AstNode; args: AstNode[]; pos?: TokenPos };
