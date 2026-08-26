import type { Assign, For, LetDecl, Return, Stmt } from "./parser.ts";
import { describeType, exprType, sameType } from "./typecheck-expr.ts";
import type { CheckResult, TuffType, TypeInfo } from "./typecheck-expr.ts";

/**
 * A statement that carries a value expression: a return, an assignment,
 * or a let declaration.
 */
type ValueStmt = Return | Assign | LetDecl;

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
      const cond = exprType(stmt.cond, types);
      if (!cond.ok) return cond;
      const err = typeCheck(stmt.then, new Map(types));
      if (!err.ok) return err;
      const elseErr = typeCheck(stmt.else, new Map(types));
      if (!elseErr.ok) return elseErr;
      continue;
    }
    if (stmt.type === "While") {
      const cond = exprType(stmt.cond, types);
      if (!cond.ok) return cond;
      const err = typeCheck(stmt.body, new Map(types));
      if (!err.ok) return err;
      continue;
    }
    if (stmt.type === "For") {
      const err = checkFor(stmt, types);
      if (!err.ok) return err;
      continue;
    }
    const err = checkValueStmt(stmt, types);
    if (!err.ok) return err;
  }
  return { ok: true };
}

/**
 * Check a `for` loop: both range bounds must be numbers, and the body is
 * checked with the loop variable bound as a mutable number.
 *
 * @param stmt - The for statement to check.
 * @param types - The types of declared variables in the enclosing scope.
 * @returns Success, or a structured error.
 */
function checkFor(stmt: For, types: Map<string, TypeInfo>): CheckResult {
  const start = exprType(stmt.start, types);
  if (!start.ok) return start;
  if (start.type.kind !== "number") {
    return {
      ok: false,
      error: {
        type: "OperandTypeMismatch",
        position: stmt.start.pos,
        expected: "number",
        actual: start.type.kind,
      },
    };
  }
  const end = exprType(stmt.end, types);
  if (!end.ok) return end;
  if (end.type.kind !== "number") {
    return {
      ok: false,
      error: {
        type: "OperandTypeMismatch",
        position: stmt.end.pos,
        expected: "number",
        actual: end.type.kind,
      },
    };
  }
  const bodyTypes = new Map(types);
  bodyTypes.set(stmt.name, { type: { kind: "number" }, mutable: true });
  return typeCheck(stmt.body, bodyTypes);
}

/**
 * Check a statement that carries a value expression: `return`, `assign`,
 * or `let` declaration.
 *
 * @param stmt - The statement to check (not a block, if, while, or for).
 * @param types - The types of declared variables.
 * @returns Success, or a structured error.
 */
function checkValueStmt(
  stmt: ValueStmt,
  types: Map<string, TypeInfo>,
): CheckResult {
  const r = exprType(stmt.value, types);
  if (!r.ok) return r;
  if (stmt.type === "Return") {
    if (r.type.kind === "tuple") {
      return {
        ok: false,
        error: {
          type: "OperandTypeMismatch",
          position: stmt.value.pos,
          expected: "number | boolean",
          actual: "tuple",
        },
      };
    }
    return { ok: true };
  }
  if (stmt.type === "Assign") {
    return checkAssign(stmt, r.type, types);
  }
  types.set(stmt.name, { type: r.type, mutable: stmt.mutable });
  return { ok: true };
}

/**
 * Statically check an assignment against its binding's type information.
 *
 * @param stmt - The assignment statement.
 * @param type - The type of the assigned expression.
 * @param types - The types of declared variables.
 * @returns Success, or a structured error.
 */
function checkAssign(
  stmt: Assign,
  type: TuffType,
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
  if (!sameType(info.type, type)) {
    return {
      ok: false,
      error: {
        type: "TypeMismatch",
        name: stmt.name,
        position: stmt.pos,
        expected: describeType(info.type),
        actual: describeType(type),
      },
    };
  }
  return { ok: true };
}
