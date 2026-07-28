import type { AstNode } from "./ast";
import type { EvalResult, Value } from "./value";
import { evalBreak, evalOk, toNumber, unwrap } from "./value";

export function evaluate(
  node: AstNode,
  env: Map<string, Value> = new Map(),
): EvalResult {
  switch (node.kind) {
    case "number":
      return evalOk({ kind: "number", value: node.value });
    case "boolean":
      return evalOk({ kind: "boolean", value: node.value });
    case "binary": {
      const left = unwrap(evaluate(node.left, env));
      const right = unwrap(evaluate(node.right, env));
      const l = toNumber(left);
      const r = toNumber(right);
      switch (node.op) {
        case "+":
          return evalOk({ kind: "number", value: l + r });
        case "-":
          return evalOk({ kind: "number", value: l - r });
        case "*":
          return evalOk({ kind: "number", value: l * r });
        case "/":
          return evalOk({ kind: "number", value: l / r });
        case "||":
          return evalOk(toNumber(left) !== 0 ? left : right);
        case "&&":
          return evalOk(toNumber(left) !== 0 ? right : left);
        case "<":
          return evalOk({ kind: "boolean", value: l < r });
        case ">":
          return evalOk({ kind: "boolean", value: l > r });
        case "==":
          return evalOk({ kind: "boolean", value: l === r });
        case "!=":
          return evalOk({ kind: "boolean", value: l !== r });
        case "<=":
          return evalOk({ kind: "boolean", value: l <= r });
        case ">=":
          return evalOk({ kind: "boolean", value: l >= r });
      }
      break;
    }
    case "identifier": {
      const value = env.get(node.name);
      if (value === undefined) {
        throw new Error(`Undefined identifier: ${node.name}`);
      }
      return evalOk(value);
    }
    case "let": {
      const value = unwrap(evaluate(node.value, env));
      env.set(node.name, value);
      if (node.mutable) {
        env.set(`__mutable__${node.name}`, { kind: "boolean", value: true });
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "assign": {
      if (!env.has(`__mutable__${node.name}`)) {
        throw new Error(`Cannot assign to immutable variable: ${node.name}`);
      }
      const value = unwrap(evaluate(node.value, env));
      env.set(node.name, value);
      return evalOk(value);
    }
    case "block": {
      let result: Value = { kind: "number", value: 0 };
      for (const stmt of node.statements) {
        result = unwrap(evaluate(stmt, env));
      }
      return evalOk(result);
    }
    case "if": {
      const condition = unwrap(evaluate(node.condition, env));
      if (toNumber(condition) !== 0) {
        return evaluate(node.then, env);
      } else {
        return evaluate(node.elseBranch, env);
      }
    }
    case "loop": {
      for (const stmt of node.body) {
        const result = evaluate(stmt, env);
        if (result.kind === "break") return evalOk(result.value);
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "break": {
      const value = unwrap(evaluate(node.value, env));
      return evalBreak(value);
    }
  }
  return evalOk({ kind: "number", value: 0 });
}
