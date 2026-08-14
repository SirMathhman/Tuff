import type { AstNode } from "./ast";

/**
 * Shared parsing utilities extracted from the Parser class.
 * These are generic helpers that don't depend on parser state.
 */

/**
 * Build a struct-access node from a dot chain.
 */
export function buildStructField(
  node: AstNode,
  field: string,
): AstNode {
  return { type: "struct-access", struct: node, field };
}

/**
 * Build a scope-access node from a dot chain.
 */
export function buildScopeField(node: AstNode, field: string): AstNode {
  return { type: "scope-access", scope: node, field };
}

/**
 * Build a tuple-access node from a numeric index.
 */
export function buildTupleIndex(node: AstNode, index: number): AstNode {
  return { type: "tuple-access", tuple: node, index };
}
