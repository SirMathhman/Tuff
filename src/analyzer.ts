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
 * Infer the type of an expression node.
 * Returns a type name (e.g., "U8", "Bool") or undefined for dynamic/unknown types.
 */
function inferType(node: AstNode): string | undefined {
  switch (node.kind) {
    case "number":
      return node.typeSuffix;
    case "boolean":
      return "Bool";
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

/** Check if a type name is a boolean type. */
function isBoolType(typeName: string): boolean {
  return typeName === "Bool";
}

/** Throw a type mismatch error. */
function typeMismatch(valueType: string, declaredType: string, detail?: string): never {
  const msg = detail ? ` (${detail})` : "";
  throw new Error(`Type mismatch: cannot assign ${valueType} to ${declaredType}${msg}`);
}

/**
 * Check that a value expression is compatible with the declared type.
 * - Bool: must match exactly (no widening/narrowing).
 * - Numeric: narrower type can be assigned to wider declared type.
 */
function checkTypeCompatibility(
  node: AstNode,
  declaredType: string | undefined,
): void {
  if (!declaredType) return;
  const valueType = inferType(node);
  if (!valueType) return; // No type on value, assume compatible

  // Bool must match exactly
  if (isBoolType(declaredType)) {
    if (!isBoolType(valueType)) typeMismatch(valueType, declaredType);
    return;
  }
  if (isBoolType(valueType)) typeMismatch(valueType, declaredType);

  // Numeric types: narrower can fit in wider
  const suffixBits = getTypeBits(valueType);
  const declaredBits = getTypeBits(declaredType);
  if (suffixBits === 0 || declaredBits === 0) return; // Unknown type, skip
  if (suffixBits > declaredBits)
    typeMismatch(valueType, declaredType, "wider type cannot fit");
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
