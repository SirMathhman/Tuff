import type { AstNode } from "./ast";
import type { Value } from "./value";
import { toNumber } from "./value";

class BreakError {
  constructor(public value: Value) {}
}

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
        case "==":
          return { kind: "boolean", value: l === r };
        case "!=":
          return { kind: "boolean", value: l !== r };
        case "<=":
          return { kind: "boolean", value: l <= r };
        case ">=":
          return { kind: "boolean", value: l >= r };
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
      if (node.mutable) {
        env.set(`__mutable__${node.name}`, { kind: "boolean", value: true });
      }
      return { kind: "number", value: 0 };
    }
    case "assign": {
      if (!env.has(`__mutable__${node.name}`)) {
        throw new Error(`Cannot assign to immutable variable: ${node.name}`);
      }
      const value = evaluate(node.value, env);
      env.set(node.name, value);
      return value;
    }
    case "block": {
      let result: Value = { kind: "number", value: 0 };
      for (const stmt of node.statements) {
        result = evaluate(stmt, env);
      }
      return result;
    }
    case "if": {
      const condition = evaluate(node.condition, env);
      if (toNumber(condition) !== 0) {
        return evaluate(node.then, env);
      } else {
        return evaluate(node.elseBranch, env);
      }
    }
    case "loop": {
      for (const stmt of node.body) {
        try {
          return evaluate(stmt, env);
        } catch (e) {
          if (e instanceof BreakError) return e.value;
          throw e;
        }
      }
      return { kind: "number", value: 0 };
    }
    case "break": {
      const value = evaluate(node.value, env);
      throw new BreakError(value);
    }
  }
  return { kind: "number", value: 0 };
}
