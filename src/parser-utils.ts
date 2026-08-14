import type { AstNode } from "./ast";
import type { Token } from "./tokenizer";

/**
 * Shared parsing utilities extracted from the Parser class.
 * These are generic helpers that don't depend on parser state.
 */

/**
 * Build a struct-access node from a dot chain.
 */
export function buildStructField(node: AstNode, field: string): AstNode {
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

/**
 * Check if the tokens at the given position form `TypeName.this`.
 * Returns the type name if so, or null otherwise.
 */
export function isTypeNameThis(
  tokens: readonly Token[],
  pos: number,
): string | null {
  if (
    tokens[pos]?.[0] === "id" &&
    tokens[pos + 1]?.[0] === "op" &&
    tokens[pos + 1]![1] === "." &&
    tokens[pos + 2]?.[0] === "kw" &&
    tokens[pos + 2]![1] === "this"
  ) {
    return tokens[pos]![1] as string;
  }
  return null;
}
