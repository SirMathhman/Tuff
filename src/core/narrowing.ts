/**
 * Narrowing inference system.
 *
 * Extracts type narrowing information from expressions so that control flow
 * handlers (if, while, match) can propagate narrowed types into their branches.
 *
 * Example: `if (ptr is &I32)` produces NarrowingInfo for `ptr` → `&I32`
 * in the then-branch and the negative type (original minus `&I32`) in the else.
 */

import type { AstNode } from "./ast";
import type { Scope, Type } from "./types";
import { dynamic, isUnion, typesEqual, unionType } from "./types";

/** Describes how a variable is narrowed in a branch. */
export type NarrowingInfo = {
  /** Variable name being narrowed */
  variable: string;
  /** Type in the positive branch (e.g., &I32 from "ptr is &I32") */
  positiveType: Type;
  /** Type in the negative branch (original type minus positiveType) */
  negativeType: Type;
};

/**
 * Extract narrowing info from an expression.
 * Returns undefined if the expression doesn't produce narrowing.
 */
export function extractNarrowing(
  node: AstNode,
  scope: Scope,
): NarrowingInfo | undefined {
  if (node.kind === "typecheck") {
    return extractTypecheckNarrowing(node, scope);
  }
  return undefined;
}

/** Extract narrowing from a `x is T` typecheck expression. */
function extractTypecheckNarrowing(
  node: AstNode,
  scope: Scope,
): NarrowingInfo | undefined {
  if (node.kind !== "typecheck") return undefined;
  if (node.value.kind !== "identifier") return undefined;

  const variable = node.value.name;
  const decl = scope.declarations.get(variable);
  if (!decl || decl.kind !== "var" || !decl.type) return undefined;

  const originalType = decl.type;
  const positiveType = node.type; // Target type from `is T`
  const negativeType = computeNegativeType(originalType, positiveType);

  return { variable, positiveType, negativeType };
}

/**
 * Compute the negative type: original type minus the positive type.
 * For unions, removes the matching variant. Returns dynamic() if empty.
 */
export function computeNegativeType(original: Type, positive: Type): Type {
  if (isUnion(original)) {
    const remaining = original.variants.filter((v) => !typesEqual(v, positive));
    if (remaining.length === 0) return dynamic();
    if (remaining.length === 1) return remaining[0]!;
    return unionType(remaining);
  }
  // Non-union types can't be narrowed — return original
  return original;
}

/**
 * Create a new scope where a variable is narrowed to a specific type.
 * Does not mutate the base scope.
 */
export function narrowedScope(
  base: Scope,
  variable: string,
  narrowedType: Type,
): Scope {
  const declarations = new Map(base.declarations);
  const decl = declarations.get(variable);
  if (decl && decl.kind === "var") {
    declarations.set(variable, { ...decl, type: narrowedType });
  }
  return { declarations, typeParams: base.typeParams };
}
