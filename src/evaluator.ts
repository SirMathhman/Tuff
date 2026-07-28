import type { AstNode } from "./ast";
import type { Type } from "./types";
import type { EvalResult, Value } from "./value";
import { isAssignable } from "./types";
import { evalBreak, evalOk, toNumber, unwrap } from "./value";

function getMutable(name: string, env: Map<string, Value>): Value | undefined {
  if (!env.has(`__mutable__${name}`)) return undefined;
  return env.get(name);
}

function setMutable(name: string, value: Value, env: Map<string, Value>): void {
  if (!env.has(`__mutable__${name}`)) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
  env.set(name, value);
}

export function evaluate(
  node: AstNode,
  env: Map<string, Value> = new Map(),
): EvalResult {
  switch (node.kind) {
    case "number":
      return evalOk({ kind: "number", value: node.value });
    case "boolean":
      return evalOk({ kind: "boolean", value: node.value });
    case "unary": {
      const operand = unwrap(evaluate(node.operand, env));
      switch (node.op) {
        case "-":
          return evalOk({ kind: "number", value: -toNumber(operand) });
      }
      break;
    }
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
      const value = unwrap(evaluate(node.value, env));
      setMutable(node.name, value, env);
      return evalOk(value);
    }
    case "augassign": {
      const current = getMutable(node.name, env)!;
      const rhs = unwrap(evaluate(node.value, env));
      const newValue: Value = {
        kind: "number",
        value: toNumber(current) + toNumber(rhs),
      };
      setMutable(node.name, newValue, env);
      return evalOk(newValue);
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
    case "while": {
      while (toNumber(unwrap(evaluate(node.condition, env))) !== 0) {
        const result = evaluate({ kind: "block", statements: node.body }, env);
        if (result.kind === "break") return result;
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "typecheck": {
      const value = unwrap(evaluate(node.value, env));
      return evalOk({
        kind: "boolean",
        value: checkType(value, node.type),
      });
    }
  }
  return evalOk({ kind: "number", value: 0 });
}

/** Check if a runtime value matches the target type. */
function checkType(value: Value, targetType: Type): boolean {
  return isAssignable(inferRuntimeType(value), targetType);
}

/** Infer the type of a runtime value. */
function inferRuntimeType(value: Value): Type {
  if (value.kind === "boolean") return { kind: "bool" };
  return { kind: "dynamic" };
}
