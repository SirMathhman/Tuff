import type { TuffError } from "../errors.ts";
import type { KindName, TuffExpr } from "../ast.ts";
import { isNumberSuffix } from "./suffixes.ts";

/** The statically known kinds a binding or element can hold. */
export type ValueKind =
  | "number"
  | "bool"
  | "tuple"
  | "array"
  | "range"
  | "struct";

/**
 * A declared struct's field kinds, keyed by field name. Registered by a
 * `struct` declaration and consulted when checking struct literals and
 * field accesses.
 */
export interface StructDef {
  /** The field kinds, keyed by field name. */
  fields: Record<string, ValueKind>;
}

/** A declared function's parameter: its name and kind. */
export interface FnParamDef {
  /** The parameter's name. */
  name: string;
  /** The parameter's kind. */
  kind: ValueKind;
}

/** A declared function's parameter kinds, in source order. */
export interface FnDef {
  /** The parameter names and kinds, in source order. */
  params: FnParamDef[];
  /** The declared return kind, if the declaration annotated one. */
  returnType?: ValueKind;
}

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
  /** The field kinds, if the binding holds a struct literal. */
  structKinds?: Record<string, ValueKind>;
  /** The number-suffix, if the binding holds a suffixed number literal. */
  suffix?: string;
  /** The scope index the binding was declared in (0 is the outermost). */
  depth: number;
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
 * The context threaded through the expression-level checkers: the stacks of
 * declared bindings, structs, and functions, plus the dereference resolver.
 * Bundling these into one value keeps the walker signatures short as new
 * per-statement scope state is added.
 */
export interface ExprCheckContext {
  /** The stack of declared bindings. */
  scopes: Record<string, DeclaredBinding>[];
  /** The stack of declared structs. */
  structs: Record<string, StructDef>[];
  /** The stack of declared functions. */
  fns: Record<string, FnDef>[];
  /** The dereference resolver, for `*` operands. */
  resolveDeref: ResolveDeref;
}

/**
 * Whether the current check position is inside a loop body, so that `break`
 * is valid. Threaded through the statement checkers.
 */
export type LoopContext = boolean;

/**
 * The mutable context threaded through the statement checkers: the stacks of
 * declared bindings, type aliases, structs, and functions, plus whether the
 * current position is inside a loop body.
 */
export interface CheckContext {
  scopes: Record<string, DeclaredBinding>[];
  aliases: Record<string, KindName>[];
  structs: Record<string, StructDef>[];
  fns: Record<string, FnDef>[];
  inLoop: LoopContext;
}

/**
 * Infer the value kind of an expression, or null if not statically inferable.
 * @param expr - The expression to inspect.
 * @param context - The expression check context.
 * @returns The inferred kind, or null if not statically inferable.
 */
export function inferKind(
  expr: TuffExpr,
  context: ExprCheckContext,
): ValueKind | null {
  if (expr.kind === "Literal") {
    return expr.value.kind === "bool" ? "bool" : "number";
  }
  if (expr.kind === "Identifier") {
    return findDeclared(context.scopes, expr.name)?.kind ?? null;
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
  if (expr.kind === "Call") {
    return findFn(context.fns, expr.name)?.returnType ?? null;
  }
  if (expr.kind === "Deref") {
    const resolved = context.resolveDeref(expr.operand, 0, context.scopes);
    return "kind" in resolved ? null : resolved.binding.kind;
  }
  if (expr.kind === "Tuple") return "tuple";
  if (expr.kind === "TupleIndex") {
    const kinds = tupleElementKinds(expr.operand, context);
    return kinds ? (kinds[expr.index] ?? null) : null;
  }
  if (expr.kind === "Array") return "array";
  if (expr.kind === "Range") return "range";
  if (expr.kind === "StructLiteral") return "struct";
  if (expr.kind === "ArrayIndex") {
    const kinds = arrayElementKinds(expr.operand, context);
    if (!kinds) return null;
    const index = literalIndex(expr.index);
    return index !== null && index < kinds.length
      ? (kinds[index] ?? null)
      : null;
  }
  if (expr.kind === "FieldAccess") {
    const kinds = structFieldKinds(expr.operand, context);
    return kinds ? (kinds[expr.field] ?? null) : null;
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
 * @param context - The expression check context.
 * @returns {ValueKind[] | null} The element kinds, or null.
 */
export function tupleElementKinds(
  expr: TuffExpr,
  context: ExprCheckContext,
): ValueKind[] | null {
  if (expr.kind === "Tuple") {
    return expr.elements.map(
      (element) => inferKind(element, context) ?? "number",
    );
  }
  if (expr.kind === "Identifier") {
    return findDeclared(context.scopes, expr.name)?.tupleKinds ?? null;
  }
  return null;
}

/**
 * The element kinds of an array expression, or null if not statically an array.
 * @param expr - The expression to inspect.
 * @param context - The expression check context.
 * @returns {ValueKind[] | null} The element kinds, or null.
 */
export function arrayElementKinds(
  expr: TuffExpr,
  context: ExprCheckContext,
): ValueKind[] | null {
  if (expr.kind === "Array") {
    return expr.elements.map(
      (element) => inferKind(element, context) ?? "number",
    );
  }
  if (expr.kind === "Identifier") {
    return findDeclared(context.scopes, expr.name)?.arrayKinds ?? null;
  }
  return null;
}

/**
 * The field kinds of a struct expression, or null if not statically a struct.
 * @param expr - The expression to inspect.
 * @param context - The expression check context.
 * @returns {Record<string, ValueKind> | null} The field kinds, or null.
 */
export function structFieldKinds(
  expr: TuffExpr,
  context: ExprCheckContext,
): Record<string, ValueKind> | null {
  if (expr.kind === "StructLiteral") {
    const fields: Record<string, ValueKind> = {};
    for (const field of expr.fields) {
      fields[field.name] = inferKind(field.value, context) ?? "number";
    }
    return fields;
  }
  if (expr.kind === "Identifier") {
    return findDeclared(context.scopes, expr.name)?.structKinds ?? null;
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
 * @param structKinds - The field kinds, if the binding holds a struct.
 * @param suffix - The number-suffix, if the binding holds a suffixed literal.
 * @param scopes - The stack of declared bindings.
 */
export function declareBinding(
  name: string,
  kind: ValueKind,
  mut: boolean,
  refTo: string | undefined,
  tupleKinds: ValueKind[] | undefined,
  arrayKinds: ValueKind[] | undefined,
  structKinds: Record<string, ValueKind> | undefined,
  suffix: string | undefined,
  scopes: Record<string, DeclaredBinding>[],
): void {
  const scope = scopes[scopes.length - 1];
  if (scope)
    scope[name] = {
      kind,
      mut,
      refTo,
      tupleKinds,
      arrayKinds,
      structKinds,
      suffix,
      depth: scopes.length - 1,
    };
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

/**
 * Find a declared struct, innermost scope first.
 * @param structs - The stack of declared structs.
 * @param name - The struct name.
 * @returns The struct definition, or null if not found.
 */
export function findStruct(
  structs: Record<string, StructDef>[],
  name: string,
): StructDef | null {
  for (let i = structs.length - 1; i >= 0; i--) {
    const scope = structs[i];
    if (scope && scope[name]) return scope[name];
  }
  return null;
}

/**
 * Find a declared function, innermost scope first.
 * @param fns - The stack of declared functions.
 * @param name - The function name.
 * @returns The function definition, or null if not found.
 */
export function findFn(
  fns: Record<string, FnDef>[],
  name: string,
): FnDef | null {
  for (let i = fns.length - 1; i >= 0; i--) {
    const scope = fns[i];
    if (scope && scope[name]) return scope[name];
  }
  return null;
}

/**
 * The value kind a resolved kind name denotes: a number suffix or a kind
 * name maps to its value kind; a tuple or array kind name maps to its
 * container kind.
 * @param name - The resolved kind name.
 * @returns The value kind the kind name denotes.
 */
export function kindValueKind(name: KindName): ValueKind {
  if (name.kind === "KindNameTuple") return "tuple";
  if (name.kind === "KindNameArray") return "array";
  if (name.kind === "KindNameRef") return "number";
  if (isNumberSuffix(name.name)) return "number";
  return kindName(name.name) ?? "number";
}

/**
 * Resolve the bare names in a kind name through the alias stack, innermost
 * scope first; tuple and array elements are resolved recursively.
 * @param name - The kind name to resolve.
 * @param aliases - The stack of declared type aliases.
 * @returns The kind name with every alias name replaced by its definition.
 */
export function resolveKindName(
  name: KindName,
  aliases: Record<string, KindName>[],
): KindName {
  if (name.kind === "KindNameBare") {
    for (let i = aliases.length - 1; i >= 0; i--) {
      const scope = aliases[i];
      const alias = scope?.[name.name];
      if (alias !== undefined) return alias;
    }
    return name;
  }
  if (name.kind === "KindNameTuple") {
    return {
      kind: "KindNameTuple",
      elements: name.elements.map((element) =>
        resolveKindName(element, aliases),
      ),
    };
  }
  if (name.kind === "KindNameArray") {
    return {
      kind: "KindNameArray",
      element: resolveKindName(name.element, aliases),
      length: name.length,
    };
  }
  return name;
}
