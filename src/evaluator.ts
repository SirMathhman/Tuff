import type { Program, Statement, Value } from "./ast.js";
import { err, ok, type EvalError, type Result } from "./errors.js";

/** A variable's value with its type, so assignments can be type-checked. */
type Variable = { value: TypedValue; mutable: boolean };

/** A stack of variable scopes, innermost last. */
type Scopes = Map<string, Variable>[];

/** Find a variable by walking the scopes from innermost outward. */
function lookup(scopes: Scopes, name: string): Variable | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const variable = scopes[i].get(name);
    if (variable) {
      return variable;
    }
  }
  return undefined;
}

/** A value with its type, so `==` can compare type-strictly. */
type TypedValue = { type: "number"; value: number } | { type: "bool"; value: boolean };

/**
 * Evaluate a value expression to a typed value, or an error for undeclared
 * identifiers. `==`/`!=` compare type-strictly: a bool and a number are never
 * equal. Ordering operators (`<`, `<=`, `>`, `>=`) compare numerically, with
 * bools coerced to 1/0. Variables are untyped numbers.
 */
function valueToTyped(value: Value, scopes: Scopes): Result<TypedValue, EvalError> {
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
function valueToNumber(value: Value, scopes: Scopes): Result<number, EvalError> {
  const typed = valueToTyped(value, scopes);
  if (!typed.ok) {
    return typed;
  }
  return ok(typed.value.type === "bool" ? (typed.value.value ? 1 : 0) : typed.value.value);
}

/**
 * The outcome of evaluating a statement or statement list. `value` means a
 * `return` short-circuited; `void` means it completed normally; `error` means
 * evaluation failed.
 */
type Outcome =
  { kind: "value"; value: number } | { kind: "void" } | { kind: "error"; error: EvalError };

/**
 * Evaluate an `ident += value` compound assignment. `+=` is numeric addition,
 * so both the variable and the value must be numbers.
 */
function evalCompoundAssign(
  statement: Extract<Statement, { kind: "assign" }>,
  variable: Variable,
  value: TypedValue,
): Outcome {
  const actual = variable.value.type !== "number" ? variable.value.type : value.type;
  if (actual !== "number") {
    return {
      kind: "error",
      error: {
        kind: "TypeMismatch",
        name: statement.name,
        expected: "number",
        actual,
        position: statement.position,
      },
    };
  }
  const base = variable.value.type === "number" ? variable.value.value : 0;
  const addend = value.type === "number" ? value.value : 0;
  variable.value = { type: "number", value: base + addend };
  return { kind: "void" };
}

/** Evaluate an `ident = value` or `ident += value` assignment. */
function evalAssign(statement: Extract<Statement, { kind: "assign" }>, scopes: Scopes): Outcome {
  const variable = lookup(scopes, statement.name);
  if (!variable) {
    return {
      kind: "error",
      error: { kind: "UnknownIdentifier", name: statement.name, position: statement.position },
    };
  }
  if (!variable.mutable) {
    return {
      kind: "error",
      error: { kind: "ImmutableAssignment", name: statement.name, position: statement.position },
    };
  }
  const value = valueToTyped(statement.value, scopes);
  if (!value.ok) {
    return { kind: "error", error: value.error };
  }
  if (statement.compound) {
    return evalCompoundAssign(statement, variable, value.value);
  }
  if (value.value.type !== variable.value.type) {
    return {
      kind: "error",
      error: {
        kind: "TypeMismatch",
        name: statement.name,
        expected: variable.value.type,
        actual: value.value.type,
        position: statement.position,
      },
    };
  }
  variable.value = value.value;
  return { kind: "void" };
}

/** Evaluate a `while (condition) { ... }` loop, re-checking the condition each pass. */
function evalWhile(statement: Extract<Statement, { kind: "while" }>, scopes: Scopes): Outcome {
  while (true) {
    const condition = valueToNumber(statement.condition, scopes);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    if (condition.value === 0) {
      break;
    }
    scopes.push(new Map());
    const body = evalStatements(statement.body, scopes, false);
    scopes.pop();
    if (body.kind !== "void") {
      return body;
    }
  }
  return { kind: "void" };
}

/** Evaluate a single statement within the current scope stack. */
function evalStatement(statement: Statement, scopes: Scopes): Outcome {
  if (statement.kind === "let") {
    const value = valueToTyped(statement.value, scopes);
    if (!value.ok) {
      return { kind: "error", error: value.error };
    }
    scopes[scopes.length - 1].set(statement.name, {
      value: value.value,
      mutable: statement.mutable,
    });
    return { kind: "void" };
  }

  if (statement.kind === "assign") {
    return evalAssign(statement, scopes);
  }

  if (statement.kind === "return") {
    const value = valueToNumber(statement.value, scopes);
    if (!value.ok) {
      return { kind: "error", error: value.error };
    }
    return { kind: "value", value: value.value };
  }

  if (statement.kind === "block") {
    scopes.push(new Map());
    const result = evalStatements(statement.statements, scopes, false);
    scopes.pop();
    return result;
  }

  if (statement.kind === "if") {
    const condition = valueToNumber(statement.condition, scopes);
    if (!condition.ok) {
      return { kind: "error", error: condition.error };
    }
    const branch = condition.value !== 0 ? statement.then : (statement.else ?? []);
    scopes.push(new Map());
    const result = evalStatements(branch, scopes, false);
    scopes.pop();
    return result;
  }

  return evalWhile(statement, scopes);
}

/**
 * Evaluate a list of statements; a `return` short-circuits the rest. Only the
 * top level (`requireReturn`) must end in a `return`.
 */
function evalStatements(statements: Statement[], scopes: Scopes, requireReturn: boolean): Outcome {
  for (const statement of statements) {
    const result = evalStatement(statement, scopes);
    if (result.kind !== "void") {
      return result;
    }
  }
  return requireReturn ? { kind: "error", error: { kind: "MissingReturn" } } : { kind: "void" };
}

/**
 * Evaluate a parsed program.
 * @param program - The program from `parse`.
 * @returns A `Result` carrying the numeric result, or a structured `EvalError`.
 */
export function evalProgram(program: Program): Result<number, EvalError> {
  const outcome = evalStatements(program.statements, [new Map()], true);
  if (outcome.kind === "value") {
    return ok(outcome.value);
  }
  if (outcome.kind === "error") {
    return err(outcome.error);
  }
  return err({ kind: "MissingReturn" });
}
