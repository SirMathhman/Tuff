import type { TuffError } from "./errors.ts";
import { parse } from "./parser.ts";
import type { Stmt } from "./parser.ts";
import type { Expr } from "./expr.ts";
import { typeCheck } from "./typecheck.ts";

/**
 * A successful evaluation result.
 */
export interface Ok {
  ok: true;
  value: number;
}

/**
 * A failed evaluation result.
 */
export interface Err {
  ok: false;
  error: TuffError;
}

/**
 * The result of an evaluation: either a numeric value or a structured error.
 */
export type Result = Ok | Err;

/**
 * A runtime value: its numeric representation and its type kind.
 */
interface Value {
  value: number;
  kind: "number" | "boolean";
}

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
    return { value: expr.value, kind: "number" };
  }
  if (expr.type === "Boolean") {
    return { value: expr.value ? 1 : 0, kind: "boolean" };
  }
  if (expr.type === "Binary") {
    const left = evalExpr(expr.left, vars);
    if (expr.op === "||" && left.value !== 0) {
      return { value: 1, kind: "boolean" };
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
      return { value, kind: "number" };
    }
    if (expr.op === "==") {
      const equal =
        left.kind === right.kind && left.value === right.value ? 1 : 0;
      return { value: equal, kind: "boolean" };
    }
    if (expr.op === "<") {
      const less = left.kind === right.kind && left.value < right.value ? 1 : 0;
      return { value: less, kind: "boolean" };
    }
    return { value: right.value !== 0 ? 1 : 0, kind: "boolean" };
  }
  const binding = vars.get(expr.name);
  assert(binding !== undefined, `Unknown identifier: ${expr.name}`);
  return binding.value;
}

/**
 * Execute a sequence of statements against a variable scope.
 *
 * @param stmts - The statements to execute.
 * @param vars - The variable scope, shared with enclosing blocks.
 * @returns The return value (or 0 if none).
 */
function exec(stmts: readonly Stmt[], vars: Map<string, Binding>): number {
  for (const stmt of stmts) {
    if (stmt.type === "Block") {
      exec(stmt.stmts, vars);
      continue;
    }
    if (stmt.type === "If") {
      const cond = evalExpr(stmt.cond, vars);
      exec(cond.value !== 0 ? stmt.then : stmt.else, vars);
      continue;
    }
    if (stmt.type === "While") {
      while (evalExpr(stmt.cond, vars).value !== 0) {
        exec(stmt.body, vars);
      }
      continue;
    }
    const value = evalExpr(stmt.value, vars);
    if (stmt.type === "Return") return value.value;
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

/**
 * Evaluate the tuffness of a string.
 *
 * @param input - The string to evaluate.
 * @returns The tuffness score or a structured error.
 */
export function evaluateTuff(input: string): Result {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  const err = typeCheck(parsed.program.stmts, new Map());
  if (!err.ok) return err;
  return { ok: true, value: exec(parsed.program.stmts, new Map()) };
}
