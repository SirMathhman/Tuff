import type { AstNode } from "./ast";
import { Environment, Ref, deref, assignRef } from "./environment";

export function evaluateStatements(
  statements: AstNode[],
  env: Environment,
): number {
  let last = 0;
  for (const stmt of statements) {
    last = evaluate(stmt, env);
  }
  return last;
}

export function evaluate(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "num":
      return node.value;

    case "bool":
      return node.value ? 1 : 0;

    case "id": {
      const value = env.get(node.name);
      if (value === undefined)
        throw new Error("Undefined variable: " + node.name);
      if (typeof value === "object") return deref(value);
      return value;
    }

    case "binop": {
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
        case "&&":
          return left && right;
        case "||":
          return left || right;
        case "==":
          return left === right ? 1 : 0;
      }
    }

    case "unop":
      return -evaluate(node.operand, env);

    case "let": {
      const value = evaluate(node.value, env);
      env.declare(node.name, value, node.mutable);
      return 0;
    }

    case "assign": {
      const value = evaluate(node.value, env);
      env.assign(node.name, value);
      return value;
    }

    case "deref": {
      const operand = evaluate(node.operand, env);
      return operand;
    }

    case "derefassign": {
      const value = evaluate(node.value, env);
      // The target is a deref of an id
      const target = node.target as {
        type: "deref";
        operand: { type: "id"; name: string };
      };
      const ref = env.get(target.operand.name);
      if (ref === undefined)
        throw new Error("Undefined variable: " + target.operand.name);
      if (typeof ref === "object") {
        assignRef(ref, value);
      } else {
        throw new Error("Cannot dereference non-reference");
      }
      return value;
    }

    case "ref": {
      const ref: Ref = {
        name: node.name,
        env,
        mutable: node.mutable,
      };
      return ref as any;
    }

    case "block": {
      if (node.statements.length === 0) throw new Error("Empty block");
      const blockEnv = new Environment(env);
      let last = 0;
      let hasValue = false;
      for (const stmt of node.statements) {
        if (stmt.type !== "let") {
          hasValue = true;
        }
        last = evaluate(stmt, blockEnv);
      }
      if (!hasValue) throw new Error("Block has no value");
      return last;
    }

    case "if": {
      const condition = evaluate(node.condition, env);
      if (condition !== 0) {
        return evaluate(node.thenBranch, env);
      }
      return evaluate(node.elseBranch, env);
    }
  }
}
