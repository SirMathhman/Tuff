import type { TuffError } from "../errors.ts";
import type { IsNode, KindName, TuffExpr } from "../ast.ts";
import {
  findDeclared,
  inferKind,
  kindName,
  type DeclaredBinding,
  type ResolveDeref,
} from "./kinds.ts";
import { isNumberSuffix, suffixSpec } from "./suffixes.ts";

/**
 * Whether a folded `is` left operand matches its right operand's kind name:
 * a bare suffix/kind name, a reference chain to a suffix, a tuple of element
 * tests (matched element-wise against a tuple left), or an array element test
 * and length (matched against an array left of the same length).
 * @param left - The folded left operand.
 * @param right - The type-test right operand's kind name.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns True if the left operand matches the kind name.
 */
export function isRightMatch(
  left: TuffExpr,
  right: KindName,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): boolean {
  if (right.kind === "KindNameRef") {
    return isRefMatch(left, right.depth, right.mut, right.name, scopes);
  }
  if (right.kind === "KindNameTuple") {
    if (left.kind !== "Tuple") return false;
    if (left.elements.length !== right.elements.length) return false;
    for (let i = 0; i < left.elements.length; i++) {
      const leftElement = left.elements[i];
      const rightElement = right.elements[i];
      if (leftElement === undefined || rightElement === undefined) {
        return false;
      }
      if (!isRightMatch(leftElement, rightElement, scopes, resolveDeref)) {
        return false;
      }
    }
    return true;
  }
  if (right.kind === "KindNameArray") {
    if (left.kind !== "Array") return false;
    if (left.elements.length !== right.length) return false;
    for (const element of left.elements) {
      if (!isRightMatch(element, right.element, scopes, resolveDeref)) {
        return false;
      }
    }
    return true;
  }
  return isMatch(left, right.name, scopes, resolveDeref);
}

/**
 * Whether a `let` initializer matches its `: KindName` annotation: like an
 * `is` type-test, except an unsuffixed number literal is coerced to a named
 * number suffix instead of failing to match it.
 * @param value - The initializer expression.
 * @param annotation - The declared kind name.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns True if the initializer matches the annotation.
 */
export function annotationMatch(
  value: TuffExpr,
  annotation: KindName,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): boolean {
  if (annotation.kind === "KindNameRef") {
    return isRefMatch(
      value,
      annotation.depth,
      annotation.mut,
      annotation.name,
      scopes,
    );
  }
  if (annotation.kind === "KindNameTuple") {
    if (value.kind !== "Tuple") return false;
    if (value.elements.length !== annotation.elements.length) return false;
    for (let i = 0; i < value.elements.length; i++) {
      const element = value.elements[i];
      const elementName = annotation.elements[i];
      if (element === undefined || elementName === undefined) return false;
      if (!annotationMatch(element, elementName, scopes, resolveDeref)) {
        return false;
      }
    }
    return true;
  }
  if (annotation.kind === "KindNameArray") {
    if (value.kind !== "Array") return false;
    if (value.elements.length !== annotation.length) return false;
    for (const element of value.elements) {
      if (!annotationMatch(element, annotation.element, scopes, resolveDeref)) {
        return false;
      }
    }
    return true;
  }
  return annotationBareMatch(value, annotation.name, scopes, resolveDeref);
}

/**
 * Whether an initializer matches a bare annotation name: a number suffix
 * accepts an unsuffixed number literal (coercing it) or an expression
 * carrying that suffix; a kind name requires the inferred kind to match.
 * @param value - The initializer expression.
 * @param name - The suffix or kind name the annotation names.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns True if the initializer matches the named suffix or kind.
 */
function annotationBareMatch(
  value: TuffExpr,
  name: string,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): boolean {
  if (isNumberSuffix(name)) {
    if (value.kind === "Literal" && value.value.kind === "number") {
      return value.suffix === undefined || value.suffix === name;
    }
    return exprSuffix(value, scopes) === name;
  }
  const kind = kindName(name);
  if (kind === null) return false;
  return inferKind(value, scopes, resolveDeref) === kind;
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
 * @returns An InvalidNumberSuffix error if a name is neither a legal suffix
 * nor a legal kind, else null.
 */
export function checkKindName(name: KindName, line: number): TuffError | null {
  if (name.kind === "KindNameRef") {
    if (!isNumberSuffix(name.name)) {
      return { kind: "InvalidNumberSuffix", suffix: name.name, line };
    }
    return null;
  }
  if (name.kind === "KindNameTuple") {
    for (const element of name.elements) {
      const error = checkKindName(element, line);
      if (error) return error;
    }
    return null;
  }
  if (name.kind === "KindNameArray") {
    return checkKindName(name.element, line);
  }
  if (kindName(name.name) === null && !isNumberSuffix(name.name)) {
    return { kind: "InvalidNumberSuffix", suffix: name.name, line };
  }
  return null;
}

/**
 * Whether a folded `is` left operand matches the named suffix or kind.
 * @param left - The folded left operand.
 * @param name - The suffix or kind name the test names.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns True if the left operand matches the named suffix or kind.
 */
function isMatch(
  left: TuffExpr,
  name: string,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): boolean {
  if (isNumberSuffix(name)) {
    return exprSuffix(left, scopes) === name;
  }
  const kind = kindName(name);
  if (kind === null) return false;
  return inferKind(left, scopes, resolveDeref) === kind;
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
