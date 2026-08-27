import type { TuffError } from "../errors.ts";
import type {
  ArrayIndexNode,
  ArrayNode,
  TuffExpr,
  TupleIndexNode,
  TupleNode,
} from "../ast.ts";
import {
  arrayElementKinds,
  findDeclared,
  inferKind,
  literalIndex,
  tupleElementKinds,
  type DeclaredBinding,
  type ResolvedDeref,
} from "./kinds.ts";

/**
 * Resolve a dereference operand to the binding it references.
 * @param operand - The operand expression of the dereference.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns The referenced binding and name, or a TuffError.
 */
export function resolveDeref(
  operand: TuffExpr,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): ResolvedDeref | TuffError {
  if (operand.kind !== "Identifier") {
    return { kind: "InvalidDeref", name: "", line };
  }
  const declared = findDeclared(scopes, operand.name);
  if (!declared) {
    return { kind: "UnidentifiedIdentifier", name: operand.name, line };
  }
  if (!declared.refTo) {
    return { kind: "InvalidDeref", name: operand.name, line };
  }
  const referenced = findDeclared(scopes, declared.refTo);
  if (!referenced) {
    return { kind: "UnidentifiedIdentifier", name: declared.refTo, line };
  }
  return { binding: referenced, name: declared.refTo };
}

/**
 * Resolve an array-index assignment target to the binding it writes to.
 * @param expr - The ArrayIndex target expression.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns The array binding and its name, or a TuffError.
 */
export function resolveIndex(
  expr: ArrayIndexNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): ResolvedDeref | TuffError {
  if (expr.operand.kind !== "Identifier") {
    return { kind: "InvalidArrayIndexAssign", name: "", line };
  }
  const error = findUndeclared(expr.operand, line, scopes);
  if (error) return error;
  const indexError = findUndeclared(expr.index, line, scopes);
  if (indexError) return indexError;
  const operandKind = inferKind(expr.operand, scopes, resolveDeref);
  if (operandKind !== null && operandKind !== "array") {
    const name = expr.operand.kind === "Identifier" ? expr.operand.name : "";
    return { kind: "InvalidArrayIndexAssign", name, line };
  }
  const indexCheck = checkArrayIndex(expr, line, scopes);
  if (indexCheck) return indexCheck;
  const declared = findDeclared(scopes, expr.operand.name);
  if (!declared) {
    return { kind: "UnidentifiedIdentifier", name: expr.operand.name, line };
  }
  return { binding: declared, name: expr.operand.name };
}

/**
 * Find an undeclared identifier, an invalid reference, or an invalid `&mut`
 * in an expression.
 * @param expr - The expression to inspect.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier, InvalidReference, InvalidDeref, or
 * ImmutableAssignment error if one is found, else null.
 */
export function findUndeclared(
  expr: TuffExpr,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (expr.kind === "Identifier") {
    if (!findDeclared(scopes, expr.name)) {
      return { kind: "UnidentifiedIdentifier", name: expr.name, line };
    }
    return null;
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range"
  ) {
    const left = findUndeclared(expr.left, line, scopes);
    return left ?? findUndeclared(expr.right, line, scopes);
  }
  if (expr.kind === "Ref") {
    if (expr.operand.kind !== "Identifier") {
      return { kind: "InvalidReference", name: "", line };
    }
    const declared = findDeclared(scopes, expr.operand.name);
    if (!declared) {
      return { kind: "UnidentifiedIdentifier", name: expr.operand.name, line };
    }
    if (expr.mut && !declared.mut) {
      return { kind: "ImmutableAssignment", name: expr.operand.name, line };
    }
    return null;
  }
  if (expr.kind === "Deref") {
    const resolved = resolveDeref(expr.operand, line, scopes);
    if ("kind" in resolved) return resolved;
    return null;
  }
  if (expr.kind === "Tuple" || expr.kind === "TupleIndex") {
    return checkTupleExpr(expr, line, scopes);
  }
  if (expr.kind === "Array" || expr.kind === "ArrayIndex") {
    return checkArrayExpr(expr, line, scopes);
  }
  return null;
}

/**
 * Check each element of a tuple or array literal for undeclared identifiers.
 * @param elements - The element expressions to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier error if one is found, else null.
 */
function checkElements(
  elements: TuffExpr[],
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  for (const element of elements) {
    const error = findUndeclared(element, line, scopes);
    if (error) return error;
  }
  return null;
}

/**
 * Check a tuple or tuple-index expression for undeclared identifiers and
 * out-of-bounds indices.
 * @param expr - The tuple or tuple-index expression to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier or InvalidTupleIndex error, else null.
 */
function checkTupleExpr(
  expr: TupleNode | TupleIndexNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (expr.kind === "Tuple") {
    return checkElements(expr.elements, line, scopes);
  }
  const error = findUndeclared(expr.operand, line, scopes);
  if (error) return error;
  const kinds = tupleElementKinds(expr.operand, scopes, resolveDeref);
  if (kinds && expr.index >= kinds.length) {
    const name = expr.operand.kind === "Identifier" ? expr.operand.name : "";
    return { kind: "InvalidTupleIndex", name, index: expr.index, line };
  }
  return null;
}

/**
 * Check an array or array-index expression for undeclared identifiers, a
 * non-numeric index, and out-of-bounds literal indices.
 * @param expr - The array or array-index expression to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns An UnidentifiedIdentifier, TypeMismatch, or InvalidArrayIndex
 * error, else null.
 */
function checkArrayExpr(
  expr: ArrayNode | ArrayIndexNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (expr.kind === "Array") {
    return checkElements(expr.elements, line, scopes);
  }
  const error = findUndeclared(expr.operand, line, scopes);
  if (error) return error;
  const indexError = findUndeclared(expr.index, line, scopes);
  if (indexError) return indexError;
  return checkArrayIndex(expr, line, scopes);
}

/**
 * Check an array-index expression's index: a non-numeric index is a
 * TypeMismatch, and an out-of-bounds literal index is an InvalidArrayIndex.
 * @param expr - The array-index expression to check.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns A TypeMismatch or InvalidArrayIndex error, else null.
 */
function checkArrayIndex(
  expr: ArrayIndexNode,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  const indexKind = inferKind(expr.index, scopes, resolveDeref);
  if (indexKind !== null && indexKind !== "number") {
    const name = expr.operand.kind === "Identifier" ? expr.operand.name : "";
    return { kind: "TypeMismatch", name, line };
  }
  const kinds = arrayElementKinds(expr.operand, scopes, resolveDeref);
  const index = literalIndex(expr.index);
  if (kinds && index !== null && index >= kinds.length) {
    const name = expr.operand.kind === "Identifier" ? expr.operand.name : "";
    return { kind: "InvalidArrayIndex", name, index, line };
  }
  return null;
}
