import type { Value } from "../ast.js";
import { err, ok, type EvalError, type Result } from "../errors.js";
import { lookup, type ScopeStack } from "../scopes.js";

/** A value with its type, so `==` can compare type-strictly. */
export type TypedValue =
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "ptr<number>"; ref: Variable }
  | { type: "ptr<bool>"; ref: Variable };

/** A variable's value with its type, so assignments can be type-checked. */
export type Variable = { value: TypedValue; mutable: boolean };

/** A stack of variable scopes, innermost last. */
export type Scopes = ScopeStack<Variable>;

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
  if (value.kind === "addressOf") {
    const target = valueToTyped(value.target, scopes);
    if (!target.ok) {
      return target;
    }
    if (target.value.type !== "number" && target.value.type !== "bool") {
      return err({
        kind: "TypeMismatch",
        name: "&",
        expected: "number",
        actual: target.value.type,
        position: value.position,
      });
    }
    const variable = lookup(scopes, value.target.name);
    if (!variable) {
      return err({ kind: "UnknownIdentifier", name: value.target.name, position: value.position });
    }
    return ok({ type: `ptr<${variable.value.type}>` as "ptr<number>", ref: variable });
  }
  if (value.kind === "deref") {
    const target = valueToTyped(value.target, scopes);
    if (!target.ok) {
      return target;
    }
    if (target.value.type !== "ptr<number>" && target.value.type !== "ptr<bool>") {
      return err({
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: target.value.type,
        position: value.position,
      });
    }
    return ok(target.value.ref.value);
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
  if (typed.value.type === "ptr<number>" || typed.value.type === "ptr<bool>") {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "number",
      actual: typed.value.type,
      position: value.position,
    });
  }
  return ok(typed.value.type === "bool" ? (typed.value.value ? 1 : 0) : typed.value.value);
}
