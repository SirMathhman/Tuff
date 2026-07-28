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
 * Infer the type of an expression node, using the symbol table for identifier lookups.
 * Returns a Type, or dynamic() for unknown/untyped expressions.
 */
function inferType(node: AstNode, symbols: Map<string, SymbolInfo>): Type {
  const d = dynamic();
  switch (node.kind) {
    case "number":
      return node.type ?? d;
    case "boolean":
      return bool();
    case "unary":
      return inferType(node.operand, symbols);
    case "binary": {
      const leftType = inferType(node.left, symbols);
      const rightType = inferType(node.right, symbols);
      if (isDynamic(leftType)) return rightType;
      if (isDynamic(rightType)) return leftType;
      // Return the wider numeric type
      return getBits(leftType) >= getBits(rightType) ? leftType : rightType;
    }
    case "identifier": {
      const sym = symbols.get(node.name);
      return sym?.type ?? d;
    }
    case "let":
      return inferType(node.value, symbols);
    case "assign":
    case "augassign":
      return inferType(node.value, symbols);
    case "block": {
      const last = node.statements[node.statements.length - 1];
      return last ? inferType(last, symbols) : d;
    }
    case "if":
      return inferType(node.then, symbols);
    case "loop":
      return d;
    case "break":
      return inferType(node.value, symbols);
    case "while":
      return d;
    case "typecheck":
      return inferType(node.value, symbols);
  }
}

/**
 * Check that a value expression is compatible with the declared type.
 */
function checkTypeCompatibility(
  node: AstNode,
  declaredType: Type | undefined,
  symbols: Map<string, SymbolInfo>,
): void {
  if (!declaredType) return;
  const valueType = inferType(node, symbols);
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

    case "let": {
      analyzeNode(node.value, symbols);
      const inferred = inferType(node.value, symbols);
      checkTypeCompatibility(node.value, node.type, symbols);
      // Store the more specific type: declared type if present, otherwise inferred
      const resolvedType =
        node.type ?? (isDynamic(inferred) ? undefined : inferred);
      symbols.set(node.name, { type: resolvedType, mutable: node.mutable });
      break;
    }

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
