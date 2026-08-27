import type { TuffError } from "../errors.ts";
import type { TuffExpr } from "../ast.ts";

/** The statically known kinds a binding or element can hold. */
export type ValueKind = "number" | "bool" | "tuple" | "array" | "range";

/**
 * The legal kind names a type-test (`is`) may name, mapped to the value kind
 * they test for. Suffix names (U8, I8, ...) are not kind names; they match a
 * literal's suffix and live in `suffixes.ts`.
 */
const KIND_NAMES: Record<string, ValueKind> = {
  Bool: "bool",
};

/**
 * Resolve a type-test kind name to the value kind it tests for.
 * @param name - The kind name to resolve.
 * @returns The value kind, or null if the name is not a legal kind name.
 */
export function kindName(name: string): ValueKind | null {
  const kind = KIND_NAMES[name];
  return kind === undefined ? null : kind;
}

/** A declared binding's type, mutability, and reference target. */
export interface DeclaredBinding {
  /** The kind of value the binding holds. */
  kind: ValueKind;
  /** Whether the binding was declared with `mut`. */
  mut: boolean;
  /** The name of the binding this is a reference to, if a `&`/`&mut`. */
  refTo?: string;
  /** The element kinds, if the binding holds a tuple literal. */
  tupleKinds?: ValueKind[];
  /** The element kinds, if the binding holds an array literal. */
  arrayKinds?: ValueKind[];
}

/** A successfully resolved dereference target. */
export interface ResolvedDeref {
  /** The binding the dereference reads or writes. */
  binding: DeclaredBinding;
  /** The name of the referenced binding. */
  name: string;
}

/**
 * Resolve a dereference operand to the binding it references.
 * Passed to the kind inference to break their mutual recursion.
 */
export type ResolveDeref = (
  operand: TuffExpr,
  line: number,
  scopes: Record<string, DeclaredBinding>[],
) => ResolvedDeref | TuffError;

/**
 * Infer the value kind of an expression, or null if not statically inferable.
 * @param expr - The expression to inspect.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for `*` operands.
 * @returns The inferred kind, or null if not statically inferable.
 */
export function inferKind(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): ValueKind | null {
  if (expr.kind === "Literal") {
    return expr.value.kind === "bool" ? "bool" : "number";
  }
  if (expr.kind === "Identifier") {
    return findDeclared(scopes, expr.name)?.kind ?? null;
  }
  if (expr.kind === "Add") return "number";
  if (
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "And" ||
    expr.kind === "Or" ||
    expr.kind === "Is"
  )
    return "bool";
  if (expr.kind === "Ref") return "number";
  if (expr.kind === "Deref") {
    const resolved = resolveDeref(expr.operand, 0, scopes);
    return "kind" in resolved ? null : resolved.binding.kind;
  }
  if (expr.kind === "Tuple") return "tuple";
  if (expr.kind === "TupleIndex") {
    const kinds = tupleElementKinds(expr.operand, scopes, resolveDeref);
    return kinds ? (kinds[expr.index] ?? null) : null;
  }
  if (expr.kind === "Array") return "array";
  if (expr.kind === "Range") return "range";
  if (expr.kind === "ArrayIndex") {
    const kinds = arrayElementKinds(expr.operand, scopes, resolveDeref);
    if (!kinds) return null;
    const index = literalIndex(expr.index);
    return index !== null && index < kinds.length
      ? (kinds[index] ?? null)
      : null;
  }
  return null;
}

/**
 * The literal index of an array-index expression, or null if the index is
 * not a non-negative integer literal.
 * @param expr - The index expression to inspect.
 * @returns {number | null} The literal index, or null.
 */
export function literalIndex(expr: TuffExpr): number | null {
  if (expr.kind !== "Literal") return null;
  if (expr.value.kind !== "number") return null;
  return Number.isInteger(expr.value.value) && expr.value.value >= 0
    ? expr.value.value
    : null;
}

/**
 * The element kinds of a tuple expression, or null if not statically a tuple.
 * @param expr - The expression to inspect.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for `*` operands.
 * @returns {ValueKind[] | null} The element kinds, or null.
 */
export function tupleElementKinds(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): ValueKind[] | null {
  if (expr.kind === "Tuple") {
    return expr.elements.map(
      (element) => inferKind(element, scopes, resolveDeref) ?? "number",
    );
  }
  if (expr.kind === "Identifier") {
    return findDeclared(scopes, expr.name)?.tupleKinds ?? null;
  }
  return null;
}

/**
 * The element kinds of an array expression, or null if not statically an array.
 * @param expr - The expression to inspect.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for `*` operands.
 * @returns {ValueKind[] | null} The element kinds, or null.
 */
export function arrayElementKinds(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): ValueKind[] | null {
  if (expr.kind === "Array") {
    return expr.elements.map(
      (element) => inferKind(element, scopes, resolveDeref) ?? "number",
    );
  }
  if (expr.kind === "Identifier") {
    return findDeclared(scopes, expr.name)?.arrayKinds ?? null;
  }
  return null;
}

/**
 * Declare a binding in the innermost scope.
 * @param name - The binding name.
 * @param kind - The value kind.
 * @param mut - Whether the binding is mutable.
 * @param refTo - The name of the binding this is a reference to, if any.
 * @param tupleKinds - The element kinds, if the binding holds a tuple.
 * @param arrayKinds - The element kinds, if the binding holds an array.
 * @param scopes - The stack of declared bindings.
 */
export function declareBinding(
  name: string,
  kind: ValueKind,
  mut: boolean,
  refTo: string | undefined,
  tupleKinds: ValueKind[] | undefined,
  arrayKinds: ValueKind[] | undefined,
  scopes: Record<string, DeclaredBinding>[],
): void {
  const scope = scopes[scopes.length - 1];
  if (scope) scope[name] = { kind, mut, refTo, tupleKinds, arrayKinds };
}

/**
 * Find a declared binding, innermost scope first.
 * @param scopes - The stack of declared bindings.
 * @param name - The binding name.
 * @returns The declared binding, or null if not found.
 */
export function findDeclared(
  scopes: Record<string, DeclaredBinding>[],
  name: string,
): DeclaredBinding | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const scope = scopes[i];
    if (scope && scope[name]) return scope[name];
  }
  return null;
}
