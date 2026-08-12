import type { AstNode } from "./ast";
import type { IntTypeName } from "./types";
import { promoteTypes } from "./types";
import {
  Environment,
  deref,
  assignRef,
  num,
  toNumber,
  getNumberType,
} from "./environment";
import type { Ref, Value } from "./environment";
import { Break, Continue } from "./control-flow";

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
      const ref: Ref = {
        name: node.name,
        env,
        mutable: node.mutable,
      };
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
      // Array type check: [Type; N]
      if (node.arrayLength) {
        if (val.kind !== "array") return 0;
        const length = evaluate(node.arrayLength, env);
        if (val.elements.length !== length) return 0;
        const expectedType = node.typeName.slice(1, -1).toLowerCase();
        for (const elem of val.elements) {
          if (elem.kind !== "number") return 0;
          // Plain numbers (no numType) match any integer type
          if (elem.numType && elem.numType !== expectedType) return 0;
        }
        return 1;
      }
      if (node.typeName.toLowerCase() === "bool") {
        return val.kind === "bool" ? 1 : 0;
      }
      if (val.kind === "number") {
        return val.numType === node.typeName.toLowerCase() ? 1 : 0;
      }
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
  }
}
