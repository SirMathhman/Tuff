import type { Value } from "./value";
import { TypeError } from "./errors";

export type BinaryOp = "+" | "-" | "*" | "||" | "&&" | "==";

function requireBoolean(value: Value, op: BinaryOp): boolean {
  if (value.type !== "boolean") {
    throw new TypeError(`Operator ${op} requires boolean operands`);
  }
  return value.value;
}

function requireNumber(value: Value, op: BinaryOp): number {
  if (value.type !== "number") {
    throw new TypeError(`Operator ${op} requires numeric operands`);
  }
  return value.value;
}

export const BINARY_EVALUATORS: Record<BinaryOp, (left: Value, right: Value) => Value> = {
  "+": (left, right) => ({ type: "number", value: requireNumber(left, "+") + requireNumber(right, "+") }),
  "-": (left, right) => ({ type: "number", value: requireNumber(left, "-") - requireNumber(right, "-") }),
  "*": (left, right) => ({ type: "number", value: requireNumber(left, "*") * requireNumber(right, "*") }),
  "||": (left, right) => ({ type: "boolean", value: requireBoolean(left, "||") || requireBoolean(right, "||") }),
  "&&": (left, right) => ({ type: "boolean", value: requireBoolean(left, "&&") && requireBoolean(right, "&&") }),
  "==": (left, right) => ({ type: "boolean", value: left.type === right.type && left.value === right.value }),
};
