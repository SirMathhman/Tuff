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
import { checkIsOperand } from "./is-match.ts";
import { isNumberSuffix, suffixSpec } from "./suffixes.ts";

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
  if (expr.kind === "Is") {
    // The right operand is a suffix name, not an identifier; check only the left.
    return findUndeclared(expr.left, line, scopes);
  }
  if (expr.kind === "ArrayTest") {
    // An array type-test is only legal as an `is` right operand.
    return { kind: "InvalidExpression", expression: "", line };
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
 * Check the type suffixes in an expression: a literal suffix outside the
 * legal set is an InvalidNumberSuffix, a value outside the suffix's range is
 * a NumberOutOfRange, and an `is` right operand that is not a legal suffix
 * name is an InvalidNumberSuffix.
 * @param expr - The expression to inspect.
 * @param line - The 1-based line number.
 * @returns An InvalidNumberSuffix or NumberOutOfRange error if a literal
 * carries an illegal suffix or an out-of-range value, or an `is` test names
 * an illegal suffix, else null.
 */
export function checkNumberSuffixes(
  expr: TuffExpr,
  line: number,
): TuffError | null {
  if (expr.kind === "Literal" && expr.suffix !== undefined) {
    if (!isNumberSuffix(expr.suffix)) {
      return { kind: "InvalidNumberSuffix", suffix: expr.suffix, line };
    }
    const spec = suffixSpec(expr.suffix);
    if ("min" in spec && expr.value.kind === "number") {
      if (expr.value.value < spec.min || expr.value.value > spec.max) {
        return {
          kind: "NumberOutOfRange",
          value: expr.value.value,
          suffix: expr.suffix,
          line,
        };
      }
    }
  }
  if (expr.kind === "Is") {
    const error = checkIsOperand(expr, line);
    if (error) return error;
    return checkNumberSuffixes(expr.left, line);
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range"
  ) {
    const left = checkNumberSuffixes(expr.left, line);
    return left ?? checkNumberSuffixes(expr.right, line);
  }
  if (expr.kind === "Ref" || expr.kind === "Deref") {
    return checkNumberSuffixes(expr.operand, line);
  }
  if (expr.kind === "TupleIndex") {
    return checkNumberSuffixes(expr.operand, line);
  }
  if (expr.kind === "ArrayIndex") {
    const operand = checkNumberSuffixes(expr.operand, line);
    return operand ?? checkNumberSuffixes(expr.index, line);
  }
  if (expr.kind === "Tuple" || expr.kind === "Array") {
    for (const element of expr.elements) {
      const error = checkNumberSuffixes(element, line);
      if (error) return error;
    }
  }
  return null;
}

/**
 * Check the bounds of every range literal in an expression: a non-numeric
 * bound is a TypeMismatch.
 * @param expr - The expression to inspect.
 * @param line - The 1-based line number.
 * @param scopes - The stack of declared bindings.
 * @returns A TypeMismatch error if a range literal has a non-numeric bound,
 * else null.
 */
export function checkRangeLiterals(
  expr: TuffExpr,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
): TuffError | null {
  if (expr.kind === "Range") {
    const startKind = inferKind(expr.left, scopes, resolveDeref);
    if (startKind !== null && startKind !== "number") {
      return { kind: "TypeMismatch", name: "", line };
    }
    const endKind = inferKind(expr.right, scopes, resolveDeref);
    if (endKind !== null && endKind !== "number") {
      return { kind: "TypeMismatch", name: "", line };
    }
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range" ||
    expr.kind === "Is"
  ) {
    const left = checkRangeLiterals(expr.left, line, scopes);
    return left ?? checkRangeLiterals(expr.right, line, scopes);
  }
  if (expr.kind === "Ref" || expr.kind === "Deref") {
    return checkRangeLiterals(expr.operand, line, scopes);
  }
  if (expr.kind === "TupleIndex") {
    return checkRangeLiterals(expr.operand, line, scopes);
  }
  if (expr.kind === "ArrayIndex") {
    const operand = checkRangeLiterals(expr.operand, line, scopes);
    return operand ?? checkRangeLiterals(expr.index, line, scopes);
  }
  if (expr.kind === "Tuple" || expr.kind === "Array") {
    for (const element of expr.elements) {
      const error = checkRangeLiterals(element, line, scopes);
      if (error) return error;
    }
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
