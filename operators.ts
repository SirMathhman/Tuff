import type { Value } from "./value";
import { TypeError } from "./errors";

export type BinaryOp = "+" | "-" | "*" | "||" | "&&" | "==" | "!=" | "<" | "<=" | ">" | ">=";

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

export interface OperatorInfo {
  precedence: number;
  evaluate: (left: Value, right: Value) => Value;
}

export const OPERATORS: Record<BinaryOp, OperatorInfo> = {
  "||": { precedence: 1, evaluate: (left, right) => ({ type: "boolean", value: requireType(left, "boolean", "||").value || requireType(right, "boolean", "||").value }) },
  "&&": { precedence: 2, evaluate: (left, right) => ({ type: "boolean", value: requireType(left, "boolean", "&&").value && requireType(right, "boolean", "&&").value }) },
  "==": { precedence: 3, evaluate: (left, right) => ({ type: "boolean", value: left.type === right.type && left.value === right.value }) },
  "!=": { precedence: 3, evaluate: (left, right) => ({ type: "boolean", value: left.type !== right.type || left.value !== right.value }) },
  "<": { precedence: 3, evaluate: (left, right) => ({ type: "boolean", value: requireType(left, "number", "<").value < requireType(right, "number", "<").value }) },
  "<=": { precedence: 3, evaluate: (left, right) => ({ type: "boolean", value: requireType(left, "number", "<=").value <= requireType(right, "number", "<=").value }) },
  ">": { precedence: 3, evaluate: (left, right) => ({ type: "boolean", value: requireType(left, "number", ">").value > requireType(right, "number", ">").value }) },
  ">=": { precedence: 3, evaluate: (left, right) => ({ type: "boolean", value: requireType(left, "number", ">=").value >= requireType(right, "number", ">=").value }) },
  "+": { precedence: 4, evaluate: (left, right) => ({ type: "number", value: requireType(left, "number", "+").value + requireType(right, "number", "+").value }) },
  "-": { precedence: 4, evaluate: (left, right) => ({ type: "number", value: requireType(left, "number", "-").value - requireType(right, "number", "-").value }) },
  "*": { precedence: 5, evaluate: (left, right) => ({ type: "number", value: requireType(left, "number", "*").value * requireType(right, "number", "*").value }) },
};
