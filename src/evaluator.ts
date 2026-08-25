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
 * Evaluate an expression node against the current variable scope.
 *
 * @param expr - The expression to evaluate.
 * @param vars - The current variable scope.
 * @returns The numeric value, or a structured error.
 */
function evalExpr(
  expr: Expr,
  vars: Map<string, number>,
): { ok: true; value: number } | { ok: false; error: TuffError } {
  if (expr.type === "Number") return { ok: true, value: expr.value };
  const val = vars.get(expr.name);
  if (val !== undefined) return { ok: true, value: val };
  return { ok: false, error: { type: "UnknownIdentifier", name: expr.name } };
}

/**
 * Execute a parsed program against a fresh variable scope.
 *
 * @param stmts - The statements to execute.
 * @returns The return value (or 0 if none), or a structured error.
 */
function exec(
  stmts: readonly Stmt[],
): { ok: true; value: number } | { ok: false; error: TuffError } {
  const vars = new Map<string, number>();
  for (const stmt of stmts) {
    const value = evalExpr(stmt.value, vars);
    if (!value.ok) return value;
    if (stmt.type === "Return") return value;
    vars.set(stmt.name, value.value);
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
  return exec(parsed.program.stmts);
}
