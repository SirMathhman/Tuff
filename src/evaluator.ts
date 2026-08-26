import type { TuffError } from "./errors.ts";
import { parse } from "./parser.ts";
import type { Stmt } from "./parser.ts";
import type { Expr } from "./expr.ts";

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
 * A successful expression evaluation result.
 */
interface EvalOk {
  ok: true;
  value: Value;
}

/**
 * The result of evaluating an expression: a typed value or a structured error.
 */
type EvalResult = EvalOk | Err;

/**
 * A variable binding: its value and whether it is mutable.
 */
interface Binding {
  value: Value;
  mutable: boolean;
}

/**
 * Evaluate an expression node against the current variable scope.
 *
 * @param expr - The expression to evaluate.
 * @param vars - The current variable scope.
 * @returns The typed value, or a structured error.
 */
function evalExpr(expr: Expr, vars: Map<string, Binding>): EvalResult {
  if (expr.type === "Number") {
    return { ok: true, value: { value: expr.value, kind: "number" } };
  }
  if (expr.type === "Boolean") {
    return { ok: true, value: { value: expr.value ? 1 : 0, kind: "boolean" } };
  }
  if (expr.type === "Binary") {
    const left = evalExpr(expr.left, vars);
    if (!left.ok) return left;
    if (expr.op === "||" && left.value.value !== 0) {
      return { ok: true, value: { value: 1, kind: "boolean" } };
    }
    const right = evalExpr(expr.right, vars);
    if (!right.ok) return right;
    if (expr.op === "==") {
      const equal =
        left.value.kind === right.value.kind &&
        left.value.value === right.value.value
          ? 1
          : 0;
      return { ok: true, value: { value: equal, kind: "boolean" } };
    }
    return {
      ok: true,
      value: { value: right.value.value !== 0 ? 1 : 0, kind: "boolean" },
    };
  }
  const binding = vars.get(expr.name);
  if (binding !== undefined) return { ok: true, value: binding.value };
  return { ok: false, error: { type: "UnknownIdentifier", name: expr.name } };
}

/**
 * A successful type-check result.
 */
interface CheckOk {
  ok: true;
}

/**
 * The result of a type check: success or a structured error.
 */
type CheckResult = CheckOk | Err;

/**
 * Statically check that every assignment matches the kind of its binding.
 * Walks all statements, including both branches of every `if`, so type
 * errors are reported even in branches that would not execute.
 *
 * @param stmts - The statements to check.
 * @param kinds - The kinds of declared variables, shared with enclosing blocks.
 * @returns Success, or a structured error.
 */
function typeCheck(
  stmts: readonly Stmt[],
  kinds: Map<string, Value["kind"]>,
): CheckResult {
  for (const stmt of stmts) {
    if (stmt.type === "Block") {
      const err = typeCheck(stmt.stmts, kinds);
      if (!err.ok) return err;
      continue;
    }
    if (stmt.type === "If") {
      const err = typeCheck(stmt.then, kinds);
      if (!err.ok) return err;
      const elseErr = typeCheck(stmt.else, kinds);
      if (!elseErr.ok) return elseErr;
      continue;
    }
    const r = exprKind(stmt.value, kinds);
    if (!r.ok) return r;
    const kind = r.kind;
    if (stmt.type === "Assign") {
      const expected = kinds.get(stmt.name);
      if (expected !== undefined && expected !== kind) {
        return {
          ok: false,
          error: {
            type: "TypeMismatch",
            name: stmt.name,
            position: stmt.pos,
            expected,
            actual: kind,
          },
        };
      }
      continue;
    }
    if (stmt.type === "LetDecl") {
      kinds.set(stmt.name, kind);
    }
  }
  return { ok: true };
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
    if (stmt.type === "If") {
      const cond = evalExpr(stmt.cond, vars);
      if (!cond.ok) return cond;
      const branch = cond.value.value !== 0 ? stmt.then : stmt.else;
      const r = exec(branch, vars);
      if (!r.ok) return r;
      continue;
    }
    const value = evalExpr(stmt.value, vars);
    if (!value.ok) return value;
    if (stmt.type === "Return") return { ok: true, value: value.value.value };
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
  const err = typeCheck(parsed.program.stmts, new Map());
  if (!err.ok) return err;
  return exec(parsed.program.stmts, new Map());
}

/**
 * A determined expression kind.
 */
interface ExprKind {
  ok: true;
  kind: Value["kind"];
}

/**
 * Determine the kind of an expression's value, verifying that every
 * referenced identifier is declared.
 *
 * @param expr - The expression to inspect.
 * @param kinds - The kinds of declared variables, for identifier resolution.
 * @returns The kind of the value the expression produces, or a structured error.
 */
function exprKind(expr: Expr, kinds: Map<string, Value["kind"]>): ExprKind | Err {
  if (expr.type === "Number") return { ok: true, kind: "number" };
  if (expr.type === "Boolean") return { ok: true, kind: "boolean" };
  if (expr.type === "Identifier") {
    const kind = kinds.get(expr.name);
    if (kind === undefined) {
      return { ok: false, error: { type: "UnknownIdentifier", name: expr.name } };
    }
    return { ok: true, kind };
  }
  const left = exprKind(expr.left, kinds);
  if (!left.ok) return left;
  const right = exprKind(expr.right, kinds);
  if (!right.ok) return right;
  return { ok: true, kind: "boolean" };
}
