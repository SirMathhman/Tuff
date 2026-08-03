import type { AST, Value, FunctionValue } from "./types";
import { Environment } from "./environment";
import { makeU8, makeU16, makeU32, makeU64, makeI8, makeI16, makeI64, isU8, isU16, isU32, isU64, isI8, isI16, isI64, isFunction, requireNumber, typeOf, isTruthy } from "./value";
import { callFunction } from "./functions";
import { binaryOps, assignOps, logicalOps, unaryOps } from "./operators";

export function evaluate(ast: AST, env: Environment = new Environment()): Value {
  switch (ast.type) {
    case "number":
      if (ast.u8) {
        return makeU8(ast.value);
      }
      if (ast.u16) {
        return makeU16(ast.value);
      }
      if (ast.u32) {
        return makeU32(ast.value);
      }
      if (ast.u64) {
        return makeU64(ast.value);
      }
      if (ast.i8) {
        return makeI8(ast.value);
      }
      if (ast.i16) {
        return makeI16(ast.value);
      }
      if (ast.i64) {
        return makeI64(ast.value);
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
    case "fn": {
      const fn: FunctionValue = {
        kind: "function",
        name: ast.name,
        params: ast.params,
        returnType: ast.returnType,
        body: ast.body,
        closure: env,
      };
      env.define(ast.name, fn, false);
      return fn;
    }
    case "call": {
      const callee = evaluate(ast.callee, env);
      if (!isFunction(callee)) {
        throw new Error(`Not a function: ${JSON.stringify(ast.callee)}`);
      }
      const args = ast.args.map((arg) => evaluate(arg, env));
      return callFunction(callee, args, evaluate);
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
      if (ast.operator === "&&" || ast.operator === "||") {
        return logicalOps[ast.operator](isTruthy(leftValue), isTruthy(rightValue));
      }
      const left = requireNumber(leftValue, ast.operator);
      const right = requireNumber(rightValue, ast.operator);
      const result = binaryOps[ast.operator](left, right);
      const maker = typedMaker(leftValue) ?? typedMaker(rightValue);
      if (maker) {
        if (typeof result !== "number") {
          throw new Error(`Typed arithmetic must produce a number: ${ast.operator}`);
        }
        return maker(result);
      }
      return result;
    }
    case "unary": {
      const operand = evaluate(ast.operand, env);
      if (ast.operator === "-") {
        const maker = typedMaker(operand);
        if (maker) {
          if (typeof operand !== "object" || !("value" in operand)) {
            throw new Error("Unary minus requires a number");
          }
          return maker(-operand.value);
        }
      }
      return unaryOps[ast.operator](operand);
    }
  }
}

function typedMaker(value: Value): ((n: number) => Value) | undefined {
  if (isU8(value)) {
    return makeU8;
  }
  if (isU16(value)) {
    return makeU16;
  }
  if (isU32(value)) {
    return makeU32;
  }
  if (isU64(value)) {
    return makeU64;
  }
  if (isI8(value)) {
    return makeI8;
  }
  if (isI16(value)) {
    return makeI16;
  }
  if (isI64(value)) {
    return makeI64;
  }
  return undefined;
}
