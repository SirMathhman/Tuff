import type { Value, ValueBlock } from "../core/ast.js";
import { type EvalError, type Result } from "../core/errors.js";
import { type Type } from "./types.js";
import { type Scopes, type TypedValue } from "./typedValues.js";

/**
 * A block-value evaluator, threaded through the value evaluator as an explicit
 * dependency. Block values and statements mutually recurse (a block value's
 * statements are evaluated by the statement evaluator), so the statement
 * evaluator passes its block-value evaluator in here rather than importing it
 * (module cycle).
 */
export type BlockValueEvaluator = (
  value: ValueBlock,
  scopes: Scopes,
) => Result<TypedValue, EvalError>;

/** The block-value evaluator, threaded through value evaluation. */
export interface ValueContext {
  evalBlock: BlockValueEvaluator;
}

/**
 * The value evaluator itself, threaded into the per-kind handlers as an
 * explicit dependency. The handlers and the dispatch mutually recurse (a
 * handler evaluates sub-expressions via the dispatch), so the dispatch passes
 * itself in here rather than the handlers importing it (module cycle).
 */
export type ValueToTypedFn = (
  value: Value,
  scopes: Scopes,
  ctx: ValueContext,
) => Result<TypedValue, EvalError>;

/** The numeric-coercion helper, threaded into the per-kind handlers. */
export type ValueToNumberFn = (
  value: Value,
  scopes: Scopes,
  ctx: ValueContext,
  name: string,
) => Result<number, EvalError>;

/** The static `Type` of a typed value (used by `is` type-tests and `+`). */
export function typeOfValue(typed: TypedValue): Type {
  if (typed.kind === "number") {
    return { kind: "number" };
  }
  if (typed.kind === "bool") {
    return { kind: "bool" };
  }
  if (typed.kind === "int") {
    return { kind: "int", name: typed.name };
  }
  if (typed.kind === "float") {
    return { kind: "float", name: typed.name };
  }
  if (typed.kind === "array") {
    return { kind: "array", element: typed.element };
  }
  if (typed.kind === "ptr") {
    return { kind: "ptr", mutable: typed.mutable, pointee: typed.pointee };
  }
  return { kind: "range", element: typed.element };
}
