import type { TuffError } from "../errors.ts";
import type { IsNode, KindName, TuffExpr } from "../ast.ts";
import {
  findDeclared,
  findStruct,
  inferKind,
  kindName,
  type DeclaredBinding,
  type ExprCheckContext,
  type StructDef,
} from "./kinds.ts";
import { isNumberSuffix, suffixSpec } from "./suffixes.ts";

/**
 * Matches a bare kind name (a number suffix, a kind name, or a struct name)
 * against an expression. Passed to the kind-name matcher to break the mutual
 * recursion between the `is` type-test and the let-annotation matchers.
 */
type BareMatch = (
  value: TuffExpr,
  name: string,
  context: ExprCheckContext,
) => boolean;

/**
 * Whether a folded `is` left operand matches its right operand's kind name:
 * a bare suffix/kind name, a reference chain to a suffix, a tuple of element
 * tests (matched element-wise against a tuple left), or an array element test
 * and length (matched against an array left of the same length).
 * @param left - The folded left operand.
 * @param right - The type-test right operand's kind name.
 * @param context - The expression check context.
 * @returns True if the left operand matches the kind name.
 */
export function isRightMatch(
  left: TuffExpr,
  right: KindName,
  context: ExprCheckContext,
): boolean {
  return matchKindName(left, right, context, isMatch);
}

/**
 * Whether a `let` initializer matches its `: KindName` annotation: like an
 * `is` type-test, except an unsuffixed number literal is coerced to a named
 * number suffix instead of failing to match it.
 * @param value - The initializer expression.
 * @param annotation - The declared kind name.
 * @param context - The expression check context.
 * @returns True if the initializer matches the annotation.
 */
export function annotationMatch(
  value: TuffExpr,
  annotation: KindName,
  context: ExprCheckContext,
): boolean {
  return matchKindName(value, annotation, context, annotationBareMatch);
}

/**
 * Match an expression against a kind name: a reference chain to a suffix,
 * a tuple of element tests (matched element-wise against a tuple), or an
 * array element test and length (matched against an array of the same
 * length); a bare name is delegated to the given bare matcher.
 * @param value - The expression to match.
 * @param name - The kind name to match against.
 * @param context - The expression check context.
 * @param bareMatch - The bare-name matcher, for the leaf case.
 * @returns True if the expression matches the kind name.
 */
function matchKindName(
  value: TuffExpr,
  name: KindName,
  context: ExprCheckContext,
  bareMatch: BareMatch,
): boolean {
  if (name.kind === "KindNameRef") {
    return isRefMatch(value, name.depth, name.mut, name.name, context.scopes);
  }
  if (name.kind === "KindNameTuple") {
    if (value.kind !== "Tuple") return false;
    if (value.elements.length !== name.elements.length) return false;
    for (let i = 0; i < value.elements.length; i++) {
      const element = value.elements[i];
      const elementName = name.elements[i];
      if (element === undefined || elementName === undefined) return false;
      if (!matchKindName(element, elementName, context, bareMatch)) {
        return false;
      }
    }
    return true;
  }
  if (name.kind === "KindNameArray") {
    if (value.kind !== "Array") return false;
    if (value.elements.length !== name.length) return false;
    for (const element of value.elements) {
      if (!matchKindName(element, name.element, context, bareMatch)) {
        return false;
      }
    }
    return true;
  }
  return bareMatch(value, name.name, context);
}

/**
 * Whether an initializer matches a bare annotation name: a number suffix
 * accepts an unsuffixed number literal (coercing it) or an expression
 * carrying that suffix; a kind name requires the inferred kind to match.
 * @param value - The initializer expression.
 * @param name - The suffix, kind, or struct name the annotation names.
 * @param context - The expression check context.
 * @returns True if the initializer matches the named suffix, kind, or struct.
 */
function annotationBareMatch(
  value: TuffExpr,
  name: string,
  context: ExprCheckContext,
): boolean {
  if (isNumberSuffix(name)) {
    if (value.kind === "Literal" && value.value.kind === "number") {
      return value.suffix === undefined || value.suffix === name;
    }
    return exprSuffix(value, context.scopes) === name;
  }
  if (findStruct(context.structs, name)) {
    if (value.kind === "StructLiteral") return value.name === name;
    return inferKind(value, context) === "struct";
  }
  const kind = kindName(name);
  if (kind === null) return false;
  return inferKind(value, context) === kind;
}

/**
 * Check the right operand of an `is` type-test: a bare name must name a
 * legal number suffix or a legal kind name; a reference chain must name a
 * legal number suffix; a tuple or array of element tests must name legal
 * element tests. The parser guarantees an array test's length is a
 * non-negative integer literal.
 * @param expr - The Is expression to inspect.
 * @param line - The 1-based line number.
 * @returns An InvalidNumberSuffix error if a name is neither a legal suffix
 * nor a legal kind, else null.
 */
export function checkIsOperand(expr: IsNode, line: number): TuffError | null {
  return checkKindName(expr.right, line);
}

/**
 * Check a kind name: a bare name must name a legal number suffix or a legal
 * kind name; a reference chain must name a legal number suffix; a tuple or
 * array of element tests must name legal element tests.
 * @param name - The kind name to inspect.
 * @param line - The 1-based line number.
 * @param structs - The stack of declared structs, so a bare struct name is
 * legal.
 * @returns An InvalidNumberSuffix error if a name is neither a legal suffix,
 * a legal kind, nor a declared struct, else null.
 */
export function checkKindName(
  name: KindName,
  line: number,
  structs: Record<string, StructDef>[] = [],
): TuffError | null {
  if (name.kind === "KindNameRef") {
    if (!isNumberSuffix(name.name)) {
      return { kind: "InvalidNumberSuffix", suffix: name.name, line };
    }
    return null;
  }
  if (name.kind === "KindNameTuple") {
    for (const element of name.elements) {
      const error = checkKindName(element, line, structs);
      if (error) return error;
    }
    return null;
  }
  if (name.kind === "KindNameArray") {
    return checkKindName(name.element, line, structs);
  }
  if (
    kindName(name.name) === null &&
    !isNumberSuffix(name.name) &&
    !findStruct(structs, name.name)
  ) {
    return { kind: "InvalidNumberSuffix", suffix: name.name, line };
  }
  return null;
}

/**
 * Whether a folded `is` left operand matches the named suffix or kind.
 * @param left - The folded left operand.
 * @param name - The suffix, kind, or struct name the test names.
 * @param context - The expression check context.
 * @returns True if the left operand matches the named suffix, kind, or struct.
 */
function isMatch(
  left: TuffExpr,
  name: string,
  context: ExprCheckContext,
): boolean {
  if (isNumberSuffix(name)) {
    return exprSuffix(left, context.scopes) === name;
  }
  if (findStruct(context.structs, name)) {
    return inferKind(left, context) === "struct";
  }
  const kind = kindName(name);
  if (kind === null) return false;
  return inferKind(left, context) === kind;
}

/**
 * The number-suffix an expression statically carries, or undefined if it
 * carries none. A literal carries its own suffix; an identifier carries the
 * suffix of the binding it names; a dereference carries the suffix of the
 * binding its operand references; an `Add` carries a suffix only when both
 * operands carry the same one.
 * @param expr - The expression to inspect.
 * @param scopes - The stack of declared bindings.
 * @returns The suffix the expression carries, or undefined.
 */
function exprSuffix(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
): string | undefined {
  if (expr.kind === "Literal") return expr.suffix;
  if (expr.kind === "Identifier") {
    return findDeclared(scopes, expr.name)?.suffix;
  }
  if (expr.kind === "Deref") {
    if (expr.operand.kind !== "Identifier") return undefined;
    const binding = findDeclared(scopes, expr.operand.name);
    if (binding?.refTo === undefined) return undefined;
    return findDeclared(scopes, binding.refTo)?.suffix;
  }
  if (expr.kind === "Add") {
    const left = exprSuffix(expr.left, scopes);
    const right = exprSuffix(expr.right, scopes);
    if (left === undefined || left !== right) return undefined;
    const leftValue = literalNumber(expr.left);
    const rightValue = literalNumber(expr.right);
    if (leftValue === null || rightValue === null) return undefined;
    return inSuffixRange(leftValue + rightValue, left) ? left : undefined;
  }
  return undefined;
}

/**
 * The numeric value of a number literal, or null if the expression is not a
 * number literal.
 * @param expr - The expression to inspect.
 * @returns The literal's number, or null.
 */
function literalNumber(expr: TuffExpr): number | null {
  if (expr.kind !== "Literal") return null;
  if (expr.value.kind !== "number") return null;
  return expr.value.value;
}

/**
 * Whether a number falls within a legal suffix's inclusive value range.
 * Unbounded suffixes (the float suffixes) accept any number.
 * @param value - The number to test.
 * @param suffix - The suffix whose range to test against.
 * @returns True if the value is within the suffix's range.
 */
function inSuffixRange(value: number, suffix: string): boolean {
  if (!isNumberSuffix(suffix)) return false;
  const spec = suffixSpec(suffix);
  if ("unbounded" in spec) return true;
  return value >= spec.min && value <= spec.max;
}

/**
 * Whether a folded `is` left operand matches a reference kind name: the left
 * must be a `&` whose operand is an identifier, and the binding's reference
 * depth (the explicit `&` plus its `refTo` chain) must equal the test's depth,
 * with the innermost binding carrying the named suffix. Only the outermost
 * `&`'s mutability is compared: a `&mut` left reference also matches a `&`
 * test, but a non-`mut` left reference does not match a `&mut` test.
 * @param left - The folded left operand.
 * @param depth - The reference test's depth.
 * @param rightMut - Whether the outermost reference test names a `&mut`.
 * @param name - The suffix the innermost reference test names.
 * @param scopes - The stack of declared bindings.
 * @returns True if the left operand's reference depth and innermost suffix
 * match the test, with a compatible outermost mutability.
 */
function isRefMatch(
  left: TuffExpr,
  depth: number,
  rightMut: boolean,
  name: string,
  scopes: Record<string, DeclaredBinding>[],
): boolean {
  if (left.kind !== "Ref") return false;
  if (left.operand.kind !== "Identifier") return false;
  if (rightMut && !left.mut) return false;
  let leftDepth = 1;
  let binding = findDeclared(scopes, left.operand.name);
  while (binding !== null && binding.refTo !== undefined) {
    leftDepth++;
    const next = findDeclared(scopes, binding.refTo);
    if (next === null) return false;
    binding = next;
  }
  if (leftDepth !== depth) return false;
  return binding?.suffix === name;
}
