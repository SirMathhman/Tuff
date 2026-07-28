import type { AstNode } from "./ast";
import type { Type } from "./types";
import {
  bool,
  dynamic,
  isAssignable,
  isDynamic,
  typeName,
  widen,
} from "./types";

/**
 * Semantic analysis stage: resolves all type information onto AST nodes,
 * validates type compatibility, and builds a symbol table.
 *
 * Single-pass bottom-up approach:
 * 1. Resolve child types recursively
 * 2. Compute result type and write it onto the AST node
 * 3. Context propagation: dynamic operands inherit from concrete siblings
 * 4. Build symbol table with inferred types
 * 5. Validate type compatibility on declarations
 */

/** Information about a declared variable. */
interface SymbolInfo {
  type?: Type;
  mutable: boolean;
}

/**
 * Resolve the type of a node, storing it on the AST where supported.
 * Also builds the symbol table and validates type compatibility.
 */
function resolveType(node: AstNode, symbols: Map<string, SymbolInfo>): Type {
  switch (node.kind) {
    case "number":
      // Keep un-suffixed as dynamic so context propagation works.
      // The I32 default is applied at the typecheck site.
      node.type = node.type ?? dynamic();
      return node.type;

    case "boolean":
      node.type = bool();
      return node.type;

    case "unary": {
      const operandType = resolveType(node.operand, symbols);
      node.type = operandType;
      return operandType;
    }

    case "binary": {
      const leftType = resolveType(node.left, symbols);
      const rightType = resolveType(node.right, symbols);

      // Arithmetic ops: widen operand types
      if (isArithmeticOp(node.op)) {
        if (!isDynamic(leftType) && leftType.kind === "bool")
          throw new Error(
            `Type mismatch: cannot use arithmetic operator '${node.op}' on ${typeName(leftType)}`,
          );
        if (!isDynamic(rightType) && rightType.kind === "bool")
          throw new Error(
            `Type mismatch: cannot use arithmetic operator '${node.op}' on ${typeName(rightType)}`,
          );
        const result = widen(leftType, rightType);
        // Context propagation: dynamic operand inherits from concrete sibling
        if (isDynamic(leftType) && !isDynamic(rightType))
          setNodeType(node.left, rightType);
        if (isDynamic(rightType) && !isDynamic(leftType))
          setNodeType(node.right, leftType);
        node.type = result;
        return result;
      }

      // Comparison ops: result is bool
      if (isComparisonOp(node.op)) {
        node.type = bool();
        return bool();
      }

      // Logical ops: propagate operand types through
      if (isLogicalOp(node.op)) {
        const result = widen(leftType, rightType);
        node.type = result;
        return result;
      }

      // Fallback
      node.type = dynamic();
      return dynamic();
    }

    case "identifier": {
      const sym = symbols.get(node.name);
      node.type = sym?.type ?? dynamic();
      return node.type;
    }

    case "let": {
      const valueType = resolveType(node.value, symbols);
      // Validate type compatibility
      if (node.type !== undefined) {
        // node.type is the declared type annotation
        if (!isDynamic(valueType) && !isAssignable(valueType, node.type)) {
          throw new Error(
            `Type mismatch: cannot assign ${typeName(valueType)} to ${typeName(node.type)}`,
          );
        }
      }
      // Store the more specific type: declared type if present, otherwise inferred
      const resolvedType =
        node.type ?? (isDynamic(valueType) ? undefined : valueType);
      symbols.set(node.name, { type: resolvedType, mutable: node.mutable });
      // Write the resolved type back onto the AST node for let
      return resolvedType ?? dynamic();
    }

    case "assign":
    case "augassign":
      return resolveType(node.value, symbols);

    case "block": {
      let result: Type = dynamic();
      for (const stmt of node.statements) {
        result = resolveType(stmt, symbols);
      }
      return result;
    }

    case "if": {
      resolveType(node.condition, symbols);
      const thenType = resolveType(node.then, symbols);
      const elseType = resolveType(node.elseBranch, symbols);
      return widen(thenType, elseType);
    }

    case "loop": {
      for (const stmt of node.body) resolveType(stmt, symbols);
      return dynamic();
    }

    case "while": {
      resolveType(node.condition, symbols);
      for (const stmt of node.body) resolveType(stmt, symbols);
      return dynamic();
    }

    case "break":
      return resolveType(node.value, symbols);

    case "typecheck": {
      resolveType(node.value, symbols);
      return dynamic();
    }
  }
}

/** Set type on a node if the node kind supports it. */
function setNodeType(node: AstNode, type: Type): void {
  switch (node.kind) {
    case "number":
    case "boolean":
    case "unary":
    case "identifier":
      node.type = type;
      break;
  }
}

/** Check if an operator is an arithmetic operation. */
function isArithmeticOp(op: string): boolean {
  return ["+", "-", "*", "/"].includes(op);
}

/** Check if an operator is a comparison operation. */
function isComparisonOp(op: string): boolean {
  return ["<", ">", "==", "!=", "<=", ">="].includes(op);
}

/** Check if an operator is a logical operation. */
function isLogicalOp(op: string): boolean {
  return ["||", "&&"].includes(op);
}

/**
 * Analyze an AST: resolve types, validate compatibility, build symbol table.
 * Throws on semantic errors.
 */
export function analyze(ast: AstNode): Map<string, SymbolInfo> {
  const symbols = new Map<string, SymbolInfo>();
  resolveType(ast, symbols);
  return symbols;
}
