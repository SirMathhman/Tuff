export type BinaryOp = "+" | "-" | "*" | "||" | "&&";

export const BINARY_EVALUATORS: Record<BinaryOp, (left: number, right: number) => number> = {
  "+": (left, right) => left + right,
  "-": (left, right) => left - right,
  "*": (left, right) => left * right,
  "||": (left, right) => (left || right ? 1 : 0),
  "&&": (left, right) => (left && right ? 1 : 0),
};
