/**
 * The Tuff abstract syntax tree.
 *
 * A plain, serializable data structure (discriminated union of node types)
 * shared by the parser (which builds it) and the evaluator (which computes
 * values from it).
 */

import type { SourcePosition } from "./position.js";

/** A numeric literal node. */
export type NumberNode = { kind: "number"; value: number };

/** A binary arithmetic node. */
export type BinaryNode = {
  kind: "binary";
  op: "plus" | "minus" | "times";
  left: AstNode;
  right: AstNode;
};

/** A variable reference node. */
export type VariableNode = { kind: "variable"; name: string; pos: SourcePosition };

/** An assignment statement node: `name = value`. */
export type AssignNode = {
  kind: "assign";
  name: string;
  pos: SourcePosition;
  value: AstNode;
};

/** A `let` binding node: `let [mut] name = initializer; stmt*`. */
export type LetNode = {
  kind: "let";
  name: string;
  /** Whether the binding may be reassigned. */
  mut: boolean;
  initializer: AstNode;
  /** The `;`-separated statements after the initializer. */
  statements: AstNode[];
};

/** Any Tuff AST node. */
export type AstNode = NumberNode | BinaryNode | VariableNode | LetNode | AssignNode;
