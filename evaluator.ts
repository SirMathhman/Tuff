import type { Node } from "./parser";

const operators: Record<string, (a: number, b: number) => number> = {
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
};

export function evaluate(node: Node, env: Record<string, number> = {}): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "identifier":
      return env[node.name]!;
    case "binary":
      return operators[node.op]!(
        evaluate(node.left, env),
        evaluate(node.right, env)
      );
    case "let":
      env[node.name] = evaluate(node.value, env);
      return env[node.name]!;
    case "block": {
      let result = 0;
      for (const statement of node.statements) {
        result = evaluate(statement, env);
      }
      return result;
    }
  }
}
