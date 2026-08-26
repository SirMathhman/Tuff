import type { TuffError } from "./errors.ts";
import type { Assign, Stmt } from "./parser.ts";
import type { BinaryExpr, Expr, FieldAccessExpr } from "./expr.ts";

/**
 * The static type of a number value.
 */
interface NumberType {
  kind: "number";
}

/**
 * The static type of a boolean value.
 */
interface BooleanType {
  kind: "boolean";
}

/**
 * The static type of a tuple value: an ordered list of element types.
 */
interface TupleType {
  kind: "tuple";
  elements: TuffType[];
}

/**
 * The static type of a value: a number, a boolean, or a tuple of types.
 */
type TuffType = NumberType | BooleanType | TupleType;

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
  type: TuffType;
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
    const r = exprType(stmt.value, types);
    if (!r.ok) return r;
    if (stmt.type === "Return" && r.type.kind === "tuple") {
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
    if (stmt.type === "Assign") {
      const err = checkAssign(stmt, r.type, types);
      if (!err.ok) return err;
      continue;
    }
    if (stmt.type === "LetDecl") {
      types.set(stmt.name, { type: r.type, mutable: stmt.mutable });
    }
  }
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

/**
 * Whether two static types are identical.
 *
 * @param a - The first type.
 * @param b - The second type.
 * @returns True when the types match exactly.
 */
function sameType(a: TuffType, b: TuffType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tuple" && b.kind === "tuple") {
    return (
      a.elements.length === b.elements.length &&
      a.elements.every((el, i) => sameType(el, b.elements[i] as TuffType))
    );
  }
  return true;
}

/**
 * Render a static type as a short human-readable name for error messages.
 *
 * @param type - The type to describe.
 * @returns A name such as `number`, `boolean`, or `tuple`.
 */
function describeType(type: TuffType): string {
  return type.kind;
}

/**
 * A determined expression type.
 */
interface ExprType {
  ok: true;
  type: TuffType;
}

/**
 * Determine the type of an expression's value, verifying that every
 * referenced identifier is declared.
 *
 * @param expr - The expression to inspect.
 * @param types - The types of declared variables, for identifier resolution.
 * @returns The type of the value the expression produces, or a structured error.
 */
function exprType(
  expr: Expr,
  types: Map<string, TypeInfo>,
): ExprType | CheckErr {
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
  if (expr.type === "FieldAccess") {
    return fieldType(expr, types);
  }
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
): ExprType | CheckErr {
  const obj = exprType(expr.object, types);
  if (!obj.ok) return obj;
  if (obj.type.kind !== "tuple") {
    return {
      ok: false,
      error: {
        type: "OperandTypeMismatch",
        position: expr.pos,
        expected: "tuple",
        actual: obj.type.kind,
      },
    };
  }
  const el = obj.type.elements[expr.index];
  if (el === undefined) {
    return {
      ok: false,
      error: {
        type: "OperandTypeMismatch",
        position: expr.pos,
        expected: "tuple",
        actual: "out-of-range",
      },
    };
  }
  return { ok: true, type: el };
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
): ExprType | CheckErr {
  const left = exprType(expr.left, types);
  if (!left.ok) return left;
  const right = exprType(expr.right, types);
  if (!right.ok) return right;
  if (expr.op === "+" || expr.op === "-" || expr.op === "*") {
    if (left.type.kind !== "number") {
      return {
        ok: false,
        error: {
          type: "OperandTypeMismatch",
          position: expr.left.pos,
          expected: "number",
          actual: left.type.kind,
        },
      };
    }
    if (right.type.kind !== "number") {
      return {
        ok: false,
        error: {
          type: "OperandTypeMismatch",
          position: expr.right.pos,
          expected: "number",
          actual: right.type.kind,
        },
      };
    }
    return { ok: true, type: { kind: "number" } };
  }
  return { ok: true, type: { kind: "boolean" } };
}
