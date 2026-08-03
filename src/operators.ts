import type { Value } from "./types";

export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=";
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

export const assignOps: Record<Exclude<AssignOperator, "=">, (left: number, right: number) => number> = {
  "+=": (l, r) => l + r,
  "-=": (l, r) => l - r,
  "*=": (l, r) => l * r,
  "/=": (l, r) => Math.trunc(l / r),
};
