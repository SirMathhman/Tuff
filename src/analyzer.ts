import type { AstNode } from "./ast";
import { getTypeBits } from "./grammar";

/**
 * Semantic analysis stage: validates type compatibility and builds a symbol table.
 * Called after parsing, before evaluation.
 */

/** Information about a declared variable. */
interface SymbolInfo {
  type?: string;
  mutable: boolean;
}

/**
 * Infer the type suffix of an expression node.
 * Returns the widest type suffix found, or undefined for dynamic/unknown types.
 */
function inferType(node: AstNode): string | undefined {
  switch (node.kind) {
    case "number":
      return node.typeSuffix;
    case "boolean":
      return undefined;
    case "unary":
      return inferType(node.operand);
    case "binary": {
      // Result type is the widest of the two operands
      const leftType = inferType(node.left);
      const rightType = inferType(node.right);
      if (!leftType) return rightType;
      if (!rightType) return leftType;
      // Return the wider type
      return getTypeBits(leftType) >= getTypeBits(rightType)
        ? leftType
        : rightType;
    }
    case "identifier":
      // Can't resolve without symbol table — handled in analyzeLet
      return undefined;
    case "let":
      return inferType(node.value);
    case "assign":
    case "augassign":
      return inferType(node.value);
    case "block": {
      const last = node.statements[node.statements.length - 1];
      return last ? inferType(last) : undefined;
    }
    case "if":
      return inferType(node.then);
    case "loop":
      return undefined;
    case "break":
      return inferType(node.value);
    case "while":
      return undefined;
  }
}

/**
 * Check that a value expression is compatible with the declared type.
 * A value of narrower type can be assigned to a wider declared type.
 * A value of wider type cannot be assigned to a narrower declared type.
 */
function checkTypeCompatibility(
  node: AstNode,
  declaredType: string | undefined,
): void {
  if (!declaredType) return;
  const valueSuffix = inferType(node);
  if (!valueSuffix) return; // No suffix on value, assume compatible
  const suffixBits = getTypeBits(valueSuffix);
  const declaredBits = getTypeBits(declaredType);
  if (suffixBits === 0 || declaredBits === 0) return; // Unknown type, skip
  if (suffixBits > declaredBits) {
    throw new Error(
      `Type mismatch: cannot assign ${valueSuffix} to ${declaredType} (wider type cannot fit)`,
    );
  }
}

/**
 * Recursively walk the AST, building a symbol table and performing semantic checks.
 */
function analyzeNode(node: AstNode, symbols: Map<string, SymbolInfo>): void {
  switch (node.kind) {
    case "number":
    case "boolean":
      break;

    case "unary":
      analyzeNode(node.operand, symbols);
      break;

    case "binary":
      analyzeNode(node.left, symbols);
      analyzeNode(node.right, symbols);
      break;

    case "identifier":
      break; // Resolution happens at evaluation time

    case "let":
      analyzeNode(node.value, symbols);
      checkTypeCompatibility(node.value, node.type);
      symbols.set(node.name, { type: node.type, mutable: node.mutable });
      break;

    case "assign":
    case "augassign":
      analyzeNode(node.value, symbols);
      break;

    case "block":
      for (const stmt of node.statements) {
        analyzeNode(stmt, symbols);
      }
      break;

    case "if":
      analyzeNode(node.condition, symbols);
      analyzeNode(node.then, symbols);
      if (node.elseBranch) {
        analyzeNode(node.elseBranch, symbols);
      }
      break;

    case "loop":
      for (const stmt of node.body) {
        analyzeNode(stmt, symbols);
      }
      break;

    case "break":
      analyzeNode(node.value, symbols);
      break;

    case "while":
      analyzeNode(node.condition, symbols);
      for (const stmt of node.body) {
        analyzeNode(stmt, symbols);
      }
      break;
  }
}

/**
 * Analyze an AST: validate type compatibility and build symbol table.
 * Throws on semantic errors.
 */
export function analyze(ast: AstNode): Map<string, SymbolInfo> {
  const symbols = new Map<string, SymbolInfo>();
  analyzeNode(ast, symbols);
  return symbols;
}
