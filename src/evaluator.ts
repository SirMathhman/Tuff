import type { AST, Value } from "./types";
import { Environment } from "./environment";

type BinaryOperator = "+" | "-" | "*" | "/" | "<" | ">" | "<=" | ">=" | "==" | "!=";
type AssignOperator = "=" | "+=" | "-=" | "*=" | "/=";

const binaryOps: Record<BinaryOperator, (left: number, right: number) => Value> = {
  "+": (l, r) => l + r,
  "-": (l, r) => l - r,
  "*": (l, r) => l * r,
  "/": (l, r) => Math.trunc(l / r),
  "<": (l, r) => l < r,
  ">": (l, r) => l > r,
  "<=": (l, r) => l <= r,
  ">=": (l, r) => l >= r,
  "==": (l, r) => l === r,
  "!=": (l, r) => l !== r,
};

const assignOps: Record<Exclude<AssignOperator, "=">, (left: number, right: number) => number> = {
  "+=": (l, r) => l + r,
  "-=": (l, r) => l - r,
  "*=": (l, r) => l * r,
  "/=": (l, r) => Math.trunc(l / r),
};

function isTruthy(value: Value): boolean {
  return value !== false && value !== 0;
}

export function evaluate(ast: AST, env: Environment = new Environment()): Value {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "boolean":
      return ast.value;
    case "identifier":
      return env.lookup(ast.name);
    case "let": {
      const value = evaluate(ast.value, env);
      env.define(ast.name, value, ast.mutable);
      return value;
    }
    case "assign": {
      const value = evaluate(ast.value, env);
      if (ast.operator === "=") {
        env.assign(ast.name, value);
        return value;
      }
      const current = env.lookup(ast.name);
      if (typeof current !== "number" || typeof value !== "number") {
        throw new Error(`Compound assignment requires numbers: ${ast.name}`);
      }
      const result = assignOps[ast.operator](current, value);
      env.assign(ast.name, result);
      return result;
    }
    case "if": {
      const condition = evaluate(ast.condition, env);
      if (isTruthy(condition)) {
        return evaluate(ast.then, env);
      }
      if (!ast.else) {
        throw new Error("If expression without else evaluated to false");
      }
      return evaluate(ast.else, env);
    }
    case "block": {
      const childEnv = env.child();
      let result: Value = 0;
      for (const statement of ast.statements) {
        result = evaluate(statement, childEnv);
      }
      return result;
    }
    case "binary": {
      const left = evaluate(ast.left, env);
      const right = evaluate(ast.right, env);
      if (typeof left !== "number" || typeof right !== "number") {
        throw new Error(`Binary operator requires numbers: ${ast.operator}`);
      }
      return binaryOps[ast.operator](left, right);
    }
    case "unary": {
      const operand = evaluate(ast.operand, env);
      if (typeof operand !== "number") {
        throw new Error("Unary minus requires a number");
      }
      return -operand;
    }
  }
}
