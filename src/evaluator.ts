import type { AstNode } from "./ast";

export function evaluate(
  node: AstNode,
  env: Map<string, number> = new Map(),
): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "binary": {
      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
      }
      break;
    }
    case "identifier":
      return env.get(node.name) ?? 0;
    case "let": {
      const value = evaluate(node.value, env);
      env.set(node.name, value);
      return value;
    }
    case "block": {
      let result = 0;
      for (const stmt of node.statements) {
        result = evaluate(stmt, env);
      }
      return result;
    }
  }
}
