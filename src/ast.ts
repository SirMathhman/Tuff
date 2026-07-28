import type { BinaryOp } from "./grammar";
import type { TokenPos } from "./tokenizer";
import type { Type } from "./types";

/**
 * LValue: a writable location in the program.
 * Used as the assignment target in `assign` nodes.
 * - `identifier`: simple variable (x = v)
 * - `index`: array element (arr[i] = v), recursively targets another LValue
 * - `deref`: pointer dereference (*ptr = v)
 */
export type LValue =
  | { kind: "identifier"; name: string; pos?: TokenPos }
  | { kind: "index"; target: LValue; index: AstNode; pos?: TokenPos }
  | { kind: "deref"; operand: AstNode; pos?: TokenPos };

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
      op: "-" | "&" | "&mut" | "*";
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
  | {
      kind: "assign";
      target: LValue;
      value: AstNode;
      pos?: TokenPos;
    }
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
  | { kind: "call"; callee: AstNode; args: AstNode[]; pos?: TokenPos }
  | { kind: "array"; elements: AstNode[]; type?: Type; pos?: TokenPos }
  | {
      kind: "struct";
      name: string;
      fields: { name: string; type?: Type }[];
      pos?: TokenPos;
    }
  | {
      kind: "struct_instantiation";
      name: string;
      fields: { name: string; value: AstNode }[];
      type?: Type;
      pos?: TokenPos;
    }
  | {
      kind: "field_access";
      target: AstNode;
      field: string;
      type?: Type;
      pos?: TokenPos;
    }
  | {
      kind: "index";
      target: AstNode;
      index: AstNode;
      type?: Type;
      pos?: TokenPos;
    };
