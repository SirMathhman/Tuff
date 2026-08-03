import type { Node } from "./parser";

const operators: Record<string, (a: number, b: number) => number> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
};

export function evaluate(node: Node): number {
  if (node.type === "number") {
    return node.value;
  }
  return operators[node.op]!(evaluate(node.left), evaluate(node.right));
}
