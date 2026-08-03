import type { Value } from "./value";
import { toNumber } from "./value";

export type BinaryOp = "+" | "-" | "*" | "||" | "&&" | "==";

function requireBoolean(value: Value, op: BinaryOp): boolean {
  if (value.type !== "boolean") {
    throw new Error(`Operator ${op} requires boolean operands`);
  }
  return value.value;
}

export const BINARY_EVALUATORS: Record<BinaryOp, (left: Value, right: Value) => Value> = {
  "+": (left, right) => ({ type: "number", value: toNumber(left) + toNumber(right) }),
  "-": (left, right) => ({ type: "number", value: toNumber(left) - toNumber(right) }),
  "*": (left, right) => ({ type: "number", value: toNumber(left) * toNumber(right) }),
  "||": (left, right) => ({ type: "boolean", value: requireBoolean(left, "||") || requireBoolean(right, "||") }),
  "&&": (left, right) => ({ type: "boolean", value: requireBoolean(left, "&&") && requireBoolean(right, "&&") }),
  "==": (left, right) => ({ type: "boolean", value: left.type === right.type && left.value === right.value }),
};
