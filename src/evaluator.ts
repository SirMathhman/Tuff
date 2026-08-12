import type { AstNode } from "./ast";
import { Environment, deref, assignRef } from "./environment";
import type { Ref } from "./environment";
import { Break, Continue } from "./control-flow";

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
      if (typeof value === "object" && "env" in value) return deref(value as any);
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
        case "<":
          return left < right ? 1 : 0;
        case "<=":
          return left <= right ? 1 : 0;
        case ">":
          return left > right ? 1 : 0;
        case ">=":
          return left >= right ? 1 : 0;
        case "!=":
          return left !== right ? 1 : 0;
      }
    }

    case "unop":
      return -evaluate(node.operand, env);

    case "let": {
      if (
        node.value.type === "if-expression" &&
        (node.value.thenBranch.type === "block" ||
          node.value.elseBranch.type === "block")
      ) {
        throw new Error(
          "if/else with block branches cannot be used as expression",
        );
      }
      const value = evaluate(node.value, env);
      env.declare(node.name, value, node.mutable);
      return 0;
    }

    case "assign": {
      const value = evaluate(node.value, env);
      env.assign(node.name, value);
      return value;
    }

    case "compoundassign": {
      const current = env.get(node.name);
      if (current === undefined)
        throw new Error("Undefined variable: " + node.name);
      const currentValue =
        typeof current === "object" ? deref(current) : current;
      const rhs = evaluate(node.value, env);
      const compoundValue =
        node.op === "+" ? currentValue + rhs : currentValue - rhs;
      env.assign(node.name, compoundValue);
      return compoundValue;
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

    case "if-statement":
    case "if-expression": {
      const condition = evaluate(node.condition, env);
      if (condition !== 0) {
        return evaluate(node.thenBranch, env);
      }
      return evaluate(node.elseBranch, env);
    }

    case "while-loop": {
      while (evaluate(node.condition, env)) {
        try {
          evaluate(node.body, env);
        } catch (e) {
          if (e instanceof Break) break;
          if (e instanceof Continue) continue;
          throw e;
        }
      }
      return 0;
    }

    case "for-loop": {
      const range = evaluate(node.range, env);
      const start = typeof range === "object" && "start" in range ? range.start : range;
      const end = typeof range === "object" && "end" in range ? range.end : range;
      for (let i = start; i < end; i++) {
        try {
          env.declare(node.variable, i, false);
          evaluate(node.body, env);
        } catch (e) {
          if (e instanceof Break) break;
          if (e instanceof Continue) continue;
          throw e;
        }
      }
      return 0;
    }

    case "range": {
      return {
        start: evaluate(node.start, env),
        end: evaluate(node.end, env),
      };
    }

    case "break": {
      throw new Break();
    }

    case "continue": {
      throw new Continue();
    }
  }
}
