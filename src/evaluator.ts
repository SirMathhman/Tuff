import type { AstNode, LValue } from "./ast";
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
  nullValue,
} from "./environment";
import type { Ref, Value } from "./environment";
import { Break, Continue, Yield, Return } from "./control-flow";
import { checkType } from "./type-checker";

/** Evaluate a range expression and return { start, end }. */
function evalRange(
  node: AstNode,
  env: Environment,
): { start: number; end: number } {
  const v = evalValue(node, env);
  if (v.kind !== "range") throw new Error("Expected range value");
  return { start: v.start, end: v.end };
}

/** Get element from array at index, throwing on out of bounds. */
function getIndex(
  arr: { kind: "array"; elements: Value[] },
  idx: number,
): Value {
  const result = arr.elements[idx];
  if (result === undefined)
    throw new Error(`Array index out of bounds: ${idx}`);
  return result;
}

/** Evaluate literal nodes (num, bool, char, string). */
function evalLiteral(node: AstNode): Value {
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
function evalCollection(node: AstNode, env: Environment): Value {
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
function evalReference(node: AstNode, env: Environment): Value {
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
function evalStruct(node: AstNode, env: Environment): Value {
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
function evalOperator(node: AstNode, env: Environment): Value {
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

/** Evaluate a node and return the raw Value instead of unwrapping to number. */
function evalValue(node: AstNode, env: Environment): Value {
  switch (node.type) {
    case "num":
    case "bool":
    case "char":
    case "string":
    case "null":
      return evalLiteral(node);
    case "id": {
      const v = env.get(node.name);
      if (v === undefined) throw new Error("Undefined variable: " + node.name);
      return v;
    }
    case "array-literal":
    case "array-index":
    case "range":
      return evalCollection(node, env);
    case "ref":
    case "deref":
      return evalReference(node, env);
    case "struct-literal":
    case "struct-access":
      return evalStruct(node, env);
    case "tuple-literal": {
      const elements = node.elements.map((el) => evalValue(el, env));
      return { kind: "tuple", elements };
    }
    case "tuple-access": {
      const tuple = evalValue(node.tuple, env);
      if (tuple.kind !== "tuple")
        throw new Error("Cannot access element on non-tuple value");
      const elem = tuple.elements[node.index];
      if (elem === undefined)
        throw new Error(`Tuple index out of bounds: ${node.index}`);
      return elem;
    }
    case "binop":
    case "unop":
    case "cast":
      return evalOperator(node, env);
    case "fnref": {
      const fn = env.getFunction(node.name);
      if (fn === undefined) throw new Error("Undefined function: " + node.name);
      return { kind: "fnref", fn };
    }
    default: {
      try {
        return num(evaluate(node, env));
      } catch (e) {
        if (e instanceof Return) throw e;
        throw e;
      }
    }
  }
}

/** Resolve an LHS to the Value it points to. */
function resolveLValue(lvalue: LValue, env: Environment, raw = false): Value {
  switch (lvalue.kind) {
    case "var": {
      const v = env.get(lvalue.name);
      if (v === undefined)
        throw new Error("Undefined variable: " + lvalue.name);
      if (!raw && v.kind === "ref") return derefValue(v.ref);
      return v;
    }
    case "deref": {
      const inner = resolveLValue(lvalue.ref, env, true);
      if (inner.kind !== "ref")
        throw new Error("Cannot dereference non-reference");
      return derefValue(inner.ref);
    }
    case "index": {
      const arr = resolveLValue(lvalue.array, env);
      if (arr.kind !== "array") throw new Error("Cannot index non-array value");
      const result = getIndex(arr, evaluate(lvalue.index, env));
      if (!raw && result.kind === "ref") return derefValue(result.ref);
      return result;
    }
    case "field": {
      const struct = resolveLValue(lvalue.struct, env);
      if (struct.kind !== "struct")
        throw new Error("Cannot access field on non-struct value");
      const field = struct.fields[lvalue.field];
      if (field === undefined)
        throw new Error(`Field not found: ${lvalue.field}`);
      return field;
    }
  }
}

/** Write a value to the target described by an LHS. */
function writeLValue(lvalue: LValue, env: Environment, value: Value): void {
  switch (lvalue.kind) {
    case "var": {
      env.assign(lvalue.name, value);
      return;
    }
    case "deref": {
      const inner = resolveLValue(lvalue.ref, env, true);
      if (inner.kind !== "ref")
        throw new Error("Cannot dereference non-reference");
      assignRef(inner.ref, toNumber(value));
      return;
    }
    case "index": {
      const arr = resolveLValue(lvalue.array, env);
      if (arr.kind !== "array") throw new Error("Cannot index non-array value");
      const idx = evaluate(lvalue.index, env);
      arr.elements[idx] = value;
      return;
    }
    case "field": {
      const struct = resolveLValue(lvalue.struct, env);
      if (struct.kind !== "struct")
        throw new Error("Cannot assign field on non-struct value");
      struct.fields[lvalue.field] = value;
      return;
    }
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

/** Structural equality for Value types. */
function compareElements(a: Value[], b: Value[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const aEl = a[i];
    const bEl = b[i];
    if (aEl === undefined || bEl === undefined) return false;
    if (!compareEqual(aEl, bEl)) return false;
  }
  return true;
}

function compareEqual(a: Value, b: Value): boolean {
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

/** Evaluate literal nodes (num, bool, char, string) to a number. */
function evalLiteralNum(node: AstNode): number {
  switch (node.type) {
    case "num":
      return node.value;
    case "bool":
      return node.value ? 1 : 0;
    case "char":
      return node.value.charCodeAt(0);
    case "string":
      return 0;
    default:
      throw new Error(`Unexpected literal: ${node.type}`);
  }
}

/** Evaluate operator nodes (unop, binop) to a number. */
function evalOperatorNum(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "unop":
      return -evaluate(node.operand, env);
    case "binop": {
      try {
        const leftVal = evalValue(node.left, env);
        const rightVal = evalValue(node.right, env);
        // Handle equality before numeric conversion (null !== 0)
        if (node.op === "==") return compareEqual(leftVal, rightVal) ? 1 : 0;
        if (node.op === "!=") return compareEqual(leftVal, rightVal) ? 0 : 1;
        const left = toNumber(leftVal);
        const right = toNumber(rightVal);
        const isFloat =
          (leftVal.kind === "number" && leftVal.isFloat) ||
          (rightVal.kind === "number" && rightVal.isFloat);
        switch (node.op) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            return isFloat ? left / right : Math.trunc(left / right);
          case "&&":
            return left && right;
          case "||":
            return left || right;
          case "<":
            return left < right ? 1 : 0;
          case "<=":
            return left <= right ? 1 : 0;
          case ">":
            return left > right ? 1 : 0;
          case ">=":
            return left >= right ? 1 : 0;
        }
        break;
      } catch (e) {
        if (e instanceof Return) throw e;
        throw e;
      }
    }
    default:
      throw new Error(`Unexpected operator: ${node.type}`);
  }
}

/** Evaluate assignment nodes (let, assign, compoundassign). */
function evalAssignment(node: AstNode, env: Environment): number {
  switch (node.type) {
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
      writeLValue(node.lvalue, env, num(value));
      return value;
    }
    case "compoundassign": {
      const current = toNumber(resolveLValue(node.lvalue, env));
      const rhs = evaluate(node.value, env);
      const compoundValue = node.op === "+" ? current + rhs : current - rhs;
      writeLValue(node.lvalue, env, num(compoundValue));
      return compoundValue;
    }
    default:
      throw new Error(`Unexpected assignment: ${node.type}`);
  }
}

/** Evaluate control flow nodes (if, while, for, break, continue). */
function evalControlFlow(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "if-statement":
    case "if-expression": {
      const condition = evaluate(node.condition, env);
      if (condition !== 0) {
        try {
          return evaluate(node.thenBranch, env);
        } catch (e) {
          if (e instanceof Yield || e instanceof Return) throw e;
          throw e;
        }
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
    case "break":
      throw new Break();
    case "continue":
      throw new Continue();
    case "yield":
      throw new Yield(evaluate(node.value, env));
    case "return":
      throw new Return(evaluate(node.value, env));
    default:
      throw new Error(`Unexpected control flow: ${node.type}`);
  }
}

/** Evaluate type operation nodes (cast, type-check, type-alias). */
function evalTypeOp(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "cast": {
      const value = evalValue(node.expression, env);
      const numValue = value.kind === "number" ? value.value : toNumber(value);
      return toNumber(
        num(numValue, node.typeName.toLowerCase() as IntTypeName),
      );
    }
    case "type-check": {
      const val = evalValue(node.operand, env);
      return checkType(val, node.typeNode, env, evaluate, num) ? 1 : 0;
    }
    case "type-alias": {
      env.declareTypeAlias(node.name, node.typeNode);
      return 0;
    }
    default:
      throw new Error(`Unexpected type operation: ${node.type}`);
  }
}

/** Evaluate struct/array nodes to a number. */
function evalCollectionNum(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "array-literal":
      return 0;
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
    case "struct-literal":
      return 0;
    case "struct-access": {
      const structVal = evalValue(node.struct, env);
      if (node.field === "length" && structVal.kind === "array") {
        return structVal.elements.length;
      }
      if (structVal.kind !== "struct")
        throw new Error("Cannot access field on non-struct value");
      const field = structVal.fields[node.field];
      if (field === undefined)
        throw new Error(`Field not found: ${node.field}`);
      return toNumber(field);
    }
    default:
      throw new Error(`Unexpected collection: ${node.type}`);
  }
}

/** Evaluate function nodes (fn-def, fnref, fn-call). */
function evalFunction(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "fn-def": {
      env.declareFunction(node.name, {
        params: node.params,
        returnType: node.returnType,
        body: node.body,
        env,
      });
      return 0;
    }
    case "fnref":
      return 0;
    case "fn-call": {
      const calleeVal = env.get(node.name);
      let fn: import("./environment").FnDef;
      if (calleeVal?.kind === "fnref") {
        fn = calleeVal.fn;
      } else {
        const namedFn = env.getFunction(node.name);
        if (namedFn === undefined)
          throw new Error("Undefined function: " + node.name);
        fn = namedFn;
      }
      const fnEnv = new Environment(fn.env ?? env);
      if (fn.params.length !== node.args.length)
        throw new Error(
          `Function expects ${fn.params.length} arguments, got ${node.args.length}`,
        );
      for (let i = 0; i < fn.params.length; i++) {
        const param = fn.params[i]!;
        const arg = node.args[i]!;
        fnEnv.declare(param.name, evalValue(arg, env), false);
      }
      try {
        return evaluate(fn.body, fnEnv);
      } catch (e) {
        if (e instanceof Yield) return e.value;
        if (e instanceof Return) return e.value;
        throw e;
      }
    }
    default:
      throw new Error(`Unexpected function: ${node.type}`);
  }
}

export function evaluate(node: AstNode, env: Environment): number {
  switch (node.type) {
    case "num":
    case "bool":
    case "char":
      return evalLiteralNum(node);
    case "id": {
      const value = env.get(node.name);
      if (value === undefined)
        throw new Error("Undefined variable: " + node.name);
      if (value.kind === "ref") return deref(value.ref);
      return toNumber(value);
    }
    case "unop":
    case "binop":
      return evalOperatorNum(node, env);
    case "let":
    case "assign":
    case "compoundassign":
      return evalAssignment(node, env);
    case "if-statement":
    case "if-expression":
    case "while-loop":
    case "for-loop":
    case "break":
    case "continue":
    case "yield":
    case "return":
      return evalControlFlow(node, env);
    case "cast":
    case "type-check":
    case "type-alias":
      return evalTypeOp(node, env);
    case "array-literal":
    case "array-index":
    case "struct-literal":
    case "struct-access":
      return evalCollectionNum(node, env);
    case "fn-def":
    case "fnref":
    case "fn-call":
      return evalFunction(node, env);
    case "deref":
      return evaluate(node.operand, env);
    case "ref":
      return 0;
    case "block": {
      if (node.statements.length === 0) throw new Error("Empty block");
      const blockEnv = new Environment(env);
      let last = 0;
      let hasValue = false;
      for (const stmt of node.statements) {
        if (stmt.type !== "let") {
          hasValue = true;
        }
        try {
          last = evaluate(stmt, blockEnv);
        } catch (e) {
          if (e instanceof Yield) return e.value;
          if (e instanceof Return) throw e;
          throw e;
        }
      }
      if (!hasValue) throw new Error("Block has no value");
      return last;
    }
    case "range":
      return 0;
    case "enum-def": {
      env.declareEnum(node.name, node.variants);
      return 0;
    }
    case "enum-access": {
      const variants = env.getEnum(node.enumName);
      if (!variants) {
        throw new Error(`Unknown enum: ${node.enumName}`);
      }
      const idx = variants.indexOf(node.variant);
      if (idx === -1) {
        throw new Error(`Unknown variant: ${node.variant}`);
      }
      return idx;
    }
    case "match": {
      const targetVal = evalValue(node.target, env);
      for (const { pattern, body } of node.cases) {
        const patternVal = evalValue(pattern, env);
        if (compareEqual(targetVal, patternVal)) {
          return evaluate(body, env);
        }
      }
      throw new Error("No matching case in match expression");
    }
    default:
      return 0;
  }
}
