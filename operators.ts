import type { Value } from "./value";

export type BinaryOp = "+" | "-" | "*" | "||" | "&&" | "==";

export const BINARY_EVALUATORS: Record<BinaryOp, (left: Value, right: Value) => Value> = {
  "+": (left, right) => ({ type: "number", value: toNumber(left) + toNumber(right) }),
  "-": (left, right) => ({ type: "number", value: toNumber(left) - toNumber(right) }),
  "*": (left, right) => ({ type: "number", value: toNumber(left) * toNumber(right) }),
  "||": (left, right) => ({ type: "boolean", value: toNumber(left) !== 0 || toNumber(right) !== 0 }),
  "&&": (left, right) => ({ type: "boolean", value: toNumber(left) !== 0 && toNumber(right) !== 0 }),
  "==": (left, right) => ({ type: "boolean", value: left.type === right.type && left.value === right.value }),
};

function toNumber(value: Value): number {
  return value.type === "number" ? value.value : value.value ? 1 : 0;
}
