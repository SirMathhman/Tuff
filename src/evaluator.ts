import type { AstNode } from "./ast";
import type { Value } from "./value";
import { toNumber } from "./value";

export function evaluate(
  node: AstNode,
  env: Map<string, Value> = new Map(),
): Value {
  switch (node.kind) {
    case "number":
      return { kind: "number", value: node.value };
    case "boolean":
      return { kind: "boolean", value: node.value };
    case "binary": {
      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);
      const l = toNumber(left);
      const r = toNumber(right);
      switch (node.op) {
        case "+":
          return { kind: "number", value: l + r };
        case "-":
          return { kind: "number", value: l - r };
        case "*":
          return { kind: "number", value: l * r };
        case "/":
          return { kind: "number", value: l / r };
        case "||":
          return toNumber(left) !== 0 ? left : right;
        case "&&":
          return toNumber(left) !== 0 ? right : left;
        case "<":
          return { kind: "boolean", value: l < r };
        case ">":
          return { kind: "boolean", value: l > r };
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
      return { kind: "number", value: 0 };
    }
    case "block": {
      let result: Value = { kind: "number", value: 0 };
      for (const stmt of node.statements) {
        result = evaluate(stmt, env);
      }
      return result;
    }
  }
  return { kind: "number", value: 0 };
}
