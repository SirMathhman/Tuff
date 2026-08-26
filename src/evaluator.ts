import type { TuffError } from "./errors.ts";
import { parse } from "./parser.ts";
import type { Expr, Stmt } from "./parser.ts";

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
 * A variable binding: its value and whether it is mutable.
 */
interface Binding {
  value: number;
  mutable: boolean;
}

/**
 * Evaluate an expression node against the current variable scope.
 *
 * @param expr - The expression to evaluate.
 * @param vars - The current variable scope.
 * @returns The numeric value, or a structured error.
 */
function evalExpr(expr: Expr, vars: Map<string, Binding>): Result {
  if (expr.type === "Number") return { ok: true, value: expr.value };
  if (expr.type === "Boolean") {
    return { ok: true, value: expr.value ? 1 : 0 };
  }
  if (expr.type === "Binary") {
    const left = evalExpr(expr.left, vars);
    if (!left.ok) return left;
    if (expr.op === "||" && left.value !== 0) return { ok: true, value: 1 };
    const right = evalExpr(expr.right, vars);
    if (!right.ok) return right;
    if (expr.op === "==") {
      return { ok: true, value: left.value === right.value ? 1 : 0 };
    }
    return { ok: true, value: right.value !== 0 ? 1 : 0 };
  }
  const binding = vars.get(expr.name);
  if (binding !== undefined) return { ok: true, value: binding.value };
  return { ok: false, error: { type: "UnknownIdentifier", name: expr.name } };
}

/**
 * Execute a sequence of statements against a variable scope.
 *
 * @param stmts - The statements to execute.
 * @param vars - The variable scope, shared with enclosing blocks.
 * @returns The return value (or 0 if none), or a structured error.
 */
function exec(stmts: readonly Stmt[], vars: Map<string, Binding>): Result {
  for (const stmt of stmts) {
    if (stmt.type === "Block") {
      const r = exec(stmt.stmts, vars);
      if (!r.ok) return r;
      continue;
    }
    const value = evalExpr(stmt.value, vars);
    if (!value.ok) return value;
    if (stmt.type === "Return") return value;
    if (stmt.type === "Assign") {
      const binding = vars.get(stmt.name);
      if (binding === undefined) {
        return {
          ok: false,
          error: { type: "UnknownIdentifier", name: stmt.name },
        };
      }
      if (!binding.mutable) {
        return {
          ok: false,
          error: {
            type: "ImmutableAssignment",
            name: stmt.name,
            position: stmt.pos,
          },
        };
      }
      binding.value = value.value;
      continue;
    }
    vars.set(stmt.name, { value: value.value, mutable: stmt.mutable });
  }
  return { ok: true, value: 0 };
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
  return exec(parsed.program.stmts, new Map());
}
