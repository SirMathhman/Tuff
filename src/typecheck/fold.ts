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
    const refName = refSuffix(expr.right);
    const matched =
      refName !== null
        ? isRefMatch(left, refName, scopes)
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
 * The suffix a reference type-test operand names, or null if the operand is
 * not a reference to a suffix. A reference type-test operand is a `&` whose
 * operand is an identifier naming a suffix (e.g. `&U16`).
 * @param expr - The type-test right operand to inspect.
 * @returns The named suffix, or null if the operand is not a reference test.
 */
function refSuffix(expr: TuffExpr): string | null {
  if (expr.kind !== "Ref") return null;
  if (expr.operand.kind !== "Identifier") return null;
  return expr.operand.name;
}

/**
 * Whether a folded `is` left operand matches a reference type-test: the left
 * must be a `&` whose operand is an identifier bound to a value carrying the
 * named suffix.
 * @param left - The folded left operand.
 * @param name - The suffix the reference test names.
 * @param scopes - The stack of declared bindings.
 * @returns True if the left operand is a reference to a binding carrying the
 * named suffix.
 */
function isRefMatch(
  left: TuffExpr,
  name: string,
  scopes: Record<string, DeclaredBinding>[],
): boolean {
  if (left.kind !== "Ref") return false;
  if (left.operand.kind !== "Identifier") return false;
  return findDeclared(scopes, left.operand.name)?.suffix === name;
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
