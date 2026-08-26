import type { TuffError } from "./errors.ts";
import { parse } from "./parser.ts";
import type { Assign, Stmt } from "./parser.ts";
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
 * Static type information for a declared variable.
 */
interface TypeInfo {
  kind: Value["kind"];
  mutable: boolean;
}

/**
 * Statically check that every assignment matches the kind and mutability
 * of its binding, and that every referenced identifier is declared.
 * Walks all statements, including both branches of every `if`, so errors
 * are reported even in branches that would not execute.
 *
 * @param stmts - The statements to check.
 * @param types - The types of declared variables; each block and `if`
 * branch gets a copy, so declarations inside them are not visible outside.
 * @returns Success, or a structured error.
 */
function typeCheck(
  stmts: readonly Stmt[],
  types: Map<string, TypeInfo>,
): CheckResult {
  for (const stmt of stmts) {
    if (stmt.type === "Block") {
      const err = typeCheck(stmt.stmts, new Map(types));
      if (!err.ok) return err;
      continue;
    }
    if (stmt.type === "If") {
      const cond = exprKind(stmt.cond, types);
      if (!cond.ok) return cond;
      const err = typeCheck(stmt.then, new Map(types));
      if (!err.ok) return err;
      const elseErr = typeCheck(stmt.else, new Map(types));
      if (!elseErr.ok) return elseErr;
      continue;
    }
    const r = exprKind(stmt.value, types);
    if (!r.ok) return r;
    if (stmt.type === "Assign") {
      const err = checkAssign(stmt, r.kind, types);
      if (!err.ok) return err;
      continue;
    }
    if (stmt.type === "LetDecl") {
      types.set(stmt.name, { kind: r.kind, mutable: stmt.mutable });
    }
  }
  return { ok: true };
}

/**
 * Statically check an assignment against its binding's type information.
 *
 * @param stmt - The assignment statement.
 * @param kind - The kind of the assigned expression.
 * @param types - The types of declared variables.
 * @returns Success, or a structured error.
 */
function checkAssign(
  stmt: Assign,
  kind: Value["kind"],
  types: Map<string, TypeInfo>,
): CheckResult {
  const info = types.get(stmt.name);
  if (info === undefined) {
    return { ok: false, error: { type: "UnknownIdentifier", name: stmt.name } };
  }
  if (!info.mutable) {
    return {
      ok: false,
      error: {
        type: "ImmutableAssignment",
        name: stmt.name,
        position: stmt.pos,
      },
    };
  }
  if (info.kind !== kind) {
    return {
      ok: false,
      error: {
        type: "TypeMismatch",
        name: stmt.name,
        position: stmt.pos,
        expected: info.kind,
        actual: kind,
      },
    };
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
function exprKind(expr: Expr, types: Map<string, TypeInfo>): ExprKind | Err {
  if (expr.type === "Number") return { ok: true, kind: "number" };
  if (expr.type === "Boolean") return { ok: true, kind: "boolean" };
  if (expr.type === "Identifier") {
    const info = types.get(expr.name);
    if (info === undefined) {
      return {
        ok: false,
        error: { type: "UnknownIdentifier", name: expr.name },
      };
    }
    return { ok: true, kind: info.kind };
  }
  const left = exprKind(expr.left, types);
  if (!left.ok) return left;
  const right = exprKind(expr.right, types);
  if (!right.ok) return right;
  return { ok: true, kind: "boolean" };
}
