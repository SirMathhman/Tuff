/**
 * The Tuff abstract syntax tree.
 *
 * A plain, serializable data structure (discriminated union of node types)
 * shared by the parser (which builds it) and the evaluator (which computes
 * values from it).
 */

/** A numeric literal node. */
export type NumberNode = { kind: "number"; value: number };

/** A binary arithmetic node. */
export type BinaryNode = {
  kind: "binary";
  op: "plus" | "minus" | "times";
  left: AstNode;
  right: AstNode;
};

/** Any Tuff AST node. */
export type AstNode = NumberNode | BinaryNode;
