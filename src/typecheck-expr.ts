import type { TuffError } from "./errors.ts";
import type {
  BinaryExpr,
  DerefExpr,
  Expr,
  FieldAccessExpr,
  RefExpr,
} from "./expr.ts";
import { tupleElementsEqual } from "./util.ts";

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
 * The static type of a reference value: a pointer to a value of the
 * given type.
 */
interface RefType {
  kind: "ref";
  pointsTo: TuffType;
}

/**
 * The static type of a value: a number, a boolean, a tuple of types, or
 * a reference.
 */
export type TuffType = NumberType | BooleanType | TupleType | RefType;

/**
 * A successful type-check result.
 */
export interface CheckOk {
  ok: true;
}

/**
 * A failed type-check result.
 */
export interface CheckErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of a type check: success or a structured error.
 */
export type CheckResult = CheckOk | CheckErr;

/**
 * Static type information for a declared variable.
 */
export interface TypeInfo {
  type: TuffType;
  mutable: boolean;
}

/**
 * Whether two static types are identical.
 *
 * @param a - The first type.
 * @param b - The second type.
 * @returns True when the types match exactly.
 */
export function sameType(a: TuffType, b: TuffType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tuple" && b.kind === "tuple") {
    return tupleElementsEqual(a.elements, b.elements, sameType);
  }
  if (a.kind === "ref" && b.kind === "ref") {
    return sameType(a.pointsTo, b.pointsTo);
  }
  return true;
}

/**
 * Render a static type as a short human-readable name for error messages.
 *
 * @param type - The type to describe.
 * @returns A name such as `number`, `boolean`, or `tuple`.
 */
export function describeType(type: TuffType): string {
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
export function exprType(
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
  if (expr.type === "Ref") {
    return refType(expr, types);
  }
  if (expr.type === "Deref") {
    return derefType(expr, types);
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
 * Determine the type of a reference expression, verifying the operand is
 * a declared variable.
 *
 * @param expr - The reference expression to inspect.
 * @param types - The types of declared variables.
 * @returns The reference type, or a structured error.
 */
function refType(
  expr: RefExpr,
  types: Map<string, TypeInfo>,
): ExprType | CheckErr {
  if (expr.operand.type !== "Identifier") {
    return {
      ok: false,
      error: {
        type: "OperandTypeMismatch",
        position: expr.pos,
        expected: "identifier",
        actual: "expression",
      },
    };
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
): ExprType | CheckErr {
  const operand = exprType(expr.operand, types);
  if (!operand.ok) return operand;
  if (operand.type.kind !== "ref") {
    return {
      ok: false,
      error: {
        type: "OperandTypeMismatch",
        position: expr.pos,
        expected: "ref",
        actual: operand.type.kind,
      },
    };
  }
  return { ok: true, type: operand.type.pointsTo };
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
