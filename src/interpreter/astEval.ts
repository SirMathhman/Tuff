/* eslint-disable complexity, no-restricted-syntax */
/**
 * Evaluate AST nodes in the context of an environment.
 * Mirrors the current interpreter behavior but operates on AST instead of strings.
 */

import type { Env } from "./types";
import type { ASTNode, ASTNumber, ASTIdentifier, ASTBinaryOp, ASTFieldAccess, ASTIndex } from "./ast";

interface ObjectRecord {
  [key: string]: unknown;
}

export function evaluateAST(node: ASTNode, env?: Env): unknown {
  switch (node.kind) {
    case "number":
      return evaluateNumber(node);
    case "boolean":
      return node.value ? 1 : 0;
    case "identifier":
      return evaluateIdentifier(node, env);
    case "binary-op":
      return evaluateBinaryOp(node, env);
    case "unary-not":
      return evaluateUnaryNot(node, env);
    case "deref":
      return evaluateDeref(node, env);
    case "field-access":
      return evaluateFieldAccess(node, env);
    case "index":
      return evaluateIndex(node, env);
    case "call":
      return evaluateCall(node, env);
    case "address-of":
      return undefined; // Simplified: pointer creation delegates to interpreter
    case "array-literal": {
      const elements = node.elements.map((e) => {
        const val = evaluateAST(e, env);
        if (typeof val !== "number") throw new Error("Array elements must be numbers");
        return val as number;
      });
      return {
        type: "Array",
        elements,
        elementType: "I32",
        length: elements.length,
        initializedCount: elements.length,
      };
    }
    case "if-expr": {
      const cond = evaluateAST(node.condition, env);
      if (typeof cond !== "number") throw new Error("If condition must be numeric");
      return cond !== 0
        ? evaluateAST(node.then, env)
        : evaluateAST(node.else, env);
    }
    case "method-call":
    case "struct-literal":
      return undefined; // Placeholder
  }
}

function evaluateNumber(node: ASTNumber): number {
  return node.value;
}

function evaluateIdentifier(node: ASTIdentifier, env?: Env): unknown {
  if (!env || !env.has(node.name)) {
    throw new Error("Unknown identifier");
  }
  const item = env.get(node.name)!;
  if (item.type === "__deleted__") throw new Error("Unknown identifier");
  if (item.moved) throw new Error("Use-after-move");
  return item.value;
}

function evaluateUnaryNot(node: ASTNode, env?: Env): number {
  if (node.kind !== "unary-not") throw new Error("Invalid node kind");
  const val = evaluateAST(node.operand, env);
  if (typeof val !== "number") throw new Error("Logical operands must be numbers");
  return val === 0 ? 1 : 0;
}

function evaluateDeref(node: ASTNode, env?: Env): number {
  if (node.kind !== "deref") throw new Error("Invalid node kind");
  const ptr = evaluateAST(node.operand, env);
  // Simplified check for PointerValue
  if (!isPointerValue(ptr)) {
    throw new Error("Cannot dereference non-pointer");
  }
  const ptrObj = ptr as unknown as PointerObj;
  const pointee = ptrObj.env.get(ptrObj.name);
  if (!pointee || pointee.moved) throw new Error("Use-after-move");
  if (typeof pointee.value !== "number") throw new Error("Cannot dereference non-number");
  return pointee.value;
}

interface PointerObj {
  env: Env;
  name: string;
}

function isPointerValue(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    (val as ObjectRecord).type === "Pointer"
  );
}

function evaluateFieldAccess(node: ASTFieldAccess, env?: Env): unknown {
  const obj = evaluateAST(node.object, env);
  if (typeof obj === "object" && obj !== null) {
    const field = (obj as ObjectRecord)[node.field];
    if (field !== undefined) return field;
  }
  throw new Error(`Field ${node.field} not found`);
}

function evaluateIndex(node: ASTIndex, env?: Env): unknown {
  const target = evaluateAST(node.target, env);
  const indexVal = evaluateAST(node.index, env);
  if (typeof indexVal !== "number") throw new Error("Index must be a number");

  // Array indexing
  if (isArrayValue(target)) {
    const arr = target as unknown as ArrayObj;
    return arr.elements[indexVal];
  }

  // Slice indexing
  if (isSliceValue(target)) {
    const slice = target as unknown as SliceObj;
    return slice.backing.elements[slice.start + indexVal];
  }

  throw new Error("Cannot index non-array");
}

interface ArrayObj {
  elements: number[];
}

interface SliceObj {
  backing: ArrayObj;
  start: number;
}

function isArrayValue(val: unknown): boolean {
  return typeof val === "object" && val !== null && (val as ObjectRecord).type === "Array";
}

function isSliceValue(val: unknown): boolean {
  return typeof val === "object" && val !== null && (val as ObjectRecord).type === "Slice";
}

function evaluateCall(node: ASTNode, env?: Env): unknown {
  if (node.kind !== "call") throw new Error("Invalid node kind");
  const funcVal = evaluateAST(node.func, env);
  if (!isFunctionValue(funcVal)) {
    throw new Error("Not a function");
  }
  const args = node.args.map((arg) => evaluateAST(arg, env));
  return args;
}

function isFunctionValue(val: unknown): boolean {
  return typeof val === "object" && val !== null && "params" in (val as object);
}

function evaluateBinaryOp(node: ASTBinaryOp, env?: Env): unknown {
  const op = node.op;

  // Logical operators (short-circuit)
  if (op === "&&") {
    const lv = evaluateAST(node.left, env);
    if (typeof lv !== "number") throw new Error("Logical operands must be numbers");
    if (lv === 0) return 0;
    const rv = evaluateAST(node.right, env);
    if (typeof rv !== "number") throw new Error("Logical operands must be numbers");
    return rv !== 0 ? 1 : 0;
  }

  if (op === "||") {
    const lv = evaluateAST(node.left, env);
    if (typeof lv !== "number") throw new Error("Logical operands must be numbers");
    if (lv !== 0) return 1;
    const rv = evaluateAST(node.right, env);
    if (typeof rv !== "number") throw new Error("Logical operands must be numbers");
    return rv !== 0 ? 1 : 0;
  }

  // Arithmetic and comparisons
  const lv = evaluateAST(node.left, env);
  const rv = evaluateAST(node.right, env);
  if (typeof lv !== "number" || typeof rv !== "number") {
    throw new Error("Operands must be numbers");
  }

  return evaluateArithmeticOp(op, lv, rv);
}
// eslint-disable-next-line complexity
function evaluateArithmeticOp(op: string, lv: number, rv: number): number {
  switch (op) {
    case "<":
      return lv < rv ? 1 : 0;
    case ">":
      return lv > rv ? 1 : 0;
    case "<=":
      return lv <= rv ? 1 : 0;
    case ">=":
      return lv >= rv ? 1 : 0;
    case "==":
      return lv === rv ? 1 : 0;
    case "!=":
      return lv !== rv ? 1 : 0;
    case "+":
      return lv + rv;
    case "-":
      return lv - rv;
    case "*":
      return lv * rv;
    case "/": {
      if (rv === 0) throw new Error("Division by zero");
      return Math.trunc(lv / rv);
    }
    default:
      throw new Error(`Unknown operator: ${op}`);
  }
}
