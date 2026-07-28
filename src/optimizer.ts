import type { AstNode } from "./ast";
import type { Type } from "./types";
import { bool, dynamic, isDynamic, widen } from "./types";

/**
 * Optimizer stage: resolves all type information onto AST nodes.
 * The evaluator reads pre-computed types — no type reasoning at runtime.
 *
 * Two-pass approach:
 * 1. Bottom-up: resolve child types, compute result type
 * 2. Context propagation: if a binary op has one concrete + one dynamic operand,
 *    set the dynamic operand's type to match the concrete one
 */

export function optimize(ast: AstNode): void {
  resolveType(ast);
}

/** Resolve the type of a node, storing it on the AST where supported. */
function resolveType(node: AstNode): Type {
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
      const operandType = resolveType(node.operand);
      node.type = operandType;
      return operandType;
    }

    case "binary": {
      const leftType = resolveType(node.left);
      const rightType = resolveType(node.right);

      // Arithmetic ops: widen operand types
      if (isArithmeticOp(node.op)) {
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

    case "identifier":
      node.type = node.type ?? dynamic();
      return node.type;

    case "let": {
      const valueType = resolveType(node.value);
      node.type = node.type ?? valueType;
      return node.type;
    }

    case "assign":
    case "augassign":
      return resolveType(node.value);

    case "block": {
      let result: Type = dynamic();
      for (const stmt of node.statements) {
        result = resolveType(stmt);
      }
      return result;
    }

    case "if": {
      resolveType(node.condition);
      const thenType = resolveType(node.then);
      const elseType = resolveType(node.elseBranch);
      return widen(thenType, elseType);
    }

    case "loop": {
      for (const stmt of node.body) resolveType(stmt);
      return dynamic();
    }

    case "while": {
      resolveType(node.condition);
      for (const stmt of node.body) resolveType(stmt);
      return dynamic();
    }

    case "break":
      return resolveType(node.value);

    case "typecheck": {
      resolveType(node.value);
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
