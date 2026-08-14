import type { AstNode, LValue } from "./ast";
import type { IntTypeName } from "./types";
import { promoteTypes } from "./types";
import {
  Environment,
  derefValue,
  assignRef,
  num,
  toNumber,
  getNumberType,
  nullValue,
} from "./environment";
import type { Ref, Value } from "./environment";

/** Resolve a scope value to a field, throwing if undefined. */
function resolveScopeField(
  scope: { kind: "scope"; env: Environment },
  field: string,
): Value {
  const v = scope.env.get(field);
  if (v === undefined) throw new Error(`Undefined variable: ${field}`);
  return v;
}
export { resolveScopeField };

/** Evaluate a range expression and return { start, end }. */
export function evalRange(
  node: AstNode,
  env: Environment,
  evaluate: (node: AstNode, env: Environment) => number,
  evalValue: (node: AstNode, env: Environment) => Value,
): { start: number; end: number } {
  const v = evalValue(node, env);
  if (v.kind !== "range") throw new Error("Expected range value");
  return { start: v.start, end: v.end };
}

/** Get element from array at index, throwing on out of bounds. */
export function getIndex(
  arr: { kind: "array"; elements: Value[] },
  idx: number,
): Value {
  const result = arr.elements[idx];
  if (result === undefined)
    throw new Error(`Array index out of bounds: ${idx}`);
  return result;
}

/** Evaluate literal nodes (num, bool, char, string). */
export function evalLiteral(node: AstNode): Value {
  switch (node.type) {
    case "num":
      return num(node.value, node.numType, node.isFloat);
    case "bool":
      return { kind: "bool", value: node.value };
    case "char":
      return num(node.value.charCodeAt(0), undefined, undefined, true);
    case "string":
      return {
        kind: "array",
        elements: [...node.value].map((c) =>
          num(c.charCodeAt(0), undefined, undefined, true),
        ),
      };
    case "null":
      return nullValue();
    default:
      throw new Error(`Unexpected literal: ${node.type}`);
  }
}

/** Evaluate collection nodes (array, range). */
export function evalCollection(
  node: AstNode,
  env: Environment,
  evaluate: (node: AstNode, env: Environment) => number,
  evalValue: (node: AstNode, env: Environment) => Value,
): Value {
  switch (node.type) {
    case "array-literal": {
      const elements: Value[] = node.elements.map((el) => evalValue(el, env));
      return { kind: "array", elements };
    }
    case "array-index": {
      const arr = evalValue(node.array, env);
      const idx = evaluate(node.index, env);
      if (arr.kind !== "array") throw new Error("Cannot index non-array value");
      return getIndex(arr, idx);
    }
    case "range": {
      return {
        kind: "range",
        start: evaluate(node.start, env),
        end: evaluate(node.end, env),
      };
    }
    default:
      throw new Error(`Unexpected collection: ${node.type}`);
  }
}

/** Evaluate reference nodes (ref, deref). */
export function evalReference(
  node: AstNode,
  env: Environment,
  evalValue: (node: AstNode, env: Environment) => Value,
): Value {
  switch (node.type) {
    case "ref": {
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
    case "deref": {
      const operand = evalValue(node.operand, env);
      if (operand.kind === "ref") {
        return derefValue(operand.ref);
      }
      return operand;
    }
    default:
      throw new Error(`Unexpected reference: ${node.type}`);
  }
}

/** Evaluate struct nodes (struct-literal, struct-access). */
export function evalStruct(
  node: AstNode,
  env: Environment,
  evalValue: (node: AstNode, env: Environment) => Value,
): Value {
  switch (node.type) {
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
    default:
      throw new Error(`Unexpected struct: ${node.type}`);
  }
}

/** Evaluate operator nodes (binop, unop, cast). */
export function evalOperator(
  node: AstNode,
  env: Environment,
  evaluate: (node: AstNode, env: Environment) => number,
  evalValue: (node: AstNode, env: Environment) => Value,
): Value {
  switch (node.type) {
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
    case "cast": {
      const value = evalValue(node.expression, env);
      return num(
        value.kind === "number" ? value.value : toNumber(value),
        node.typeName.toLowerCase() as IntTypeName,
      );
    }
    default:
      throw new Error(`Unexpected operator: ${node.type}`);
  }
}

/** Resolve an LHS to the Value it points to. */
export function resolveLValue(
  lvalue: LValue,
  env: Environment,
  raw = false,
  evaluate: (node: AstNode, env: Environment) => number,
): Value {
  switch (lvalue.kind) {
    case "var": {
      const v = env.get(lvalue.name);
      if (v === undefined)
        throw new Error("Undefined variable: " + lvalue.name);
      if (!raw && v.kind === "ref") return derefValue(v.ref);
      return v;
    }
    case "deref": {
      const inner = resolveLValue(lvalue.ref, env, true, evaluate);
      if (inner.kind !== "ref")
        throw new Error("Cannot dereference non-reference");
      return derefValue(inner.ref);
    }
    case "index": {
      const arr = resolveLValue(lvalue.array, env, false, evaluate);
      if (arr.kind !== "array") throw new Error("Cannot index non-array value");
      const result = getIndex(arr, evaluate(lvalue.index, env));
      if (!raw && result.kind === "ref") return derefValue(result.ref);
      return result;
    }
    case "field": {
      const struct = resolveLValue(lvalue.struct, env, false, evaluate);
      if (struct.kind !== "struct")
        throw new Error("Cannot access field on non-struct value");
      const field = struct.fields[lvalue.field];
      if (field === undefined)
        throw new Error(`Field not found: ${lvalue.field}`);
      return field;
    }
    case "scope-field": {
      return resolveScopeField(env, lvalue.field);
    }
  }
}

/** Get a variable from scope, throwing if undefined. */
function resolveScopeField(env: Environment, field: string): Value {
  const v = env.get(field);
  if (v === undefined)
    throw new Error(`Undefined variable: ${field}`);
  return v;
}

/** Write a value to the target described by an LHS. */
export function writeLValue(
  lvalue: LValue,
  env: Environment,
  value: Value,
  evaluate: (node: AstNode, env: Environment) => number,
): void {
  switch (lvalue.kind) {
    case "var": {
      env.assign(lvalue.name, value);
      return;
    }
    case "deref": {
      const inner = resolveLValue(lvalue.ref, env, true, evaluate);
      if (inner.kind !== "ref")
        throw new Error("Cannot dereference non-reference");
      assignRef(inner.ref, toNumber(value));
      return;
    }
    case "index": {
      const arr = resolveLValue(lvalue.array, env, false, evaluate);
      if (arr.kind !== "array") throw new Error("Cannot index non-array value");
      const idx = evaluate(lvalue.index, env);
      arr.elements[idx] = value;
      return;
    }
    case "field": {
      const struct = resolveLValue(lvalue.struct, env, false, evaluate);
      if (struct.kind !== "struct")
        throw new Error("Cannot assign field on non-struct value");
      struct.fields[lvalue.field] = value;
      return;
    }
    case "scope-field": {
      resolveScopeField(env, lvalue.field);
      env.assign(lvalue.field, value);
      return;
    }
  }
}

/** Structural equality for Value types. */
export function compareElements(a: Value[], b: Value[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const aEl = a[i];
    const bEl = b[i];
    if (aEl === undefined || bEl === undefined) return false;
    if (!compareEqual(aEl, bEl)) return false;
  }
  return true;
}

export function evalTupleAccess(
  node: AstNode,
  env: Environment,
  evalValue: (node: AstNode, env: Environment) => Value,
): Value {
  if (node.type !== "tuple-access") throw new Error("Expected tuple-access");
  const tuple = evalValue(node.tuple, env);
  if (tuple.kind !== "tuple")
    throw new Error("Cannot access element on non-tuple value");
  const elem = tuple.elements[node.index];
  if (elem === undefined)
    throw new Error(`Tuple index out of bounds: ${node.index}`);
  return elem;
}

export function compareEqual(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "number":
      return (
        (a as Value & { kind: "number" }).value ===
        (b as Value & { kind: "number" }).value
      );
    case "bool":
      return (
        (a as Value & { kind: "bool" }).value ===
        (b as Value & { kind: "bool" }).value
      );
    case "null":
      return true;
    case "ref":
      return (
        (a as Value & { kind: "ref" }).ref.name ===
        (b as Value & { kind: "ref" }).ref.name
      );
    case "array": {
      return compareElements(
        (a as Value & { kind: "array" }).elements,
        (b as Value & { kind: "array" }).elements,
      );
    }
    case "struct": {
      const aFields = (a as Value & { kind: "struct" }).fields;
      const bFields = (b as Value & { kind: "struct" }).fields;
      const aKeys = Object.keys(aFields);
      const bKeys = Object.keys(bFields);
      if (aKeys.length !== bKeys.length) return false;
      for (const key of aKeys) {
        const aVal = aFields[key];
        const bVal = bFields[key];
        if (aVal === undefined || bVal === undefined) return false;
        if (!compareEqual(aVal, bVal)) return false;
      }
      return true;
    }
    case "tuple": {
      return compareElements(
        (a as Value & { kind: "tuple" }).elements,
        (b as Value & { kind: "tuple" }).elements,
      );
    }
    case "fnref":
      return (
        (a as Value & { kind: "fnref" }).fn ===
        (b as Value & { kind: "fnref" }).fn
      );
    default:
      return false;
  }
}

/** Evaluate a match expression. */
export function evalMatch(
  node: Extract<AstNode, { type: "match" }>,
  env: Environment,
  evaluate: (node: AstNode, env: Environment) => number,
  evalValue: (node: AstNode, env: Environment) => Value,
): number {
  const targetVal = evalValue(node.target, env);
  for (const { pattern, body } of node.cases) {
    if (pattern === null) {
      return evaluate(body, env);
    }
    const patternVal = evalValue(pattern, env);
    if (compareEqual(targetVal, patternVal)) {
      return evaluate(body, env);
    }
  }
  throw new Error("No matching case in match expression");
}
