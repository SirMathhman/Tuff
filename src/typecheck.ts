import type { TuffError } from "./errors.ts";
import type { Assign, Stmt } from "./parser.ts";
import type { Expr } from "./expr.ts";

/**
 * The kind of a value: a number or a boolean.
 */
type Kind = "number" | "boolean";

/**
 * A successful type-check result.
 */
interface CheckOk {
  ok: true;
}

/**
 * A failed type-check result.
 */
interface CheckErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of a type check: success or a structured error.
 */
type CheckResult = CheckOk | CheckErr;

/**
 * Static type information for a declared variable.
 */
interface TypeInfo {
  kind: Kind;
  mutable: boolean;
}

/**
 * Statically check that every assignment matches the kind and mutability
 * of its binding, and that every referenced identifier is declared.
 * Walks all statements, including both branches of every `if` and every
 * `while` body, so errors are reported even in code that would not execute.
 *
 * @param stmts - The statements to check.
 * @param types - The types of declared variables; each block and `if`
 * branch gets a copy, so declarations inside them are not visible outside.
 * @returns Success, or a structured error.
 */
export function typeCheck(
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
    if (stmt.type === "While") {
      const cond = exprKind(stmt.cond, types);
      if (!cond.ok) return cond;
      const err = typeCheck(stmt.body, new Map(types));
      if (!err.ok) return err;
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
  kind: Kind,
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
 * A determined expression kind.
 */
interface ExprKind {
  ok: true;
  kind: Kind;
}

/**
 * Determine the kind of an expression's value, verifying that every
 * referenced identifier is declared.
 *
 * @param expr - The expression to inspect.
 * @param types - The kinds of declared variables, for identifier resolution.
 * @returns The kind of the value the expression produces, or a structured error.
 */
function exprKind(expr: Expr, types: Map<string, TypeInfo>): ExprKind | CheckErr {
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
  if (expr.op === "+" || expr.op === "-" || expr.op === "*") {
    if (left.kind !== "number") {
      return {
        ok: false,
        error: {
          type: "OperandTypeMismatch",
          position: expr.left.pos,
          expected: "number",
          actual: left.kind,
        },
      };
    }
    if (right.kind !== "number") {
      return {
        ok: false,
        error: {
          type: "OperandTypeMismatch",
          position: expr.right.pos,
          expected: "number",
          actual: right.kind,
        },
      };
    }
    return { ok: true, kind: "number" };
  }
  return { ok: true, kind: "boolean" };
}
