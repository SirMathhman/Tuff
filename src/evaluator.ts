import type { AstNode } from "./ast";
import type { Type } from "./types";
import type { EvalResult, Value } from "./value";
import { InterpreterError } from "./error";
import { bool, isDynamic, isNumeric, isVoid, numeric } from "./types";
import { evalBreak, evalOk, toNumber, unwrap } from "./value";

type FnDef = { params: { name: string; type?: Type }[]; body: AstNode };

/** Type guard for block nodes with a void type field. */
function isBlockWithVoidType(
  node: AstNode,
): node is { kind: "block"; statements: AstNode[]; type: Type } {
  return (
    node.kind === "block" &&
    "type" in node &&
    node.type !== undefined &&
    isVoid(node.type)
  );
}

function getMutable(name: string, env: Map<string, Value>): Value | undefined {
  if (!env.has(`__mutable__${name}`)) return undefined;
  return env.get(name);
}

function setMutable(name: string, value: Value, env: Map<string, Value>): void {
  if (!env.has(`__mutable__${name}`)) {
    throw new InterpreterError(
      "runtime",
      `Cannot assign to immutable variable: ${name}`,
    );
  }
  env.set(name, value);
}

export function evaluate(
  node: AstNode,
  env: Map<string, Value> = new Map(),
  functions: Map<string, FnDef> = new Map(),
): EvalResult {
  switch (node.kind) {
    case "number":
      return evalOk({ kind: "number", value: node.value, type: node.type });
    case "boolean":
      return evalOk({ kind: "boolean", value: node.value, type: node.type });
    case "unary": {
      const operand = unwrap(evaluate(node.operand, env, functions));
      switch (node.op) {
        case "-":
          return evalOk({
            kind: "number",
            value: -toNumber(operand),
            type: node.type,
          });
      }
      break;
    }
    case "binary": {
      const left = unwrap(evaluate(node.left, env, functions));
      const right = unwrap(evaluate(node.right, env, functions));
      const l = toNumber(left);
      const r = toNumber(right);
      switch (node.op) {
        case "+":
          return evalOk({ kind: "number", value: l + r, type: node.type });
        case "-":
          return evalOk({ kind: "number", value: l - r, type: node.type });
        case "*":
          return evalOk({ kind: "number", value: l * r, type: node.type });
        case "/":
          return evalOk({ kind: "number", value: l / r, type: node.type });
        case "||":
          return evalOk(toNumber(left) !== 0 ? left : right);
        case "&&":
          return evalOk(toNumber(left) !== 0 ? right : left);
        case "<":
          return evalOk({ kind: "boolean", value: l < r, type: node.type });
        case ">":
          return evalOk({ kind: "boolean", value: l > r, type: node.type });
        case "==":
          return evalOk({ kind: "boolean", value: l === r, type: node.type });
        case "!=":
          return evalOk({ kind: "boolean", value: l !== r, type: node.type });
        case "<=":
          return evalOk({ kind: "boolean", value: l <= r, type: node.type });
        case ">=":
          return evalOk({ kind: "boolean", value: l >= r, type: node.type });
      }
      break;
    }
    case "identifier": {
      const value = env.get(node.name);
      if (value === undefined) {
        throw new InterpreterError(
          "runtime",
          `Undefined identifier: ${node.name}`,
        );
      }
      return evalOk(value);
    }
    case "let": {
      const value = unwrap(evaluate(node.value, env, functions));
      env.set(node.name, value);
      if (node.mutable) {
        env.set(`__mutable__${node.name}`, { kind: "boolean", value: true });
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "assign": {
      const value = unwrap(evaluate(node.value, env, functions));
      setMutable(node.name, value, env);
      return evalOk(value);
    }
    case "augassign": {
      const current = getMutable(node.name, env)!;
      const rhs = unwrap(evaluate(node.value, env, functions));
      const newValue: Value = {
        kind: "number",
        value: toNumber(current) + toNumber(rhs),
      };
      setMutable(node.name, newValue, env);
      return evalOk(newValue);
    }
    case "block": {
      let result: Value = { kind: "number", value: 0 };
      for (const stmt of node.statements) {
        result = unwrap(evaluate(stmt, env, functions));
      }
      return evalOk(result);
    }
    case "if": {
      const condition = unwrap(evaluate(node.condition, env, functions));
      if (toNumber(condition) !== 0) {
        return evaluate(node.then, env, functions);
      } else {
        return evaluate(node.elseBranch, env, functions);
      }
    }
    case "loop": {
      for (const stmt of node.body) {
        const result = evaluate(stmt, env, functions);
        if (result.kind === "break") return evalOk(result.value);
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "break": {
      const value = unwrap(evaluate(node.value, env, functions));
      return evalBreak(value);
    }
    case "while": {
      while (toNumber(unwrap(evaluate(node.condition, env, functions))) !== 0) {
        const result = evaluate(
          { kind: "block", statements: node.body },
          env,
          functions,
        );
        if (result.kind === "break") return result;
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "typecheck": {
      const value = unwrap(evaluate(node.value, env, functions));
      // For void-typed blocks, use the AST node's pre-computed type.
      const resolvedType =
        isVoid(node.type) && isBlockWithVoidType(node.value)
          ? node.value.type
          : value.kind === "number" && value.type && isDynamic(value.type)
            ? numeric("I", 32)
            : value.type;
      return evalOk({
        kind: "boolean",
        value: typesEqual(resolvedType, node.type),
        type: bool(),
      });
    }
    case "fn": {
      functions.set(node.name, { params: node.params, body: node.body });
      return evalOk({ kind: "number", value: 0 });
    }
    case "call": {
      const callee = node.callee as { kind: "identifier"; name: string };
      const fnDef = functions.get(callee.name);
      if (!fnDef) {
        throw new InterpreterError(
          "runtime",
          `Undefined function: ${callee.name}`,
        );
      }
      const callEnv = new Map(env);
      for (let i = 0; i < fnDef.params.length; i++) {
        const arg = unwrap(evaluate(node.args[i]!, env, functions));
        callEnv.set(fnDef.params[i]!.name, arg);
      }
      return evaluate(fnDef.body, callEnv, functions);
    }
  }
  return evalOk({ kind: "number", value: 0 });
}

/** Check if two types are exactly equal. */
function typesEqual(a: Type | undefined, b: Type): boolean {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "bool") return true;
  if (a.kind === "void") return true;
  if (a.kind === "dynamic") return b.kind === "dynamic";
  if (isNumeric(a) && isNumeric(b))
    return a.prefix === b.prefix && a.bits === b.bits;
  return false;
}
