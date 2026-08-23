import type { Expr, Program, Statement } from "./parser.ts";

export const pos = { line: 1, column: 1 };

export function num(value: number, suffix?: string): Expr {
  return { type: "number", value, suffix, position: pos };
}

export function bool(value: boolean): Expr {
  return { type: "boolean", value, position: pos };
}

export function ident(name: string): Expr {
  return { type: "identifier", name, position: pos };
}

export function bin(op: string, left: Expr, right: Expr): Expr {
  return { type: "binary", op, left, right, position: pos };
}

export function ref(operand: Expr, mutable = false): Expr {
  return { type: "ref", mutable, operand, position: pos };
}

export function deref(operand: Expr): Expr {
  return { type: "deref", operand, position: pos };
}

export function array(elements: readonly Expr[]): Expr {
  return { type: "array", elements, position: pos };
}

export function index(arr: Expr, idx: Expr): Expr {
  return { type: "index", array: arr, index: idx, position: pos };
}

export function letStmt(name: string, value: Expr, mutable = false): Statement {
  return { type: "let", mutable, name, value, position: pos };
}

export function assignStmt(target: Expr, value: Expr): Statement {
  return { type: "assign", target, value, position: pos };
}

export function returnStmt(value: Expr): Statement {
  return { type: "return", value, position: pos };
}

export function ifStmt(
  condition: Expr,
  then: readonly Statement[],
  elseBranch: readonly Statement[] | null = null,
): Statement {
  return { type: "if", condition, then, else: elseBranch, position: pos };
}

export function whileStmt(condition: Expr, body: readonly Statement[]): Statement {
  return { type: "while", condition, body, position: pos };
}

export function prog(statements: readonly Statement[]): Program {
  return { statements };
}
