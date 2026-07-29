import type { AstNode, LValue } from "./ast";
import type { Type } from "./types";
import type { EvalResult, Value } from "./value";
import { InterpreterError } from "./error";
import { bool, isDynamic, isVoid, numeric, typesEqual } from "./types";
import { evalBreak, evalOk, evalYield, isPointerValue, toNumber, unwrap } from "./value";
import { isBlockTerminal, isLoopTerminal } from "./controlflow";

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

/** Dereference a single pointer level. */
function derefOne(
  ptr: { kind: "pointer"; target: string },
  env: Map<string, Value>,
): Value {
  return env.get(ptr.target)!;
}

/** Recursively dereference all pointer levels until reaching a non-pointer value. */
function dereferenceAll(value: Value, env: Map<string, Value>): Value {
  let current = value;
  while (current.kind === "pointer") {
    current = derefOne(current, env);
  }
  return current;
}

/** Validate array index bounds and return the narrowed array value with index. */
function validateArrayIndex(
  target: Value,
  idx: number,
  pos?: { line: number; column: number },
): { arr: { kind: "array"; elements: Value[]; type?: Type }; index: number } {
  if (target.kind !== "array") {
    throw new InterpreterError("runtime", "Cannot index non-array value", pos);
  }
  if (idx < 0 || idx >= target.elements.length) {
    throw new InterpreterError(
      "runtime",
      `Array index out of bounds: ${idx}`,
      pos,
    );
  }
  return { arr: target, index: idx };
}

/**
 * Resolve an LValue to a writable location.
 * Returns a descriptor that can be used to store a value.
 */
function resolveLValue(
  lv: LValue,
  env: Map<string, Value>,
  functions: Map<string, FnDef>,
  pos?: { line: number; column: number },
): {
  set: (value: Value) => void;
  get: () => Value;
} {
  switch (lv.kind) {
    case "identifier": {
      return {
        set: (value: Value) => env.set(lv.name, value),
        get: () => env.get(lv.name)!,
      };
    }
    case "deref": {
      const ptr = unwrap(evaluate(lv.operand, env, functions));
      if (!isPointerValue(ptr))
        throw new InterpreterError(
          "runtime",
          "Cannot dereference non-pointer value",
          pos,
        );
      return {
        set: (value: Value) => env.set(ptr.target, value),
        get: () => env.get(ptr.target)!,
      };
    }
    case "index": {
      const idxValue = unwrap(evaluate(lv.index, env, functions));
      const targetLoc = resolveLValue(lv.target, env, functions, pos);
      const targetValue = dereferenceAll(targetLoc.get(), env);
      const { arr, index } = validateArrayIndex(
        targetValue,
        Math.floor(toNumber(idxValue)),
        pos,
      );
      return {
        set: (value: Value) => {
          arr.elements[index] = value;
        },
        get: () => arr.elements[index]!,
      };
    }
  }
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
      switch (node.op) {
        case "-": {
          const operand = unwrap(evaluate(node.operand, env, functions));
          return evalOk({
            kind: "number",
            value: -toNumber(operand),
            type: node.type,
          });
        }
        case "&":
        case "&mut": {
          if (node.operand.kind !== "identifier")
            throw new InterpreterError(
              "runtime",
              "Can only take reference of an identifier",
              node.pos,
            );
          return evalOk({
            kind: "pointer",
            target: node.operand.name,
            type: node.type,
          });
        }
        case "*": {
          const ptr = unwrap(evaluate(node.operand, env, functions));
          if (!isPointerValue(ptr))
            throw new InterpreterError(
              "runtime",
              "Cannot dereference non-pointer value",
              node.pos,
            );
          return evalOk(derefOne(ptr, env));
        }
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
          node.pos,
        );
      }
      return evalOk(value);
    }
    case "array": {
      const elements: Value[] = [];
      for (const elem of node.elements) {
        elements.push(unwrap(evaluate(elem, env, functions)));
      }
      return evalOk({ kind: "array", elements, type: node.type });
    }
    case "tuple": {
      const elements: Value[] = [];
      for (const elem of node.elements) {
        elements.push(unwrap(evaluate(elem, env, functions)));
      }
      return evalOk({ kind: "tuple", elements, type: node.type });
    }
    case "tuple_access": {
      const target = dereferenceAll(
        unwrap(evaluate(node.target, env, functions)),
        env,
      );
      if (target.kind !== "tuple") {
        throw new InterpreterError(
          "runtime",
          `Cannot access tuple index ${node.index} on non-tuple value`,
          node.pos,
        );
      }
      if (node.index < 0 || node.index >= target.elements.length) {
        throw new InterpreterError(
          "runtime",
          `Tuple index out of bounds: ${node.index}`,
          node.pos,
        );
      }
      return evalOk(target.elements[node.index]!);
    }
    case "struct": {
      return evalOk({ kind: "number", value: 0 });
    }
    case "struct_instantiation": {
      const fields = new Map<string, Value>();
      for (const field of node.fields) {
        fields.set(field.name, unwrap(evaluate(field.value, env, functions)));
      }
      return evalOk({ kind: "struct", fields, type: node.type });
    }
    case "field_access": {
      const target = dereferenceAll(
        unwrap(evaluate(node.target, env, functions)),
        env,
      );
      if (target.kind !== "struct") {
        throw new InterpreterError(
          "runtime",
          `Cannot access field '${node.field}' on non-struct value`,
          node.pos,
        );
      }
      return evalOk(target.fields.get(node.field)!);
    }
    case "index": {
      const target = dereferenceAll(
        unwrap(evaluate(node.target, env, functions)),
        env,
      );
      const idx = unwrap(evaluate(node.index, env, functions));
      const { arr, index } = validateArrayIndex(
        target,
        Math.floor(toNumber(idx)),
        node.pos,
      );
      return evalOk(arr.elements[index]!);
    }
    case "let": {
      const value = unwrap(evaluate(node.value, env, functions));
      env.set(node.name, value);
      return evalOk({ kind: "number", value: 0 });
    }
    case "assign": {
      const value = unwrap(evaluate(node.value, env, functions));
      const loc = resolveLValue(node.target, env, functions, node.pos);
      loc.set(value);
      return evalOk(value);
    }
    case "block": {
      let result: Value = { kind: "number", value: 0 };
      for (const stmt of node.statements) {
        const evalResult = evaluate(stmt, env, functions);
        if (isBlockTerminal(evalResult)) return evalOk(evalResult.value);
        result = evalResult.value;
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
        if (isLoopTerminal(result)) return evalOk(result.value);
      }
      return evalOk({ kind: "number", value: 0 });
    }
    case "break": {
      const value = unwrap(evaluate(node.value, env, functions));
      return evalBreak(value);
    }
    case "yield": {
      const value = unwrap(evaluate(node.value, env, functions));
      return evalYield(value);
    }
    case "while": {
      while (toNumber(unwrap(evaluate(node.condition, env, functions))) !== 0) {
        const result = evaluate(
          { kind: "block", statements: node.body },
          env,
          functions,
        );
        if (isLoopTerminal(result)) return result;
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
      if (node.callee.kind !== "identifier")
        throw new InterpreterError(
          "runtime",
          "Call target must be an identifier",
          node.pos,
        );
      const fnDef = functions.get(node.callee.name);
      if (!fnDef) {
        throw new InterpreterError(
          "runtime",
          `Undefined function: ${node.callee.name}`,
          node.pos,
        );
      }
      const callEnv = new Map(env);
      for (let i = 0; i < fnDef.params.length; i++) {
        const arg = unwrap(evaluate(node.args[i]!, env, functions));
        callEnv.set(fnDef.params[i]!.name, arg);
      }
      return evaluate(fnDef.body, callEnv, functions);
    }
    case "match": {
      const targetValue = unwrap(evaluate(node.target, env, functions));
      for (const case_ of node.cases) {
        if (case_.pattern === "_") {
          return evaluate(case_.body, env, functions);
        }
        const patternValue = unwrap(evaluate(case_.pattern, env, functions));
        if (toNumber(targetValue) === toNumber(patternValue)) {
          return evaluate(case_.body, env, functions);
        }
      }
      throw new InterpreterError(
        "runtime",
        "No matching case in match expression",
        node.pos,
      );
    }
  }
  return evalOk({ kind: "number", value: 0 });
}
