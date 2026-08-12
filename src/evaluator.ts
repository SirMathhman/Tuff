import type { AstNode, TypeNode } from "./ast";
import type { IntTypeName } from "./types";
import { promoteTypes } from "./types";
import {
  Environment,
  deref,
  derefValue,
  assignRef,
  num,
  toNumber,
  getNumberType,
} from "./environment";
import type { Ref, Value } from "./environment";
import { Break, Continue } from "./control-flow";

/** Check if a value matches a type-node. */
function checkType(val: Value, typeNode: TypeNode, env: Environment): boolean {
  // Resolve type aliases
  if (typeNode.kind === "name") {
    const alias = env.getTypeAlias(typeNode.name);
    if (alias) {
      return checkType(val, alias, env);
    }
  }

  switch (typeNode.kind) {
    case "name": {
      const typeName = typeNode.name.toLowerCase();
      if (typeName === "bool") {
        return val.kind === "bool";
      }
      if (val.kind === "number") {
        // Plain numbers (no numType) default to I32
        if (!val.numType) return typeName === "i32";
        return val.numType === typeName;
      }
      return false;
    }
    case "array": {
      if (val.kind !== "array") return false;
      const length = evaluate(typeNode.length, env);
      if (val.elements.length !== length) return false;
      for (const elem of val.elements) {
        if (!checkType(elem, typeNode.elementType, env)) return false;
      }
      return true;
    }
    case "ref": {
      if (val.kind !== "ref") return false;
      const refVal = env.get(val.ref.name);
      if (refVal === undefined) return false;
      return checkType(refVal, typeNode.innerType, env);
    }
    case "struct": {
      if (val.kind !== "struct") return false;
      for (const field of typeNode.fields) {
        const fieldVal = val.fields[field.name];
        if (fieldVal === undefined) return false;
        if (!checkType(fieldVal, field.type, env)) return false;
      }
      return true;
    }
    case "fn": {
      if (val.kind !== "fnref") return false;
      const fn = val.fn;
      if (fn.params.length !== typeNode.params.length) return false;
      for (let i = 0; i < fn.params.length; i++) {
        const paramType = typeNode.params[i];
        if (!paramType || !checkType(num(0), paramType, env)) return false;
      }
      return checkType(num(0), typeNode.returnType, env);
    }
    default:
      return false;
  }
}

/** Evaluate a range expression and return { start, end }. */
function evalRange(
  node: AstNode,
  env: Environment,
): { start: number; end: number } {
  const v = evalValue(node, env);
  if (v.kind !== "range") throw new Error("Expected range value");
  return { start: v.start, end: v.end };
}

/** Evaluate a node and return the raw Value instead of unwrapping to number. */
function evalValue(node: AstNode, env: Environment): Value {
  switch (node.type) {
    case "num":
      return num(node.value, node.numType);
    case "bool":
      return { kind: "bool", value: node.value };
    case "id": {
      const v = env.get(node.name);
      if (v === undefined) throw new Error("Undefined variable: " + node.name);
      return v;
    }
    case "array-literal": {
      const elements: Value[] = node.elements.map((el) => evalValue(el, env));
      return { kind: "array", elements };
    }
    case "array-index": {
      const arr = evalValue(node.array, env);
      const idx = evaluate(node.index, env);
      if (arr.kind !== "array") throw new Error("Cannot index non-array value");
      const result = arr.elements[idx];
      if (result === undefined)
        throw new Error(`Array index out of bounds: ${idx}`);
      return result;
    }
    case "ref": {
      // Check if this is a function reference (&functionName)
      const fn = env.getFunction(node.name);
      if (fn !== undefined && !node.mutable) {
        return { kind: "fnref", fn };
      }
      const ref: Ref = {
        name: node.name,
        env,
        mutable: node.mutable,
      };
      return { kind: "ref", ref };
    }
    case "range": {
      return {
        kind: "range",
        start: evaluate(node.start, env),
        end: evaluate(node.end, env),
      };
    }
    case "struct-literal": {
      const fields: Record<string, Value> = {};
      for (const f of node.fields) {
        fields[f.name] = evalValue(f.value, env);
      }
      return { kind: "struct", fields };
    }
    case "struct-access": {
      const struct = evalValue(node.struct, env);
      if (struct.kind !== "struct")
        throw new Error("Cannot access field on non-struct value");
      const field = struct.fields[node.field];
      if (field === undefined)
        throw new Error(`Field not found: ${node.field}`);
      return field;
    }
    case "cast": {
      const value = evalValue(node.expression, env);
      return num(
        value.kind === "number" ? value.value : toNumber(value),
        node.typeName.toLowerCase() as IntTypeName,
      );
    }
    case "fnref": {
      const fn = env.getFunction(node.name);
      if (fn === undefined) throw new Error("Undefined function: " + node.name);
      return { kind: "fnref", fn };
    }
    case "binop": {
      const left = evalValue(node.left, env);
      const right = evalValue(node.right, env);
      const result = evaluate(node, env);
      const leftType = getNumberType(left);
      const rightType = getNumberType(right);
      if (leftType && rightType) {
        return num(result, promoteTypes(leftType, rightType));
      }
      const numType = leftType || rightType;
      if (numType) {
        return num(result, numType);
      }
      return num(result);
    }
    case "unop": {
      const operand = evalValue(node.operand, env);
      const result = evaluate(node, env);
      const numType = getNumberType(operand);
      if (numType) {
        return num(result, numType);
      }
      return num(result);
    }
    case "deref": {
      const operand = evalValue(node.operand, env);
      if (operand.kind === "ref") {
        return derefValue(operand.ref);
      }
      return operand;
    }
    default:
      return num(evaluate(node, env));
  }
}

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
      if (value.kind === "ref") return deref(value.ref);
      return toNumber(value);
    }

    case "unop":
      return -evaluate(node.operand, env);

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
      const value = evalValue(node.value, env);
      env.declare(node.name, value, node.mutable);
      return 0;
    }

    case "assign": {
      const value = evaluate(node.value, env);
      env.assign(node.name, num(value));
      return value;
    }

    case "compoundassign": {
      const current = env.get(node.name);
      if (current === undefined)
        throw new Error("Undefined variable: " + node.name);
      const currentValue = toNumber(current);
      const rhs = evaluate(node.value, env);
      const compoundValue =
        node.op === "+" ? currentValue + rhs : currentValue - rhs;
      env.assign(node.name, num(compoundValue));
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
      const refVal = env.get(target.operand.name);
      if (refVal === undefined)
        throw new Error("Undefined variable: " + target.operand.name);
      if (refVal.kind === "ref") {
        assignRef(refVal.ref, value);
      } else {
        throw new Error("Cannot dereference non-reference");
      }
      return value;
    }

    case "ref": {
      return 0;
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
      const range = evalRange(node.range, env);
      for (let i = range.start; i < range.end; i++) {
        try {
          env.declare(node.variable, num(i), false);
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
      // Handled by evalRange; shouldn't reach here directly.
      return 0;
    }

    case "break": {
      throw new Break();
    }

    case "continue": {
      throw new Continue();
    }

    case "cast": {
      const value = evalValue(node.expression, env);
      const numValue = value.kind === "number" ? value.value : toNumber(value);
      return toNumber(
        num(numValue, node.typeName.toLowerCase() as IntTypeName),
      );
    }

    case "type-check": {
      const val = evalValue(node.operand, env);
      return checkType(val, node.typeNode, env) ? 1 : 0;
    }

    case "type-alias": {
      env.declareTypeAlias(node.name, node.typeNode);
      return 0;
    }

    case "struct-def": {
      const structType: TypeNode = {
        kind: "struct",
        fields: node.fields.map((f) => ({ name: f.name, type: f.type })),
      };
      env.declareStruct(node.name, structType);
      return 0;
    }

    case "array-literal": {
      // Arrays are stored as values, not returned as numbers.
      // This case is only reached when an array is used in a context
      // expecting a number, which shouldn't happen.
      return 0;
    }

    case "array-index": {
      const arrayVal = evalValue(node.array, env);
      const index = evaluate(node.index, env);
      if (arrayVal.kind !== "array")
        throw new Error("Cannot index non-array value");
      const result = arrayVal.elements[index];
      if (result === undefined)
        throw new Error(`Array index out of bounds: ${index}`);
      return toNumber(result);
    }

    case "struct-literal": {
      // Structs are stored as values, not returned as numbers.
      return 0;
    }

    case "struct-access": {
      const structVal = evalValue(node.struct, env);
      if (structVal.kind !== "struct")
        throw new Error("Cannot access field on non-struct value");
      const field = structVal.fields[node.field];
      if (field === undefined)
        throw new Error(`Field not found: ${node.field}`);
      return toNumber(field);
    }

    case "struct-field-assign": {
      const structVal = evalValue(node.struct, env);
      if (structVal.kind !== "struct")
        throw new Error("Cannot assign field on non-struct value");
      const value = evaluate(node.value, env);
      structVal.fields[node.field] = num(value);
      return value;
    }

    case "fn-def": {
      env.declareFunction(node.name, {
        params: node.params,
        returnType: node.returnType,
        body: node.body,
      });
      return 0;
    }

    case "fnref": {
      return 0;
    }

    case "fn-call": {
      // First check if callee is a variable holding a fnref
      const calleeVal = env.get(node.name);
      let fn: import("./environment").FnDef;
      if (calleeVal?.kind === "fnref") {
        fn = calleeVal.fn;
      } else {
        // Otherwise look up as named function
        const namedFn = env.getFunction(node.name);
        if (namedFn === undefined)
          throw new Error("Undefined function: " + node.name);
        fn = namedFn;
      }
      const fnEnv = new Environment(env);
      if (fn.params.length !== node.args.length)
        throw new Error(
          `Function expects ${fn.params.length} arguments, got ${node.args.length}`,
        );
      for (let i = 0; i < fn.params.length; i++) {
        const param = fn.params[i];
        const arg = node.args[i];
        if (!param || !arg) throw new Error("Invalid function signature");
        const argValue = evalValue(arg, env);
        fnEnv.declare(param.name, argValue, false);
      }
      return evaluate(fn.body, fnEnv);
    }

    case "array-index-assign": {
      const value = evaluate(node.value, env);
      const indices: AstNode[] = [];
      let base: AstNode = node.array;
      while (base.type === "array-index") {
        indices.unshift(base.index);
        base = base.array;
      }
      let currentVal: Value = evalValue(base, env);
      if (currentVal.kind === "ref") {
        currentVal = derefValue(currentVal.ref);
      }
      if (currentVal.kind !== "array")
        throw new Error("Cannot index non-array value");
      for (let i = 0; i < indices.length - 1; i++) {
        const idx = evaluate(indices[i]!, env);
        const child: Value | undefined = (
          currentVal as { kind: "array"; elements: Value[] }
        ).elements[idx];
        if (child === undefined)
          throw new Error(`Array index out of bounds: ${idx}`);
        if (child.kind === "ref") {
          currentVal = derefValue(child.ref);
        } else {
          currentVal = child;
        }
        if (currentVal.kind !== "array")
          throw new Error("Cannot index non-array value");
      }
      const finalIdx = evaluate(indices[indices.length - 1]!, env);
      (currentVal as { kind: "array"; elements: Value[] }).elements[finalIdx] =
        num(value);
      return value;
    }

    case "deref-array-index-assign": {
      const target = node.ref as {
        type: "deref";
        operand: { type: "id"; name: string };
      };
      const refVal = env.get(target.operand.name);
      const index = evaluate(node.index, env);
      const value = evaluate(node.value, env);
      if (refVal === undefined)
        throw new Error("Undefined variable: " + target.operand.name);
      if (refVal.kind !== "ref")
        throw new Error("Cannot index non-reference value");
      const derefed = derefValue(refVal.ref);
      if (derefed.kind !== "array")
        throw new Error("Cannot index non-array value");
      derefed.elements[index] = num(value);
      return value;
    }
  }
}
