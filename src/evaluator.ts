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
        case "/":
          return left / right;
      }
      break;
    }
    case "identifier": {
      const value = env.get(node.name);
      if (value === undefined) {
        throw new Error(`Undefined identifier: ${node.name}`);
      }
      return value;
    }
    case "let": {
      const value = evaluate(node.value, env);
      env.set(node.name, value);
      return 0;
    }
    case "block": {
      let result = 0;
      for (const stmt of node.statements) {
        result = evaluate(stmt, env);
      }
      // A block whose last statement is a declaration cannot be used as an expression
      const lastStmt = node.statements[node.statements.length - 1];
      if (lastStmt?.kind === "let") {
        throw new Error("Block cannot end with a declaration when used as an expression");
      }
      return result;
    }
  }
  return 0;
}
