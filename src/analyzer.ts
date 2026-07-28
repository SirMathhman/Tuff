import type { AstNode } from "./ast";
import type { Type } from "./types";
import {
  bool,
  dynamic,
  isAssignable,
  isDynamic,
  typeName,
  voidType,
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

/** A declaration in the symbol table (variable or function). */
interface Declaration {
  kind: "var" | "fn";
  type?: Type;
  mutable?: boolean;
}

/**
 * Resolve the type of a node, storing it on the AST where supported.
 * Also builds the declaration table and validates type compatibility.
 */
function resolveType(
  node: AstNode,
  declarations: Map<string, Declaration>,
): Type {
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
      const operandType = resolveType(node.operand, declarations);
      node.type = operandType;
      return operandType;
    }

    case "binary": {
      const leftType = resolveType(node.left, declarations);
      const rightType = resolveType(node.right, declarations);

      // Arithmetic ops: widen operand types
      if (isArithmeticOp(node.op)) {
        checkNotBool(leftType, node.op);
        checkNotBool(rightType, node.op);
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
      const decl = declarations.get(node.name);
      node.type = decl?.type ?? dynamic();
      return node.type;
    }

    case "let": {
      const existing = declarations.get(node.name);
      if (existing && existing.kind === "fn") {
        throw new Error(`Duplicate declaration: '${node.name}'`);
      }
      // Reject void blocks (ending with declarations) as let values
      if (node.value.kind === "block") {
        const last = node.value.statements[node.value.statements.length - 1];
        if (last?.kind === "let") {
          throw new Error(
            "Block used as expression cannot end with a declaration",
          );
        }
      }
      const valueType = resolveType(node.value, declarations);
      // Validate type compatibility
      if (node.type !== undefined) {
        checkAssignable(valueType, node.type);
      }
      // Store the more specific type: declared type if present, otherwise inferred
      const resolvedType =
        node.type ?? (isDynamic(valueType) ? undefined : valueType);
      declarations.set(node.name, {
        kind: "var",
        type: resolvedType,
        mutable: node.mutable,
      });
      // Write the resolved type back onto the AST node for let
      return resolvedType ?? dynamic();
    }

    case "assign": {
      const valueType = resolveType(node.value, declarations);
      const decl = declarations.get(node.name);
      if (decl?.type) checkAssignable(valueType, decl.type);
      return valueType;
    }

    case "augassign": {
      const valueType = resolveType(node.value, declarations);
      const decl = declarations.get(node.name);
      if (decl?.type) {
        checkNotBool(decl.type, node.op);
        checkNotBool(valueType, node.op);
        checkAssignable(valueType, decl.type);
      }
      return valueType;
    }

    case "block": {
      let result: Type = dynamic();
      for (const stmt of node.statements) {
        result = resolveType(stmt, declarations);
      }
      // Blocks ending with a declaration have void type.
      const last = node.statements[node.statements.length - 1];
      if (last?.kind === "let") {
        node.type = voidType();
        return node.type;
      }
      return result;
    }

    case "if": {
      resolveType(node.condition, declarations);
      const thenType = resolveType(node.then, declarations);
      const elseType = resolveType(node.elseBranch, declarations);
      return widen(thenType, elseType);
    }

    case "loop": {
      for (const stmt of node.body) resolveType(stmt, declarations);
      return dynamic();
    }

    case "while": {
      resolveType(node.condition, declarations);
      for (const stmt of node.body) resolveType(stmt, declarations);
      return dynamic();
    }

    case "break":
      return resolveType(node.value, declarations);

    case "typecheck": {
      resolveType(node.value, declarations);
      // node.type holds the target type for the typecheck. Don't overwrite it.
      // The result type is always bool().
      return bool();
    }
    case "fn": {
      const existing = declarations.get(node.name);
      if (existing) {
        throw new Error(`Duplicate declaration: '${node.name}'`);
      }
      const bodyType = resolveType(node.body, declarations);
      declarations.set(node.name, { kind: "fn", type: bodyType });
      return dynamic();
    }
    case "call": {
      for (const arg of node.args) resolveType(arg, declarations);
      const callee = node.callee as { kind: "identifier"; name: string };
      const decl = declarations.get(callee.name);
      return decl?.type ?? dynamic();
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

/** Reject boolean operands for arithmetic operators. */
function checkNotBool(t: Type, op: string): void {
  if (!isDynamic(t) && t.kind === "bool")
    throw new Error(
      `Type mismatch: cannot use arithmetic operator '${op}' on ${typeName(t)}`,
    );
}

/** Check if an operator is a comparison operation. */
function isComparisonOp(op: string): boolean {
  return ["<", ">", "==", "!=", "<=", ">="].includes(op);
}

/** Check if an operator is a logical operation. */
function isLogicalOp(op: string): boolean {
  return ["||", "&&"].includes(op);
}

/** Validate that a value type is assignable to a target type. */
function checkAssignable(valueType: Type, targetType: Type): void {
  if (!isDynamic(valueType) && !isAssignable(valueType, targetType)) {
    throw new Error(
      `Type mismatch: cannot assign ${typeName(valueType)} to ${typeName(targetType)}`,
    );
  }
}

/**
 * Analyze an AST: resolve types, validate compatibility, build symbol table.
 * Throws on semantic errors.
 */
export function analyze(ast: AstNode): void {
  const declarations = new Map<string, Declaration>();
  resolveType(ast, declarations);
}
