import type { TuffError } from "../errors.ts";
import type { IsNode, TuffExpr } from "../ast.ts";
import {
  findDeclared,
  inferKind,
  kindName,
  type DeclaredBinding,
  type ResolveDeref,
} from "./kinds.ts";
import { isNumberSuffix, suffixSpec } from "./suffixes.ts";

/**
 * Whether a folded `is` left operand matches its right operand: a reference
 * chain, a tuple of element tests (matched element-wise against a tuple
 * left), or a bare suffix/kind name.
 * @param left - The folded left operand.
 * @param right - The type-test right operand.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns True if the left operand matches the right operand.
 */
export function isRightMatch(
  left: TuffExpr,
  right: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): boolean {
  if (right.kind === "Ref") {
    const ref = refTest(right);
    if (ref !== null) return isRefMatch(left, ref, right.mut, scopes);
  }
  if (right.kind === "Tuple") {
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
  if (right.kind === "ArrayTest") {
    if (left.kind !== "Array") return false;
    if (left.elements.length !== testLength(right.length)) return false;
    for (const element of left.elements) {
      if (!isRightMatch(element, right.element, scopes, resolveDeref)) {
        return false;
      }
    }
    return true;
  }
  return isMatch(
    left,
    right.kind === "Identifier" ? right.name : "",
    scopes,
    resolveDeref,
  );
}

/**
 * Check the right operand of an `is` type-test: a bare operand must name a
 * legal number suffix or a legal kind name; a reference operand (`&Suffix`)
 * must name a legal number suffix; a tuple operand must be a tuple of legal
 * element tests; an array operand (`[Suffix; N]`) must name a legal element
 * test and a non-negative integer literal length.
 * @param expr - The Is expression to inspect.
 * @param line - The 1-based line number.
 * @returns An InvalidNumberSuffix or InvalidExpression error if the right
 * operand names neither a legal suffix nor a legal kind, or names an illegal
 * array-test length, else null.
 */
export function checkIsOperand(expr: IsNode, line: number): TuffError | null {
  if (expr.right.kind === "Tuple") {
    for (const element of expr.right.elements) {
      const error = checkIsElement(element, line);
      if (error) return error;
    }
    return null;
  }
  if (expr.right.kind === "ArrayTest") {
    const elementError = checkIsElement(expr.right.element, line);
    if (elementError) return elementError;
    if (testLength(expr.right.length) === null) {
      return { kind: "InvalidExpression", expression: "", line };
    }
    return null;
  }
  return checkIsElement(expr.right, line);
}

/**
 * Check one element of an `is` type-test right operand: a reference chain
 * must name a legal number suffix; a bare operand must name a legal number
 * suffix or a legal kind name.
 * @param element - The element expression to inspect.
 * @param line - The 1-based line number.
 * @returns An InvalidNumberSuffix error if the element names neither a legal
 * suffix nor a legal kind, else null.
 */
export function checkIsElement(
  element: TuffExpr,
  line: number,
): TuffError | null {
  if (element.kind === "Ref") {
    let current: TuffExpr = element;
    while (current.kind === "Ref") current = current.operand;
    const name = current.kind === "Identifier" ? current.name : "";
    if (!isNumberSuffix(name)) {
      return { kind: "InvalidNumberSuffix", suffix: name, line };
    }
    return null;
  }
  const name = element.kind === "Identifier" ? element.name : "";
  if (kindName(name) === null && !isNumberSuffix(name)) {
    return { kind: "InvalidNumberSuffix", suffix: name, line };
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
 * The length an array type-test names, or null if the length operand is not
 * a non-negative integer literal.
 * @param expr - The length expression to inspect.
 * @returns The named length, or null.
 */
function testLength(expr: TuffExpr): number | null {
  const value = literalNumber(expr);
  if (value === null) return null;
  return Number.isInteger(value) && value >= 0 ? value : null;
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
 * A reference type-test: the depth of the `&` chain and the suffix the
 * innermost identifier names.
 */
interface RefTest {
  depth: number;
  name: string;
}

/**
 * The reference type-test a right operand names, or null if the operand is
 * not a reference test. A reference type-test operand is one or more nested
 * `&` whose innermost operand is an identifier naming a suffix (e.g. `&U16`,
 * `&&U8`).
 * @param expr - The type-test right operand to inspect.
 * @returns The reference test (depth and named suffix), or null if the
 * operand is not a chain of references to a suffix.
 */
function refTest(expr: TuffExpr): RefTest | null {
  let depth = 0;
  let current = expr;
  while (current.kind === "Ref") {
    depth++;
    current = current.operand;
  }
  if (depth === 0 || current.kind !== "Identifier") return null;
  return { depth, name: current.name };
}

/**
 * Whether a folded `is` left operand matches a reference type-test: the left
 * must be a `&` whose operand is an identifier, and the binding's reference
 * depth (the explicit `&` plus its `refTo` chain) must equal the test's depth,
 * with the innermost binding carrying the named suffix. Only the outermost
 * `&`'s mutability is compared: a `&mut` left reference also matches a `&`
 * test, but a non-`mut` left reference does not match a `&mut` test.
 * @param left - The folded left operand.
 * @param ref - The reference test (depth and named suffix).
 * @param rightMut - Whether the outermost reference test names a `&mut`.
 * @param scopes - The stack of declared bindings.
 * @returns True if the left operand's reference depth and innermost suffix
 * match the test, with a compatible outermost mutability.
 */
function isRefMatch(
  left: TuffExpr,
  ref: RefTest,
  rightMut: boolean,
  scopes: Record<string, DeclaredBinding>[],
): boolean {
  if (left.kind !== "Ref") return false;
  if (left.operand.kind !== "Identifier") return false;
  if (rightMut && !left.mut) return false;
  let depth = 1;
  let binding = findDeclared(scopes, left.operand.name);
  while (binding !== null && binding.refTo !== undefined) {
    depth++;
    const next = findDeclared(scopes, binding.refTo);
    if (next === null) return false;
    binding = next;
  }
  if (depth !== ref.depth) return false;
  return binding?.suffix === ref.name;
}
