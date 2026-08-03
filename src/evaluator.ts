import type { AST, Value, U8Value, U16Value, TypeName } from "./types";
import { Environment } from "./environment";

type BinaryOperator = "+" | "-" | "*" | "/" | "<" | ">" | "<=" | ">=" | "==" | "!=";
type AssignOperator = "=" | "+=" | "-=" | "*=" | "/=";

const U8_MAX = 255;
const U16_MAX = 65535;

function makeU8(value: number): U8Value {
  if (value < 0 || value > U8_MAX) {
    throw new Error(`U8 overflow: ${value}`);
  }
  return { kind: "u8", value };
}

function makeU16(value: number): U16Value {
  if (value < 0 || value > U16_MAX) {
    throw new Error(`U16 overflow: ${value}`);
  }
  return { kind: "u16", value };
}

function isU8(value: Value): value is U8Value {
  return typeof value === "object" && value !== null && value.kind === "u8";
}

function isU16(value: Value): value is U16Value {
  return typeof value === "object" && value !== null && value.kind === "u16";
}

function isNumber(value: Value): value is number | U8Value | U16Value {
  return typeof value === "number" || isU8(value) || isU16(value);
}

function toNumber(value: number | U8Value | U16Value): number {
  if (isU8(value) || isU16(value)) {
    return value.value;
  }
  return value;
}

function requireNumber(value: Value, operator: string): number {
  if (!isNumber(value)) {
    throw new Error(`Binary operator requires numbers: ${operator}`);
  }
  return toNumber(value);
}

function typeOf(value: Value): TypeName | undefined {
  if (isU8(value)) {
    return "U8";
  }
  if (isU16(value)) {
    return "U16";
  }
  return undefined;
}

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
      if (ast.u8) {
        return makeU8(ast.value);
      }
      if (ast.u16) {
        return makeU16(ast.value);
      }
      return ast.value;
    case "boolean":
      return ast.value;
    case "identifier":
      return env.lookup(ast.name);
    case "let": {
      const value = evaluate(ast.value, env);
      if (ast.typeName && typeOf(value) !== ast.typeName) {
        throw new Error(`Type mismatch: expected ${ast.typeName}, got ${typeOf(value) ?? "number"}`);
      }
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
    case "while": {
      let result: Value = 0;
      while (isTruthy(evaluate(ast.condition, env))) {
        result = evaluate(ast.body, env);
      }
      return result;
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
      const leftValue = evaluate(ast.left, env);
      const rightValue = evaluate(ast.right, env);
      const left = requireNumber(leftValue, ast.operator);
      const right = requireNumber(rightValue, ast.operator);
      const result = binaryOps[ast.operator](left, right);
      if (isU8(leftValue) || isU8(rightValue)) {
        if (typeof result !== "number") {
          throw new Error(`U8 arithmetic must produce a number: ${ast.operator}`);
        }
        return makeU8(result);
      }
      return result;
    }
    case "unary": {
      const operand = requireNumber(evaluate(ast.operand, env), "-");
      return -operand;
    }
  }
}
