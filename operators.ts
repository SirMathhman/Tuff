import type { Value } from "./value";
import { TypeError } from "./errors";

export type BinaryOp = "+" | "-" | "*" | "||" | "&&" | "==" | "<";

function requireType<T extends Value["type"]>(
  value: Value,
  type: T,
  op: BinaryOp
): Extract<Value, { type: T }> {
  if (value.type !== type) {
    throw new TypeError(`Operator ${op} requires ${type} operands`);
  }
  return value as Extract<Value, { type: T }>;
}

export const BINARY_EVALUATORS: Record<BinaryOp, (left: Value, right: Value) => Value> = {
  "+": (left, right) => ({ type: "number", value: requireType(left, "number", "+").value + requireType(right, "number", "+").value }),
  "-": (left, right) => ({ type: "number", value: requireType(left, "number", "-").value - requireType(right, "number", "-").value }),
  "*": (left, right) => ({ type: "number", value: requireType(left, "number", "*").value * requireType(right, "number", "*").value }),
  "||": (left, right) => ({ type: "boolean", value: requireType(left, "boolean", "||").value || requireType(right, "boolean", "||").value }),
  "&&": (left, right) => ({ type: "boolean", value: requireType(left, "boolean", "&&").value && requireType(right, "boolean", "&&").value }),
  "==": (left, right) => ({ type: "boolean", value: left.type === right.type && left.value === right.value }),
  "<": (left, right) => ({ type: "boolean", value: requireType(left, "number", "<").value < requireType(right, "number", "<").value }),
};
