import { err } from "./errors.ts";
import type { EvalError, Position } from "./errors.ts";
import type { Expr, Program, Statement } from "./parser.ts";
import { Err, Ok } from "./result.ts";
import type { Result } from "./result.ts";
import type { Binding, Value } from "./value.ts";
import { resolveRefChain, validateDerefBinding } from "./value.ts";

export function checkProgram(program: Program): Result<null, EvalError> {
  return checkMutability(program.statements, new Map());
}

function checkMutability(
  statements: readonly Statement[],
  env: Map<string, Binding>,
): Result<null, EvalError> {
  const shadowed = new Map<string, Binding | null>();
  for (const stmt of statements) {
    if (stmt.type === "let") {
      if (!shadowed.has(stmt.name)) {
        shadowed.set(stmt.name, env.get(stmt.name) ?? null);
      }
      const value = inferValue(stmt.value, env);
      if (!value.ok) return value;
      const binding: Binding = {
        value: value.value ?? { kind: "number", value: 0 },
        mutable: stmt.mutable,
      };
      if (value.value === null) binding.unknown = true;
      if (stmt.value.type === "number") binding.literal = stmt.value.value;
      env.set(stmt.name, binding);
    } else if (stmt.type === "assign") {
      const target = resolveTarget(stmt.target, (name) => env.get(name));
      if (!target.ok) return target;
      // For deref targets the reference's mutability is validated by
      // resolveTarget (known kind) or the dynamic pass (unknown kind); only a
      // direct identifier reassignment is gated on the binding's own mutability.
      if (stmt.target.type === "identifier" && !target.value.binding.mutable) {
        return Err(
          err(
            "mutability",
            `Cannot reassign immutable binding "${target.value.name}"`,
            stmt.position,
          ),
        );
      }
      delete target.value.binding.literal;
      delete target.value.binding.unknown;
      const value = inferValue(stmt.value, env);
      if (!value.ok) return value;
    } else if (stmt.type === "block") {
      const inner = checkMutability(stmt.statements, env);
      if (!inner.ok) return inner;
    } else if (stmt.type === "if") {
      const cond = inferValue(stmt.condition, env);
      if (!cond.ok) return cond;
      if (cond.value && cond.value.kind !== "boolean") {
        return Err(err("semantic", "if condition must be a boolean", stmt.position));
      }
      const then = checkMutability(stmt.then, env);
      if (!then.ok) return then;
      if (stmt.else) {
        const elseResult = checkMutability(stmt.else, env);
        if (!elseResult.ok) return elseResult;
      }
    } else if (stmt.type === "return") {
      const value = inferValue(stmt.value, env);
      if (!value.ok) return value;
    } else if (stmt.type === "while") {
      const cond = inferValue(stmt.condition, env);
      if (!cond.ok) return cond;
      if (cond.value && cond.value.kind !== "boolean") {
        return Err(err("semantic", "while condition must be a boolean", stmt.position));
      }
      const body = checkMutability(stmt.body, env);
      if (!body.ok) return body;
    } else {
      const unhandled: never = stmt;
      return Err(err("semantic", `Unhandled statement type`, (unhandled as Statement).position));
    }
  }
  restoreShadowed(env, shadowed);
  return Ok(null);
}

function restoreShadowed<T>(env: Map<string, T>, shadowed: Map<string, T | null>): void {
  for (const [name, previous] of shadowed) {
    if (previous === null) {
      env.delete(name);
    } else {
      env.set(name, previous);
    }
  }
}

function validateExpr(expr: Expr, env: Map<string, Binding>): Result<null, EvalError> {
  switch (expr.type) {
    case "number":
    case "boolean":
    case "identifier":
    case "unary":
    case "binary":
    case "array":
    case "index":
      return Ok(null);
    case "ref":
      if (expr.operand.type !== "identifier") {
        return Err(err("semantic", "Can only take a reference to a variable", expr.position));
      }
      return Ok(null);
    case "deref": {
      if (expr.operand.type !== "identifier") {
        return Err(err("semantic", "Can only dereference a variable", expr.position));
      }
      const binding = env.get(expr.operand.name);
      if (binding && !binding.unknown && binding.value.kind !== "ref") {
        return Err(err("semantic", `"${expr.operand.name}" is not a reference`, expr.position));
      }
      return Ok(null);
    }
  }
}

const INT_RANGES: Record<string, { min: number; max: number }> = {
  U8: { min: 0, max: 255 },
  U16: { min: 0, max: 65535 },
  U32: { min: 0, max: 4294967295 },
  U64: { min: 0, max: 9007199254740991 },
  I8: { min: -128, max: 127 },
  I16: { min: -32768, max: 32767 },
  I32: { min: -2147483648, max: 2147483647 },
  I64: { min: -9007199254740991, max: 9007199254740991 },
  USize: { min: 0, max: 9007199254740991 },
  ISize: { min: -9007199254740991, max: 9007199254740991 },
};

function checkIntRange(expr: Expr): Result<null, EvalError> {
  if (expr.type !== "number" || !expr.suffix) return Ok(null);
  const range = INT_RANGES[expr.suffix];
  if (!range) return Ok(null);
  if (expr.value < range.min || expr.value > range.max) {
    return Err(err("semantic", `${expr.value} does not fit in ${expr.suffix}`, expr.position));
  }
  return Ok(null);
}

function isKnownZero(expr: Expr, env: Map<string, Binding>): boolean {
  return constFold(expr, env) === 0;
}

function inferIntType(expr: Expr, env: Map<string, Binding>): string | null {
  switch (expr.type) {
    case "number":
      return expr.suffix ?? null;
    case "identifier":
      return null;
    case "unary":
      return inferIntType(expr.operand, env);
    case "binary": {
      const l = inferIntType(expr.left, env);
      const r = inferIntType(expr.right, env);
      return l !== null && l === r ? l : null;
    }
    default:
      return null;
  }
}

function checkOverflow(expr: Expr, env: Map<string, Binding>): Result<null, EvalError> {
  const type = inferIntType(expr, env);
  if (!type) return Ok(null);
  const value = constFold(expr, env);
  if (value === null) return Ok(null);
  const range = INT_RANGES[type];
  if (!range) return Ok(null);
  if (value < range.min || value > range.max) {
    return Err(err("semantic", `${value} does not fit in ${type}`, expr.position));
  }
  return Ok(null);
}

function constFold(expr: Expr, env: Map<string, Binding>): number | null {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "identifier":
      return env.get(expr.name)?.literal ?? null;
    case "unary": {
      const v = constFold(expr.operand, env);
      return v === null ? null : -v;
    }
    case "binary": {
      const l = constFold(expr.left, env);
      const r = constFold(expr.right, env);
      if (l === null || r === null) return null;
      switch (expr.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return r === 0 ? null : Math.trunc(l / r);
        case "%":
          return r === 0 ? null : l % r;
        default:
          return null;
      }
    }
    case "deref": {
      if (expr.operand.type !== "identifier") return null;
      const resolved = resolveRefChain(expr.operand.name, (name) => env.get(name));
      return resolved?.binding.literal ?? null;
    }
    case "boolean":
    case "ref":
    case "array":
    case "index":
      return null;
  }
}

function inferValue(expr: Expr, env: Map<string, Binding>): Result<Value | null, EvalError> {
  const validation = validateExpr(expr, env);
  if (!validation.ok) return validation;
  switch (expr.type) {
    case "number": {
      const range = checkIntRange(expr);
      if (!range.ok) return range;
      return Ok({ kind: "number", value: 0 });
    }
    case "boolean":
      return Ok({ kind: "boolean", value: false });
    case "identifier": {
      const binding = env.get(expr.name);
      if (!binding) {
        return Err(err("runtime", `Undefined variable "${expr.name}"`, expr.position));
      }
      return Ok(binding.value);
    }
    case "unary": {
      const operand = inferValue(expr.operand, env);
      if (!operand.ok) return operand;
      return Ok({ kind: "number", value: 0 });
    }
    case "ref": {
      if (expr.operand.type !== "identifier") return Ok(null);
      const target = env.get(expr.operand.name);
      if (!target) {
        return Err(err("runtime", `Undefined variable "${expr.operand.name}"`, expr.position));
      }
      return Ok({ kind: "ref", target: expr.operand.name, mutable: expr.mutable });
    }
    case "deref": {
      if (expr.operand.type !== "identifier") return Ok(null);
      const binding = env.get(expr.operand.name);
      if (!binding) {
        return Err(err("runtime", `Undefined variable "${expr.operand.name}"`, expr.position));
      }
      const resolved = resolveRefChain(expr.operand.name, (name) => env.get(name));
      if (!resolved) {
        return Err(
          err("runtime", `Reference target "${expr.operand.name}" is undefined`, expr.position),
        );
      }
      return Ok(resolved.binding.value);
    }
    case "binary": {
      const l = inferValue(expr.left, env);
      if (!l.ok) return l;
      const r = inferValue(expr.right, env);
      if (!r.ok) return r;
      if (expr.op === "<") return Ok({ kind: "boolean", value: false });
      if (l.value?.kind !== "number" || r.value?.kind !== "number") return Ok(null);
      if ((expr.op === "/" || expr.op === "%") && isKnownZero(expr.right, env)) {
        return Err(err("runtime", "Division by zero", expr.right.position));
      }
      const overflow = checkOverflow(expr, env);
      if (!overflow.ok) return overflow;
      return Ok({ kind: "number", value: 0 });
    }
    case "array": {
      const elements: Value[] = [];
      for (const el of expr.elements) {
        const v = inferValue(el, env);
        if (!v.ok) return v;
        elements.push(v.value ?? { kind: "number", value: 0 });
      }
      return Ok({ kind: "array", elements });
    }
    case "index": {
      const arr = inferValue(expr.array, env);
      if (!arr.ok) return arr;
      const idx = inferValue(expr.index, env);
      if (!idx.ok) return idx;
      if (idx.value && idx.value.kind !== "number") {
        return Err(err("semantic", "Array index must be a number", expr.index.position));
      }
      if (arr.value && arr.value.kind !== "array") {
        return Err(err("semantic", "Cannot index a non-array value", expr.array.position));
      }
      return Ok(null);
    }
  }
}

function resolveTarget(
  target: Expr,
  get: (name: string) => Binding | undefined,
): Result<{ name: string; binding: Binding }, EvalError> {
  if (target.type === "identifier") {
    const binding = get(target.name);
    if (!binding) {
      return Err(err("runtime", `Undefined variable "${target.name}"`, target.position));
    }
    return Ok({ name: target.name, binding });
  }
  if (target.type === "deref") {
    if (target.operand.type !== "identifier") {
      return Err(
        err("semantic", "Can only assign through a reference to a variable", target.position),
      );
    }
    const refBinding = get(target.operand.name);
    if (!refBinding) {
      return Err(err("runtime", `Undefined variable "${target.operand.name}"`, target.position));
    }
    if (refBinding.unknown) {
      // Kind undecidable statically; the dynamic pass validates the target.
      return Ok({ name: target.operand.name, binding: refBinding });
    }
    return validateDerefBinding(refBinding, target.operand.name, get, target.position);
  }
  return Err(err("semantic", "Invalid assignment target", target.position));
}
