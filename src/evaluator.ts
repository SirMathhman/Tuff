import type { Stmt } from "./parser.ts";
import type { BinaryExpr, Expr } from "./expr.ts";
import { tupleElementsEqual } from "./util.ts";

/**
 * A numeric runtime value.
 */
interface NumberValue {
  kind: "number";
  value: number;
}

/**
 * A boolean runtime value (stored as 0 or 1).
 */
interface BooleanValue {
  kind: "boolean";
  value: number;
}

/**
 * A tuple runtime value: an ordered list of element values.
 */
interface TupleValue {
  kind: "tuple";
  elements: Value[];
}

/**
 * A reference runtime value: a pointer to a named binding in the scope.
 */
interface RefValue {
  kind: "ref";
  name: string;
}

/**
 * A runtime value: a number, a boolean, a tuple of values, or a reference.
 */
type Value = NumberValue | BooleanValue | TupleValue | RefValue;

/**
 * A variable binding: its value and whether it is mutable.
 */
interface Binding {
  value: Value;
  mutable: boolean;
}

/**
 * Assert a condition that the static type checker has already guaranteed.
 * Fails loudly if the invariant is ever violated.
 *
 * @param cond - The condition that must hold.
 * @param message - Message describing the violated invariant.
 */
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

/**
 * Evaluate an expression node against the current variable scope.
 *
 * @param expr - The expression to evaluate.
 * @param vars - The current variable scope.
 * @returns The typed value.
 */
function evalExpr(expr: Expr, vars: Map<string, Binding>): Value {
  if (expr.type === "Number") {
    return { kind: "number", value: expr.value };
  }
  if (expr.type === "Boolean") {
    return { kind: "boolean", value: expr.value ? 1 : 0 };
  }
  if (expr.type === "Tuple") {
    return {
      kind: "tuple",
      elements: expr.elements.map((el) => evalExpr(el, vars)),
    };
  }
  if (expr.type === "FieldAccess") {
    const obj = evalExpr(expr.object, vars);
    assert(obj.kind === "tuple", `Expected tuple, got ${obj.kind}`);
    const el = obj.elements[expr.index];
    assert(el !== undefined, `Tuple index out of range: ${expr.index}`);
    return el;
  }
  if (expr.type === "Binary") {
    return evalBinary(expr, vars);
  }
  if (expr.type === "Ref") {
    assert(expr.operand.type === "Identifier", "Expected identifier in reference");
    const name = expr.operand.name;
    const binding = vars.get(name);
    assert(binding !== undefined, `Unknown identifier: ${name}`);
    return { kind: "ref", name };
  }
  if (expr.type === "Deref") {
    const ref = evalExpr(expr.operand, vars);
    assert(ref.kind === "ref", `Expected reference, got ${ref.kind}`);
    const binding = vars.get(ref.name);
    assert(binding !== undefined, `Unknown identifier: ${ref.name}`);
    return binding.value;
  }
  const binding = vars.get(expr.name);
  assert(binding !== undefined, `Unknown identifier: ${expr.name}`);
  return binding.value;
}

/**
 * Evaluate a binary operator expression.
 *
 * @param expr - The binary expression to evaluate.
 * @param vars - The current variable scope.
 * @returns The typed value.
 */
function evalBinary(expr: BinaryExpr, vars: Map<string, Binding>): Value {
  const left = evalExpr(expr.left, vars);
  if (expr.op === "||" && toNumber(left) !== 0) {
    return { kind: "boolean", value: 1 };
  }
  const right = evalExpr(expr.right, vars);
  if (expr.op === "+" || expr.op === "-" || expr.op === "*") {
    assert(left.kind === "number", `Expected number, got ${left.kind}`);
    assert(right.kind === "number", `Expected number, got ${right.kind}`);
    const value =
      expr.op === "+"
        ? left.value + right.value
        : expr.op === "-"
          ? left.value - right.value
          : left.value * right.value;
    return { kind: "number", value };
  }
  if (expr.op === "==") {
    return { kind: "boolean", value: valuesEqual(left, right) ? 1 : 0 };
  }
  if (expr.op === "<") {
    if (
      left.kind === "tuple" ||
      right.kind === "tuple" ||
      left.kind === "ref" ||
      right.kind === "ref"
    ) {
      return { kind: "boolean", value: 0 };
    }
    const less = left.kind === right.kind && left.value < right.value ? 1 : 0;
    return { kind: "boolean", value: less };
  }
  return { kind: "boolean", value: toNumber(right) !== 0 ? 1 : 0 };
}

/**
 * Extract the numeric representation of a value.
 *
 * @param value - The value to read.
 * @returns The numeric value (tuples have no numeric form and fail loudly).
 */
function toNumber(value: Value): number {
  assert(value.kind !== "tuple", "Cannot use a tuple as a number");
  assert(value.kind !== "ref", "Cannot use a reference as a number");
  return value.value;
}

/**
 * Whether two runtime values are equal, comparing tuples element-wise.
 *
 * @param a - The first value.
 * @param b - The second value.
 * @returns True when the values are equal.
 */
function valuesEqual(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tuple" && b.kind === "tuple") {
    return tupleElementsEqual(a.elements, b.elements, valuesEqual);
  }
  if (a.kind === "tuple" || b.kind === "tuple") return false;
  if (a.kind === "ref" && b.kind === "ref") return a.name === b.name;
  if (a.kind === "number" && b.kind === "number") return a.value === b.value;
  if (a.kind === "boolean" && b.kind === "boolean") return a.value === b.value;
  return false;
}

/**
 * Execute a sequence of statements against a variable scope.
 *
 * @param stmts - The statements to execute.
 * @param vars - The variable scope, shared with enclosing blocks.
 * @returns The return value (or 0 if none).
 */
export function exec(
  stmts: readonly Stmt[],
  vars: Map<string, Binding>,
): number {
  for (const stmt of stmts) {
    if (stmt.type === "Block") {
      exec(stmt.stmts, vars);
      continue;
    }
    if (stmt.type === "If") {
      const cond = evalExpr(stmt.cond, vars);
      exec(toNumber(cond) !== 0 ? stmt.then : stmt.else, vars);
      continue;
    }
    if (stmt.type === "While") {
      while (toNumber(evalExpr(stmt.cond, vars)) !== 0) {
        exec(stmt.body, vars);
      }
      continue;
    }
    if (stmt.type === "For") {
      const start = toNumber(evalExpr(stmt.start, vars));
      const end = toNumber(evalExpr(stmt.end, vars));
      const prev = vars.get(stmt.name);
      for (let i = start; i < end; i++) {
        vars.set(stmt.name, {
          value: { kind: "number", value: i },
          mutable: true,
        });
        exec(stmt.body, vars);
      }
      if (prev === undefined) {
        vars.delete(stmt.name);
      } else {
        vars.set(stmt.name, prev);
      }
      continue;
    }
    const value = evalExpr(stmt.value, vars);
    if (stmt.type === "Return") return toNumber(value);
    if (stmt.type === "Assign") {
      const binding = vars.get(stmt.name);
      assert(binding !== undefined, `Unknown identifier: ${stmt.name}`);
      assert(binding.mutable, `Immutable assignment: ${stmt.name}`);
      binding.value = value;
      continue;
    }
    vars.set(stmt.name, { value, mutable: stmt.mutable });
  }
  return 0;
}
