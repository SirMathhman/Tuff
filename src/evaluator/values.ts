import type { Value } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";

/** A value with its type, so `==` can compare type-strictly. */
export type TypedValue = { type: "number"; value: number } | { type: "bool"; value: boolean };

/** A variable's value with its type, so assignments can be type-checked. */
export type Variable = { value: TypedValue; mutable: boolean };

/** A stack of variable scopes, innermost last. */
export type Scopes = Map<string, Variable>[];

/** Find a variable by walking the scopes from innermost outward. */
export function lookup(scopes: Scopes, name: string): Variable | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const variable = scopes[i].get(name);
    if (variable) {
      return variable;
    }
  }
  return undefined;
}

/**
 * Evaluate a value expression to a typed value, or an error for undeclared
 * identifiers. `==`/`!=` compare type-strictly: a bool and a number are never
 * equal. Ordering operators (`<`, `<=`, `>`, `>=`) compare numerically, with
 * bools coerced to 1/0.
 */
export function valueToTyped(value: Value, scopes: Scopes): Result<TypedValue, EvalError> {
  if (value.kind === "number") {
    return ok({ type: "number", value: value.value });
  }
  if (value.kind === "bool") {
    return ok({ type: "bool", value: value.value });
  }
  if (value.kind === "binary") {
    const left = valueToTyped(value.left, scopes);
    if (!left.ok) {
      return left;
    }
    const right = valueToTyped(value.right, scopes);
    if (!right.ok) {
      return right;
    }
    if (value.operator === "==" || value.operator === "!=") {
      const equal = left.value.type === right.value.type && left.value.value === right.value.value;
      const result = value.operator === "==" ? equal : !equal;
      return ok({ type: "number", value: result ? 1 : 0 });
    }
    // Ordering operators compare numerically; bools coerce to 1/0.
    const toNum = (t: TypedValue): number => (t.type === "bool" ? (t.value ? 1 : 0) : t.value);
    const leftNum = toNum(left.value);
    const rightNum = toNum(right.value);
    const result =
      value.operator === "<"
        ? leftNum < rightNum
        : value.operator === "<="
          ? leftNum <= rightNum
          : value.operator === ">"
            ? leftNum > rightNum
            : leftNum >= rightNum;
    return ok({ type: "number", value: result ? 1 : 0 });
  }
  const variable = lookup(scopes, value.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
  }
  return ok(variable.value);
}

/** Convert a value expression to a number, or an error for undeclared identifiers. */
export function valueToNumber(value: Value, scopes: Scopes): Result<number, EvalError> {
  const typed = valueToTyped(value, scopes);
  if (!typed.ok) {
    return typed;
  }
  return ok(typed.value.type === "bool" ? (typed.value.value ? 1 : 0) : typed.value.value);
}
