import type { TuffExpr, TuffStatement } from "../ast.ts";
import { bool } from "../values.ts";
import {
  findDeclared,
  inferKind,
  kindName,
  type DeclaredBinding,
  type ResolveDeref,
} from "./kinds.ts";
import { isNumberSuffix, suffixSpec } from "./suffixes.ts";

/**
 * Constant-fold the `is` type-tests in a single statement's own expressions,
 * in place. Nested statements are folded separately by the check walk, which
 * calls this with the correct scope stack for each statement. A suffix test
 * matches the left literal's suffix; a kind test (e.g. `Bool`) matches the
 * left's statically inferred kind. The result is always a boolean literal.
 * @param stmt - The statement to fold.
 * @param scopes - The stack of declared bindings for this statement.
 * @param resolveDeref - The dereference resolver, for kind inference.
 */
export function foldStatement(
  stmt: TuffStatement,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): void {
  if (stmt.kind === "Let" || stmt.kind === "Return") {
    stmt.value = foldExpr(stmt.value, scopes, resolveDeref);
  } else if (stmt.kind === "Assign") {
    stmt.value = foldExpr(stmt.value, scopes, resolveDeref);
  } else if (stmt.kind === "If" || stmt.kind === "While") {
    stmt.condition = foldExpr(stmt.condition, scopes, resolveDeref);
  } else if (stmt.kind === "For") {
    stmt.range = foldExpr(stmt.range, scopes, resolveDeref);
  }
}

/**
 * Fold the `is` type-tests in an expression, returning the (possibly
 * replaced) expression.
 * @param expr - The expression to fold.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns The folded expression: a boolean literal where an `Is` node was,
 * the same node otherwise.
 */
function foldExpr(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): TuffExpr {
  if (expr.kind === "Is") {
    const left = foldExpr(expr.left, scopes, resolveDeref);
    const ref = refTest(expr.right);
    const matched =
      ref !== null
        ? isRefMatch(
            left,
            ref,
            expr.right.kind === "Ref" ? expr.right.mut : false,
            scopes,
          )
        : isMatch(
            left,
            expr.right.kind === "Identifier" ? expr.right.name : "",
            scopes,
            resolveDeref,
          );
    return { kind: "Literal", value: bool(matched) };
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range"
  ) {
    expr.left = foldExpr(expr.left, scopes, resolveDeref);
    expr.right = foldExpr(expr.right, scopes, resolveDeref);
    return expr;
  }
  if (
    expr.kind === "Ref" ||
    expr.kind === "Deref" ||
    expr.kind === "TupleIndex"
  ) {
    expr.operand = foldExpr(expr.operand, scopes, resolveDeref);
    return expr;
  }
  if (expr.kind === "ArrayIndex") {
    expr.operand = foldExpr(expr.operand, scopes, resolveDeref);
    expr.index = foldExpr(expr.index, scopes, resolveDeref);
    return expr;
  }
  if (expr.kind === "Tuple" || expr.kind === "Array") {
    expr.elements = expr.elements.map((element) =>
      foldExpr(element, scopes, resolveDeref),
    );
    return expr;
  }
  return expr;
}

/**
 * The number-suffix an expression statically carries, or undefined if it
 * carries none. A literal carries its own suffix; an identifier carries the
 * suffix of the binding it names; an `Add` carries a suffix only when both
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
