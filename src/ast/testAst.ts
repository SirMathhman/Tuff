import { ExprType, StatementType } from "./index.ts";
import type { Expr, FnParam, Program, Statement, StructField, StructFieldInit } from "./index.ts";

export const pos = { line: 1, column: 1 };

export function num(value: number, suffix?: string): Expr {
  return { type: ExprType.Number, value, suffix, position: pos };
}

export function bool(value: boolean): Expr {
  return { type: ExprType.Boolean, value, position: pos };
}

export function ident(name: string): Expr {
  return { type: ExprType.Identifier, name, position: pos };
}

export function bin(op: string, left: Expr, right: Expr): Expr {
  return { type: ExprType.Binary, op, left, right, position: pos };
}

export function ref(operand: Expr, mutable = false): Expr {
  return { type: ExprType.Ref, mutable, operand, position: pos };
}

export function deref(operand: Expr): Expr {
  return { type: ExprType.Deref, operand, position: pos };
}

export function array(elements: readonly Expr[]): Expr {
  return { type: ExprType.Array, elements, position: pos };
}

export function index(arr: Expr, idx: Expr): Expr {
  return { type: ExprType.Index, array: arr, index: idx, position: pos };
}

export function call(callee: string, args: readonly Expr[]): Expr {
  return { type: ExprType.Call, callee, args, position: pos };
}

export function structLit(structName: string, fields: readonly StructFieldInit[]): Expr {
  return { type: ExprType.Struct, structName, fields, position: pos };
}

export function field(object: Expr, fieldName: string): Expr {
  return { type: ExprType.Field, object, field: fieldName, position: pos };
}

export function letStmt(
  name: string,
  value: Expr,
  mutable = false,
  annotation: string | null = null,
): Statement {
  return { type: StatementType.Let, mutable, name, annotation, value, position: pos };
}

export function assignStmt(target: Expr, value: Expr): Statement {
  return { type: StatementType.Assign, target, value, position: pos };
}

export function returnStmt(value: Expr): Statement {
  return { type: StatementType.Return, value, position: pos };
}

export function ifStmt(
  condition: Expr,
  then: readonly Statement[],
  elseBranch: readonly Statement[] | null = null,
): Statement {
  return { type: StatementType.If, condition, then, else: elseBranch, position: pos };
}

export function whileStmt(condition: Expr, body: readonly Statement[]): Statement {
  return { type: StatementType.While, condition, body, position: pos };
}

export function fnDecl(
  name: string,
  params: readonly FnParam[],
  returnType: string,
  body: readonly Statement[],
): Statement {
  return { type: StatementType.FnDecl, name, params, returnType, body, position: pos };
}

export function structDecl(name: string, fields: readonly StructField[]): Statement {
  return { type: StatementType.StructDecl, name, fields, position: pos };
}

export function prog(statements: readonly Statement[]): Program {
  return { statements };
}
