import type { Value } from "./types";

export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=";
export type LogicalOperator = "&&" | "||";
export type UnaryOperator = "-" | "!";
export type AssignOperator = "=" | "+=" | "-=" | "*=" | "/=";

export const binaryOps: Record<BinaryOperator, (left: number, right: number) => Value> = {
  "+": (l, r) => l + r,
  "-": (l, r) => l - r,
  "*": (l, r) => l * r,
  "/": (l, r) => Math.trunc(l / r),
  "%": (l, r) => l % r,
  "<": (l, r) => l < r,
  ">": (l, r) => l > r,
  "<=": (l, r) => l <= r,
  ">=": (l, r) => l >= r,
  "==": (l, r) => l === r,
  "!=": (l, r) => l !== r,
};

export const logicalOps: Record<LogicalOperator, (left: boolean, right: boolean) => boolean> = {
  "&&": (l, r) => l && r,
  "||": (l, r) => l || r,
};

export const unaryOps: Record<UnaryOperator, (operand: Value) => Value> = {
  "-": (operand) => {
    if (typeof operand !== "number") {
      throw new Error("Unary minus requires a number");
    }
    return -operand;
  },
  "!": (operand) => !(operand !== false && operand !== 0),
};

export const assignOps: Record<Exclude<AssignOperator, "=">, (left: number, right: number) => number> = {
  "+=": (l, r) => l + r,
  "-=": (l, r) => l - r,
  "*=": (l, r) => l * r,
  "/=": (l, r) => Math.trunc(l / r),
};
