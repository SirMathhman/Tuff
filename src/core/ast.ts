import type { BinaryOp } from "./grammar";
import type { TokenPos } from "../lexer/tokenizer";
import type { Type } from "./types";

/**
 * LValue: a writable location in the program.
 * Used as the assignment target in `assign` nodes.
 * - `identifier`: simple variable (x = v)
 * - `index`: array element (arr[i] = v), recursively targets another LValue
 * - `deref`: pointer dereference (*ptr = v)
 * - `field`: struct field (pt.x = v), recursively targets another LValue
 */
export type LValue =
  | { kind: "identifier"; name: string; pos?: TokenPos }
  | { kind: "index"; target: LValue; index: AstNode; pos?: TokenPos }
  | { kind: "deref"; operand: AstNode; pos?: TokenPos }
  | { kind: "field"; target: LValue; field: string; pos?: TokenPos };

export type AstNode =
  | { kind: "number"; value: number; type?: Type; pos?: TokenPos }
  | { kind: "boolean"; value: boolean; type?: Type; pos?: TokenPos }
  | { kind: "null"; type?: Type; pos?: TokenPos }
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
  | { kind: "this"; type?: Type; pos?: TokenPos }
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
  | { kind: "yield"; value: AstNode; pos?: TokenPos }
  | { kind: "return"; value: AstNode; pos?: TokenPos }
  | { kind: "continue"; pos?: TokenPos }
  | {
    kind: "typealias";
    name: string;
    type: Type;
    typeParams?: string[];
    pos?: TokenPos;
  }
  | { kind: "while"; condition: AstNode; body: AstNode[]; pos?: TokenPos }
  | { kind: "typecheck"; value: AstNode; type: Type; pos?: TokenPos }
  | {
      kind: "fn";
      name: string;
      typeParams?: string[];
      params: { name: string; type: Type }[];
      returnType?: Type;
      body: AstNode;
      pos?: TokenPos;
    }
  | { kind: "call"; callee: AstNode; args: AstNode[]; pos?: TokenPos }
  | {
      kind: "method_call";
      receiver: AstNode;
      method: string;
      args: AstNode[];
      pos?: TokenPos;
    }
  | { kind: "array"; elements: AstNode[]; type?: Type; pos?: TokenPos }
  | {
      kind: "struct";
      name: string;
      typeParams?: string[];
      fields: { name: string; type?: Type; mutable?: boolean }[];
      pos?: TokenPos;
    }
  | {
      kind: "struct_instantiation";
      name: string;
      typeArgs?: Type[];
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
    }
  | {
      kind: "match";
      target: AstNode;
      cases: { pattern: AstNode | "_"; body: AstNode }[];
      type?: Type;
      pos?: TokenPos;
    }
  | {
      kind: "tuple";
      elements: AstNode[];
      type?: Type;
      pos?: TokenPos;
    }
  | {
      kind: "enum";
      name: string;
      variants: string[];
      pos?: TokenPos;
    }
  | {
      kind: "enum_access";
      enum: string;
      variant: string;
      type?: Type;
      pos?: TokenPos;
    }
  | {
      kind: "tuple_access";
      target: AstNode;
      index: number;
      type?: Type;
      pos?: TokenPos;
    };
