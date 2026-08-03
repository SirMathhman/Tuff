import type { AST, Value, FunctionValue, ArrayValue } from "./types";
import { Environment } from "./environment";
import { makeInteger, requireNumber, isTruthy, makeBool } from "./value";
import { integerTypeOf, isFunction, typeOf, isArray, assertTypeMatches, typesEqual } from "./typecheck";
import { callFunction } from "./functions";
import { binaryOps, assignOps, logicalOps, unaryOps } from "./operators";

export function evaluate(ast: AST, env: Environment = new Environment()): Value {
  switch (ast.type) {
    case "number":
      return ast.typeName ? makeInteger(ast.typeName, ast.value) : ast.value;
    case "boolean":
      return makeBool(ast.value);
    case "identifier":
      return env.lookup(ast.name);
    case "let": {
      const value = evaluate(ast.value, env);
      if (ast.typeName) {
        assertTypeMatches(value, ast.typeName, "Type mismatch");
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
      const result = compoundAssign(ast.operator, current, value, ast.name);
      env.assign(ast.name, result);
      return result;
    }
    case "indexAssign": {
      const { target, index, element } = resolveIndex(ast, env);
      const value = evaluate(ast.value, env);
      if (ast.operator === "=") {
        target.elements[index] = value;
        return value;
      }
      const result = compoundAssign(ast.operator, element, value, String(index));
      target.elements[index] = result;
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
    case "array": {
      const elements = ast.elements.map((el) => evaluate(el, env));
      const elementType = elements.length > 0 ? (typeOf(elements[0]!) ?? "I32") : "I32";
      return { kind: "array", elementType, elements };
    }
    case "index": {
      const { element } = resolveIndex(ast, env);
      return element;
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
      if (ast.operator === "is") {
        if (ast.right.type !== "typeRef") {
          throw new Error(`Expected type name after is, got: ${JSON.stringify(ast.right)}`);
        }
        const actual = typeOf(leftValue);
        return makeBool(actual !== undefined && typesEqual(actual, ast.right.name));
      }
      const rightValue = evaluate(ast.right, env);
      if (ast.operator === "&&" || ast.operator === "||") {
        return makeBool(logicalOps[ast.operator](isTruthy(leftValue), isTruthy(rightValue)));
      }
      const left = requireNumber(leftValue, ast.operator);
      const right = requireNumber(rightValue, ast.operator);
      const result = binaryOps[ast.operator](left, right);
      if (typeof result === "boolean") {
        return makeBool(result);
      }
      const typeName = integerTypeOf(leftValue) ?? integerTypeOf(rightValue);
      if (typeName) {
        if (typeof result !== "number") {
          throw new Error(`Typed arithmetic must produce a number: ${ast.operator}`);
        }
        return makeInteger(typeName, result);
      }
      return result;
    }
    case "unary": {
      const operand = evaluate(ast.operand, env);
      if (ast.operator === "-") {
        const typeName = integerTypeOf(operand);
        if (typeName) {
          if (typeof operand !== "object" || !("value" in operand)) {
            throw new Error("Unary minus requires a number");
          }
          return makeInteger(typeName, -operand.value);
        }
      }
      if (ast.operator === "!") {
        return makeBool(!isTruthy(operand));
      }
      return unaryOps[ast.operator](operand);
    }
    case "typeRef":
      throw new Error(`Type reference cannot be evaluated standalone: ${ast.name}`);
  }
}

function resolveIndex(ast: Extract<AST, { type: "index" | "indexAssign" }>, env: Environment): { target: ArrayValue; index: number; element: Value } {
  const target = evaluate(ast.target, env);
  if (!isArray(target)) {
    throw new Error(`Indexing requires an array: ${JSON.stringify(ast.target)}`);
  }
  const index = requireNumber(evaluate(ast.index, env), "index");
  const element = target.elements[index];
  if (element === undefined) {
    throw new Error(`Index out of bounds: ${index}`);
  }
  return { target, index, element };
}

function compoundAssign(operator: "+=" | "-=" | "*=" | "/=", current: Value, value: Value, name: string): number {
  if (typeof current !== "number" || typeof value !== "number") {
    throw new Error(`Compound assignment requires numbers: ${name}`);
  }
  return assignOps[operator](current, value);
}
