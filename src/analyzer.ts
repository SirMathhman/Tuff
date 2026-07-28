import type { AstNode } from "./ast";
import type { Type } from "./types";
import {
  bool,
  dynamic,
  getBits,
  isAssignable,
  isDynamic,
  typeName,
} from "./types";

/**
 * Semantic analysis stage: validates type compatibility and builds a symbol table.
 * Called after parsing, before evaluation.
 */

/** Information about a declared variable. */
interface SymbolInfo {
  type?: Type;
  mutable: boolean;
}

/**
 * Infer the type of an expression node.
 * Returns a Type, or dynamic() for unknown/untyped expressions.
 */
function inferType(node: AstNode): Type {
  const d = dynamic();
  switch (node.kind) {
    case "number":
      return node.type ?? d;
    case "boolean":
      return bool();
    case "unary":
      return inferType(node.operand);
    case "binary": {
      const leftType = inferType(node.left);
      const rightType = inferType(node.right);
      if (isDynamic(leftType)) return rightType;
      if (isDynamic(rightType)) return leftType;
      // Return the wider numeric type
      return getBits(leftType) >= getBits(rightType) ? leftType : rightType;
    }
    case "identifier":
      return d;
    case "let":
      return inferType(node.value);
    case "assign":
    case "augassign":
      return inferType(node.value);
    case "block": {
      const last = node.statements[node.statements.length - 1];
      return last ? inferType(last) : d;
    }
    case "if":
      return inferType(node.then);
    case "loop":
      return d;
    case "break":
      return inferType(node.value);
    case "while":
      return d;
  }
}

/**
 * Check that a value expression is compatible with the declared type.
 */
function checkTypeCompatibility(
  node: AstNode,
  declaredType: Type | undefined,
): void {
  if (!declaredType) return;
  const valueType = inferType(node);
  if (isDynamic(valueType)) return; // No type on value, assume compatible
  if (!isAssignable(valueType, declaredType)) {
    throw new Error(
      `Type mismatch: cannot assign ${typeName(valueType)} to ${typeName(declaredType)}`,
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
