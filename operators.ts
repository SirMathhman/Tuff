import type { Value } from "./value";
import { toNumber, truthy } from "./value";

export type BinaryOp = "+" | "-" | "*" | "||" | "&&" | "==";

export const BINARY_EVALUATORS: Record<BinaryOp, (left: Value, right: Value) => Value> = {
  "+": (left, right) => ({ type: "number", value: toNumber(left) + toNumber(right) }),
  "-": (left, right) => ({ type: "number", value: toNumber(left) - toNumber(right) }),
  "*": (left, right) => ({ type: "number", value: toNumber(left) * toNumber(right) }),
  "||": (left, right) => ({ type: "boolean", value: truthy(left) || truthy(right) }),
  "&&": (left, right) => ({ type: "boolean", value: truthy(left) && truthy(right) }),
  "==": (left, right) => ({ type: "boolean", value: left.type === right.type && left.value === right.value }),
};
