import type { TuffError } from "../errors.ts";
import type {
  ArrayIndexNode,
  ArrayNode,
  FieldAccessNode,
  StructLiteralNode,
  TuffExpr,
  TupleIndexNode,
  TupleNode,
} from "../ast.ts";
import {
  arrayElementKinds,
  findDeclared,
  findStruct,
  inferKind,
  literalIndex,
  structFieldKinds,
  tupleElementKinds,
  type DeclaredBinding,
  type ExprCheckContext,
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
 * @param context - The expression check context.
 * @returns The array binding and its name, or a TuffError.
 */
export function resolveIndex(
  expr: ArrayIndexNode,
  line: number,
  context: ExprCheckContext,
): ResolvedDeref | TuffError {
  if (expr.operand.kind !== "Identifier") {
    return { kind: "InvalidArrayIndexAssign", name: "", line };
  }
  const error = findUndeclared(expr.operand, line, context);
  if (error) return error;
  const indexError = findUndeclared(expr.index, line, context);
  if (indexError) return indexError;
  const operandKind = inferKind(
    expr.operand,
    context.scopes,
    context.resolveDeref,
  );
  if (operandKind !== null && operandKind !== "array") {
    const name = expr.operand.kind === "Identifier" ? expr.operand.name : "";
    return { kind: "InvalidArrayIndexAssign", name, line };
  }
  const indexCheck = checkArrayIndex(expr, line, context.scopes);
  if (indexCheck) return indexCheck;
  const declared = findDeclared(context.scopes, expr.operand.name);
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
 * @param context - The expression check context.
 * @returns An UnidentifiedIdentifier, InvalidReference, InvalidDeref, or
 * ImmutableAssignment error if one is found, else null.
 */
export function findUndeclared(
  expr: TuffExpr,
  line: number,
  context: ExprCheckContext,
): TuffError | null {
  if (expr.kind === "Identifier") {
    if (!findDeclared(context.scopes, expr.name)) {
      return { kind: "UnidentifiedIdentifier", name: expr.name, line };
    }
    return null;
  }
  if (expr.kind === "Is") {
    // The right operand is a kind name, not an expression; check only the left.
    return findUndeclared(expr.left, line, context);
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range"
  ) {
    const left = findUndeclared(expr.left, line, context);
    return left ?? findUndeclared(expr.right, line, context);
  }
  if (expr.kind === "Ref") {
    if (expr.operand.kind !== "Identifier") {
      return { kind: "InvalidReference", name: "", line };
    }
    const declared = findDeclared(context.scopes, expr.operand.name);
    if (!declared) {
      return { kind: "UnidentifiedIdentifier", name: expr.operand.name, line };
    }
    if (expr.mut && !declared.mut) {
      return { kind: "ImmutableAssignment", name: expr.operand.name, line };
    }
    return null;
  }
  if (expr.kind === "Deref") {
    const resolved = resolveDeref(expr.operand, line, context.scopes);
    if ("kind" in resolved) return resolved;
    return null;
  }
  if (expr.kind === "Tuple" || expr.kind === "TupleIndex") {
    return checkTupleExpr(expr, line, context);
  }
  if (expr.kind === "Array" || expr.kind === "ArrayIndex") {
    return checkArrayExpr(expr, line, context);
  }
  if (expr.kind === "StructLiteral") {
    return checkStructLiteral(expr, line, context);
  }
  if (expr.kind === "FieldAccess") {
    return checkFieldAccess(expr, line, context);
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
  if (expr.kind === "FieldAccess") {
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
  if (expr.kind === "StructLiteral") {
    for (const field of expr.fields) {
      const error = checkNumberSuffixes(field.value, line);
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
    expr.kind === "Range"
  ) {
    const left = checkRangeLiterals(expr.left, line, scopes);
    return left ?? checkRangeLiterals(expr.right, line, scopes);
  }
  if (expr.kind === "Is") {
    // The right operand is a kind name, not an expression; check only the left.
    return checkRangeLiterals(expr.left, line, scopes);
  }
  if (expr.kind === "Ref" || expr.kind === "Deref") {
    return checkRangeLiterals(expr.operand, line, scopes);
  }
  if (expr.kind === "TupleIndex") {
    return checkRangeLiterals(expr.operand, line, scopes);
  }
  if (expr.kind === "FieldAccess") {
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
  if (expr.kind === "StructLiteral") {
    for (const field of expr.fields) {
      const error = checkRangeLiterals(field.value, line, scopes);
      if (error) return error;
    }
  }
  return null;
}

/**
 * Check each element of a tuple or array literal for undeclared identifiers.
 * @param elements - The element expressions to check.
 * @param line - The 1-based line number.
 * @param context - The expression check context.
 * @returns An UnidentifiedIdentifier error if one is found, else null.
 */
function checkElements(
  elements: TuffExpr[],
  line: number,
  context: ExprCheckContext,
): TuffError | null {
  for (const element of elements) {
    const error = findUndeclared(element, line, context);
    if (error) return error;
  }
  return null;
}

/**
 * Check a tuple or tuple-index expression for undeclared identifiers and
 * out-of-bounds indices.
 * @param expr - The tuple or tuple-index expression to check.
 * @param line - The 1-based line number.
 * @param context - The expression check context.
 * @returns An UnidentifiedIdentifier or InvalidTupleIndex error, else null.
 */
function checkTupleExpr(
  expr: TupleNode | TupleIndexNode,
  line: number,
  context: ExprCheckContext,
): TuffError | null {
  if (expr.kind === "Tuple") {
    return checkElements(expr.elements, line, context);
  }
  const error = findUndeclared(expr.operand, line, context);
  if (error) return error;
  const kinds = tupleElementKinds(
    expr.operand,
    context.scopes,
    context.resolveDeref,
  );
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
 * @param context - The expression check context.
 * @returns An UnidentifiedIdentifier, TypeMismatch, or InvalidArrayIndex
 * error, else null.
 */
function checkArrayExpr(
  expr: ArrayNode | ArrayIndexNode,
  line: number,
  context: ExprCheckContext,
): TuffError | null {
  if (expr.kind === "Array") {
    return checkElements(expr.elements, line, context);
  }
  const error = findUndeclared(expr.operand, line, context);
  if (error) return error;
  const indexError = findUndeclared(expr.index, line, context);
  if (indexError) return indexError;
  return checkArrayIndex(expr, line, context.scopes);
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

/**
 * Check a struct literal: the struct name must be declared, and each field
 * must name a declared field whose kind matches the initializer's kind.
 * @param expr - The struct literal to check.
 * @param line - The 1-based line number.
 * @param context - The expression check context.
 * @returns An UnidentifiedIdentifier or TypeMismatch error, else null.
 */
function checkStructLiteral(
  expr: StructLiteralNode,
  line: number,
  context: ExprCheckContext,
): TuffError | null {
  const def = findStruct(context.structs, expr.name);
  if (!def) {
    return { kind: "UnidentifiedIdentifier", name: expr.name, line };
  }
  for (const field of expr.fields) {
    const expected = def.fields[field.name];
    if (expected === undefined) {
      return { kind: "UnidentifiedIdentifier", name: field.name, line };
    }
    const error = findUndeclared(field.value, line, context);
    if (error) return error;
    const kind = inferKind(field.value, context.scopes, context.resolveDeref);
    if (kind !== null && kind !== expected) {
      return { kind: "TypeMismatch", name: field.name, line };
    }
  }
  return null;
}

/**
 * Check a field access: the operand must be a struct, and the field must
 * name a declared field of that struct.
 * @param expr - The field access to check.
 * @param line - The 1-based line number.
 * @param context - The expression check context.
 * @returns An UnidentifiedIdentifier or TypeMismatch error, else null.
 */
function checkFieldAccess(
  expr: FieldAccessNode,
  line: number,
  context: ExprCheckContext,
): TuffError | null {
  const operandError = findUndeclared(expr.operand, line, context);
  if (operandError) return operandError;
  const kinds = structFieldKinds(
    expr.operand,
    context.scopes,
    context.resolveDeref,
  );
  if (kinds && kinds[expr.field] === undefined) {
    const name =
      expr.operand.kind === "Identifier" ? expr.operand.name : expr.field;
    return { kind: "UnidentifiedIdentifier", name, line };
  }
  return null;
}
