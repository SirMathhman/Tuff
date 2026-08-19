import type { Value } from "../ast.js";
import { err, ok, type EvalError, type Result, type TypeName } from "../errors.js";
import { lookup, type ScopeStack } from "../scopes.js";

/** A value with its type, so `==` can compare type-strictly. */
export type TypedValue =
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: `ptr<${TypeName}>`; ref: Variable };

/** A variable's value with its type, so assignments can be type-checked. */
export interface Variable {
  value: TypedValue;
  mutable: boolean;
}

/** A stack of variable scopes, innermost last. */
export type Scopes = ScopeStack<Variable>;

/** A pointer variant of `TypedValue`, at any nesting depth. */
type PointerValue = Extract<TypedValue, { type: `ptr<${TypeName}>` }>;

/** Type guard: is this a pointer value? */
export function isPointer(t: TypedValue): t is PointerValue {
  return t.type.startsWith("ptr<");
}

/** Evaluate a binary operation: `==`/`!=` compare type-strictly; ordering operators compare numerically. */
function evalBinary(
  value: Extract<Value, { kind: "binary" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const left = valueToTyped(value.left, scopes);
  if (!left.ok) {
    return left;
  }
  const right = valueToTyped(value.right, scopes);
  if (!right.ok) {
    return right;
  }
  if (value.operator === "==" || value.operator === "!=") {
    const l = left.value;
    const r = right.value;
    let equal = false;
    if (l.type === "number" && r.type === "number") {
      equal = l.value === r.value;
    } else if (l.type === "bool" && r.type === "bool") {
      equal = l.value === r.value;
    }
    const result = value.operator === "==" ? equal : !equal;
    return ok({ type: "number", value: result ? 1 : 0 });
  }
  return evalOrdering(value, left.value, right.value);
}

/** Compare two typed values with an ordering operator; bools coerce to 1/0. */
function evalOrdering(
  value: Extract<Value, { kind: "binary" }>,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Pointers are rejected by the typecheck pass; this is a defensive fallback.
  const toNum = (t: TypedValue): Result<number, EvalError> => {
    if (t.type === "number") {
      return ok(t.value);
    }
    if (t.type === "bool") {
      return ok(t.value ? 1 : 0);
    }
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: "number",
      actual: t.type,
      position: value.position,
    });
  };
  const leftNum = toNum(l);
  if (!leftNum.ok) {
    return leftNum;
  }
  const rightNum = toNum(r);
  if (!rightNum.ok) {
    return rightNum;
  }
  const result =
    value.operator === "<"
      ? leftNum.value < rightNum.value
      : value.operator === "<="
        ? leftNum.value <= rightNum.value
        : value.operator === ">"
          ? leftNum.value > rightNum.value
          : leftNum.value >= rightNum.value;
  return ok({ type: "number", value: result ? 1 : 0 });
}

/** Evaluate `&name`: a pointer to the variable's value (pointers may nest). */
function evalAddressOf(
  value: Extract<Value, { kind: "addressOf" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes);
  if (!target.ok) {
    return target;
  }
  if (value.target.kind !== "ident") {
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
  return ok({ type: `ptr<${variable.value.type}>`, ref: variable });
}

/** Evaluate `*ptr`: the value a pointer refers to. */
function evalDeref(
  value: Extract<Value, { kind: "deref" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes);
  if (!target.ok) {
    return target;
  }
  if (!isPointer(target.value)) {
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
    return evalBinary(value, scopes);
  }
  if (value.kind === "addressOf") {
    return evalAddressOf(value, scopes);
  }
  if (value.kind === "deref") {
    return evalDeref(value, scopes);
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
  if (isPointer(typed.value)) {
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
