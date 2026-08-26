import type {
  Assign,
  BinaryExpr,
  BlockExpr,
  DerefExpr,
  Expr,
  FieldAccessExpr,
  For,
  LetDecl,
  RefExpr,
  Return,
  Stmt,
} from "./ast.ts";
import { describeType, mismatch, sameType } from "./types.ts";
import type { ExprTypeResult, TuffType, TypeInfo } from "./types.ts";

/**
 * A statement that carries a value expression: a return, an assignment,
 * or a let declaration.
 */
type ValueStmt = Return | Assign | LetDecl;

/**
 * Determine the type of an expression's value, verifying that every
 * referenced identifier is declared.
 *
 * @param expr - The expression to inspect.
 * @param types - The types of declared variables, for identifier resolution.
 * @returns The type of the value the expression produces, or a structured error.
 */
export function exprType(
  expr: Expr,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  if (expr.type === "Number") return { ok: true, type: { kind: "number" } };
  if (expr.type === "Boolean") return { ok: true, type: { kind: "boolean" } };
  if (expr.type === "Identifier") {
    const info = types.get(expr.name);
    if (info === undefined) {
      return {
        ok: false,
        error: { type: "UnknownIdentifier", name: expr.name },
      };
    }
    return { ok: true, type: info.type };
  }
  if (expr.type === "Tuple") {
    const elements: TuffType[] = [];
    for (const el of expr.elements) {
      const r = exprType(el, types);
      if (!r.ok) return r;
      elements.push(r.type);
    }
    return { ok: true, type: { kind: "tuple", elements } };
  }
  if (expr.type === "FieldAccess") return fieldType(expr, types);
  if (expr.type === "Ref") return refType(expr, types);
  if (expr.type === "Deref") return derefType(expr, types);
  if (expr.type === "BlockExpr") return blockType(expr, types);
  return binaryType(expr, types);
}

/**
 * Determine the type of a field access, verifying the object is a tuple
 * and the index is in range.
 *
 * @param expr - The field access expression to inspect.
 * @param types - The types of declared variables.
 * @returns The type of the accessed element, or a structured error.
 */
function fieldType(
  expr: FieldAccessExpr,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  const obj = exprType(expr.object, types);
  if (!obj.ok) return obj;
  if (obj.type.kind !== "tuple") {
    return mismatch(expr.pos, "tuple", obj.type.kind);
  }
  const el = obj.type.elements[expr.index];
  if (el === undefined) return mismatch(expr.pos, "tuple", "out-of-range");
  return { ok: true, type: el };
}

/**
 * Determine the type of a reference expression, verifying the operand is
 * a declared variable.
 *
 * @param expr - The reference expression to inspect.
 * @param types - The types of declared variables.
 * @returns The reference type, or a structured error.
 */
function refType(expr: RefExpr, types: Map<string, TypeInfo>): ExprTypeResult {
  if (expr.operand.type !== "Identifier") {
    return mismatch(expr.pos, "identifier", "expression");
  }
  const info = types.get(expr.operand.name);
  if (info === undefined) {
    return {
      ok: false,
      error: { type: "UnknownIdentifier", name: expr.operand.name },
    };
  }
  return { ok: true, type: { kind: "ref", pointsTo: info.type } };
}

/**
 * Determine the type of a dereference expression, verifying the operand
 * is a reference.
 *
 * @param expr - The dereference expression to inspect.
 * @param types - The types of declared variables.
 * @returns The pointed-to type, or a structured error.
 */
function derefType(
  expr: DerefExpr,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  const operand = exprType(expr.operand, types);
  if (!operand.ok) return operand;
  if (operand.type.kind !== "ref") {
    return mismatch(expr.pos, "ref", operand.type.kind);
  }
  return { ok: true, type: operand.type.pointsTo };
}

/**
 * Determine the type of a block expression: its statements are checked in
 * a nested scope, and the block takes the type of the value they return.
 *
 * @param expr - The block expression to inspect.
 * @param types - The types of declared variables in the enclosing scope.
 * @returns The type of the block's value, or a structured error.
 */
function blockType(
  expr: BlockExpr,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  return typeCheck(expr.stmts, new Map(types));
}

/**
 * Determine the type of a binary operator expression.
 *
 * @param expr - The binary expression to inspect.
 * @param types - The types of declared variables.
 * @returns The type of the result, or a structured error.
 */
function binaryType(
  expr: BinaryExpr,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  const left = exprType(expr.left, types);
  if (!left.ok) return left;
  const right = exprType(expr.right, types);
  if (!right.ok) return right;
  if (expr.op !== "+" && expr.op !== "-" && expr.op !== "*") {
    return { ok: true, type: { kind: "boolean" } };
  }
  if (left.type.kind !== "number") {
    return mismatch(expr.left.pos, "number", left.type.kind);
  }
  if (right.type.kind !== "number") {
    return mismatch(expr.right.pos, "number", right.type.kind);
  }
  return { ok: true, type: { kind: "number" } };
}

/**
 * Statically check that every assignment matches the kind and mutability
 * of its binding and that every referenced identifier is declared, and
 * determine the type of the value the statements return.
 * Walks all statements, including both branches of every `if` and every
 * `while` body, so errors are reported even in code that would not execute.
 *
 * @param stmts - The statements to check.
 * @param types - The types of declared variables; each block and `if`
 * branch gets a copy, so declarations inside them are not visible outside.
 * @returns The type of the returned value, or a structured error.
 */
export function typeCheck(
  stmts: readonly Stmt[],
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  let value: TuffType = { kind: "number" };
  let returned = false;
  for (const stmt of stmts) {
    const r = checkStmt(stmt, types);
    if (!r.ok) return r;
    if (stmt.type === "Return" && !returned) {
      value = r.type;
      returned = true;
    }
  }
  return { ok: true, type: value };
}

/**
 * Check a single statement, yielding the type of the value it carries.
 *
 * @param stmt - The statement to check.
 * @param types - The types of declared variables.
 * @returns The statement's value type, or a structured error.
 */
function checkStmt(stmt: Stmt, types: Map<string, TypeInfo>): ExprTypeResult {
  if (stmt.type === "Block") {
    return discardValue(typeCheck(stmt.stmts, new Map(types)));
  }
  if (stmt.type === "If") {
    const cond = exprType(stmt.cond, types);
    if (!cond.ok) return cond;
    const then = typeCheck(stmt.then, new Map(types));
    if (!then.ok) return then;
    return discardValue(typeCheck(stmt.else, new Map(types)));
  }
  if (stmt.type === "While") {
    const cond = exprType(stmt.cond, types);
    if (!cond.ok) return cond;
    return discardValue(typeCheck(stmt.body, new Map(types)));
  }
  if (stmt.type === "For") return checkFor(stmt, types);
  return checkValueStmt(stmt, types);
}

/**
 * Drop the value type of a nested statement list: a value returned from
 * inside a nested block or branch does not become the enclosing value.
 *
 * @param result - The nested statement list's check result.
 * @returns The same failure, or a plain `number` type on success.
 */
function discardValue(result: ExprTypeResult): ExprTypeResult {
  if (!result.ok) return result;
  return { ok: true, type: { kind: "number" } };
}

/**
 * Check a `for` loop: both range bounds must be numbers, and the body is
 * checked with the loop variable bound as a mutable number.
 *
 * @param stmt - The for statement to check.
 * @param types - The types of declared variables in the enclosing scope.
 * @returns A plain `number` type, or a structured error.
 */
function checkFor(stmt: For, types: Map<string, TypeInfo>): ExprTypeResult {
  const start = exprType(stmt.start, types);
  if (!start.ok) return start;
  if (start.type.kind !== "number") {
    return mismatch(stmt.start.pos, "number", start.type.kind);
  }
  const end = exprType(stmt.end, types);
  if (!end.ok) return end;
  if (end.type.kind !== "number") {
    return mismatch(stmt.end.pos, "number", end.type.kind);
  }
  const bodyTypes = new Map(types);
  bodyTypes.set(stmt.name, { type: { kind: "number" }, mutable: true });
  return discardValue(typeCheck(stmt.body, bodyTypes));
}

/**
 * Check a statement that carries a value expression: `return`, `assign`,
 * or `let` declaration.
 *
 * @param stmt - The statement to check (not a block, if, while, or for).
 * @param types - The types of declared variables.
 * @returns The type of the statement's value, or a structured error.
 */
function checkValueStmt(
  stmt: ValueStmt,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
  const r = exprType(stmt.value, types);
  if (!r.ok) return r;
  if (stmt.type === "Return") {
    if (r.type.kind === "tuple") {
      return mismatch(stmt.value.pos, "number | boolean", "tuple");
    }
    return r;
  }
  if (stmt.type === "Assign") return checkAssign(stmt, r.type, types);
  types.set(stmt.name, { type: r.type, mutable: stmt.mutable });
  return { ok: true, type: { kind: "number" } };
}

/**
 * Statically check an assignment against its binding's type information.
 *
 * @param stmt - The assignment statement.
 * @param type - The type of the assigned expression.
 * @param types - The types of declared variables.
 * @returns A plain `number` type, or a structured error.
 */
function checkAssign(
  stmt: Assign,
  type: TuffType,
  types: Map<string, TypeInfo>,
): ExprTypeResult {
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
  return { ok: true, type: { kind: "number" } };
}
