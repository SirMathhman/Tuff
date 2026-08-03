import type { AST, Value, FunctionValue, ArrayValue, StructValue, TypeName, StructTypeValue, ReferenceCell } from "./types";
import { Environment } from "./environment";
import { makeInteger, requireNumber, isTruthy, makeBool } from "./value";
import { integerTypeOf, isFunction, typeOf, isArray, assertTypeMatches, typesEqual, isStruct, isRef } from "./typecheck";
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
        assertTypeMatches(value, resolveType(ast.typeName, env), "Type mismatch");
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
      if (ast.target.type !== "identifier") {
        throw new Error(`Invalid assignment target: ${JSON.stringify(ast.target)}`);
      }
      const name = ast.target.name;
      const { index, element } = resolveIndex(ast, env);
      const value = evaluate(ast.value, env);
      if (ast.operator === "=") {
        env.assignElement(name, index, value);
        return value;
      }
      const result = compoundAssign(ast.operator, element, value, String(index));
      env.assignElement(name, index, result);
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
    case "struct": {
      const fields: Record<string, { typeName: TypeName; mutable: boolean }> = {};
      for (const field of ast.fields) {
        fields[field.name] = { typeName: field.typeName, mutable: field.mutable };
      }
      const structType: StructTypeValue = { kind: "structType", name: ast.name, fields };
      env.define(ast.name, structType, false);
      return structType;
    }
    case "structLiteral": {
      const fields: Record<string, Value> = {};
      for (const field of ast.fields) {
        fields[field.name] = evaluate(field.value, env);
      }
      return { kind: "struct", name: ast.name, fields } as StructValue;
    }
    case "field": {
      const { target, value } = resolveField(ast, env);
      return value;
    }
    case "fieldAssign": {
      const { target, value: current } = resolveField(ast, env);
      const structType = env.lookup(target.name);
      if (!isStructType(structType)) {
        throw new Error(`Unknown struct type: ${target.name}`);
      }
      const fieldSpec = structType.fields[ast.name];
      if (!fieldSpec) {
        throw new Error(`Unknown field: ${ast.name}`);
      }
      if (!fieldSpec.mutable) {
        throw new Error(`Cannot assign to immutable field: ${ast.name}`);
      }
      const value = evaluate(ast.value, env);
      if (ast.operator === "=") {
        target.fields[ast.name] = value;
        return value;
      }
      const result = compoundAssign(ast.operator, current, value, ast.name);
      target.fields[ast.name] = result;
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
    case "ref": {
      const cell = resolveRefCell(ast.target, env);
      if (ast.mutable && !cell.mutable) {
        throw new Error(`Cannot take mutable reference to immutable target: ${JSON.stringify(ast.target)}`);
      }
      return { kind: "ref", mutable: ast.mutable, cell };
    }
    case "deref": {
      const target = evaluate(ast.target, env);
      if (!isRef(target)) {
        throw new Error(`Dereference requires a reference: ${JSON.stringify(ast.target)}`);
      }
      return target.cell.get();
    }
    case "derefAssign": {
      const ref = evaluate(ast.target, env);
      if (!isRef(ref)) {
        throw new Error(`Dereference assignment requires a reference: ${JSON.stringify(ast.target)}`);
      }
      if (!ref.mutable) {
        throw new Error(`Cannot assign through immutable reference`);
      }
      const value = evaluate(ast.value, env);
      if (ast.operator === "=") {
        ref.cell.set(value);
        return value;
      }
      const result = compoundAssign(ast.operator, ref.cell.get(), value, "deref");
      ref.cell.set(result);
      return result;
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

function resolveRefCell(target: AST, env: Environment): ReferenceCell {
  if (target.type === "identifier") {
    return env.reference(target.name);
  }
  if (target.type === "index") {
    const { target: arr, index } = resolveIndex(target, env);
    return {
      mutable: true,
      get: () => arr.elements[index]!,
      set: (value) => {
        arr.elements[index] = value;
      },
    };
  }
  if (target.type === "field") {
    const { target: struct } = resolveField(target, env);
    const name = target.name;
    return {
      mutable: true,
      get: () => struct.fields[name]!,
      set: (value) => {
        struct.fields[name] = value;
      },
    };
  }
  throw new Error(`Invalid reference target: ${JSON.stringify(target)}`);
}

function compoundAssign(operator: "+=" | "-=" | "*=" | "/=", current: Value, value: Value, name: string): number {
  if (typeof current !== "number" || typeof value !== "number") {
    throw new Error(`Compound assignment requires numbers: ${name}`);
  }
  return assignOps[operator](current, value);
}

function resolveField(ast: Extract<AST, { type: "field" | "fieldAssign" }>, env: Environment): { target: StructValue; value: Value } {
  const target = evaluate(ast.target, env);
  if (!isStruct(target)) {
    throw new Error(`Field access requires a struct: ${JSON.stringify(ast.target)}`);
  }
  const value = target.fields[ast.name];
  if (value === undefined) {
    throw new Error(`Unknown field: ${ast.name}`);
  }
  return { target, value };
}

function resolveType(typeName: TypeName, env: Environment): TypeName {
  if (typeof typeName === "object" && typeName.kind === "struct" && Object.keys(typeName.fields).length === 0) {
    const resolved = env.lookup(typeName.name);
    if (isStructType(resolved)) {
      return { kind: "struct", name: resolved.name, fields: resolved.fields };
    }
  }
  return typeName;
}

function isStructType(value: Value): value is StructTypeValue {
  return typeof value === "object" && value !== null && value.kind === "structType";
}
