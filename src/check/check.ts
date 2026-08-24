import { err } from "../errors.ts";
import { ErrorKind } from "../errors.ts";
import type { EvalError } from "../errors.ts";
import { ExprType, StatementType } from "../ast/index.ts";
import type { Expr, IdentifierExpr, Program, Statement } from "../ast/index.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";
import { ValueKind } from "../eval/value.ts";
import type { Binding, ResolvedTarget, Value } from "../eval/value.ts";
import { resolveRefChain, validateDerefBinding } from "../eval/value.ts";

export function checkProgram(program: Program): Result<null, EvalError> {
  return checkMutability(program.statements, new Map());
}

function checkMutability(
  statements: readonly Statement[],
  env: Map<string, Binding>,
): Result<null, EvalError> {
  const shadowed = new Map<string, Binding | null>();
  for (const stmt of statements) {
    if (stmt.type === StatementType.Let) {
      if (!shadowed.has(stmt.name)) {
        shadowed.set(stmt.name, env.get(stmt.name) ?? null);
      }
      const value = inferValue(stmt.value, env);
      if (!value.ok) return value;
      const binding: Binding = {
        value: value.value,
        mutable: stmt.mutable,
      };
      if (stmt.value.type === ExprType.Number) binding.literal = stmt.value.value;
      const initType = inferIntType(stmt.value, env);
      if (stmt.annotation) {
        if (initType !== null && initType !== stmt.annotation) {
          return Err(
            err(
              ErrorKind.Semantic,
              `Initializer type "${initType}" does not match annotation "${stmt.annotation}"`,
              stmt.value.position,
            ),
          );
        }
        binding.intType = stmt.annotation;
      } else if (initType !== null) {
        binding.intType = initType;
      }
      env.set(stmt.name, binding);
    } else if (stmt.type === StatementType.Assign) {
      const target = resolveTarget(stmt.target, (name) => env.get(name));
      if (!target.ok) return target;
      // The static pass validates all assignment targets; only a direct
      // identifier reassignment is additionally gated on the binding's own
      // mutability.
      if (stmt.target.type === ExprType.Identifier && !target.value.binding.mutable) {
        return Err(
          err(
            ErrorKind.Mutability,
            `Cannot reassign immutable binding "${target.value.name}"`,
            stmt.position,
          ),
        );
      }
      delete target.value.binding.literal;
      const value = inferValue(stmt.value, env);
      if (!value.ok) return value;
      const rhsType = inferIntType(stmt.value, env);
      if (
        target.value.binding.intType &&
        rhsType !== null &&
        rhsType !== target.value.binding.intType
      ) {
        return Err(
          err(
            ErrorKind.Semantic,
            `Cannot assign "${rhsType}" value to "${target.value.binding.intType}" binding "${target.value.name}"`,
            stmt.value.position,
          ),
        );
      }
    } else if (stmt.type === StatementType.Block) {
      const inner = checkMutability(stmt.statements, env);
      if (!inner.ok) return inner;
    } else if (stmt.type === StatementType.If) {
      const cond = inferValue(stmt.condition, env);
      if (!cond.ok) return cond;
      if (cond.value && cond.value.kind !== ValueKind.Boolean) {
        return Err(err(ErrorKind.Semantic, "if condition must be a boolean", stmt.position));
      }
      const then = checkMutability(stmt.then, env);
      if (!then.ok) return then;
      if (stmt.else) {
        const elseResult = checkMutability(stmt.else, env);
        if (!elseResult.ok) return elseResult;
      }
    } else if (stmt.type === StatementType.Return) {
      const value = inferValue(stmt.value, env);
      if (!value.ok) return value;
    } else if (stmt.type === StatementType.While) {
      const cond = inferValue(stmt.condition, env);
      if (!cond.ok) return cond;
      if (cond.value && cond.value.kind !== ValueKind.Boolean) {
        return Err(err(ErrorKind.Semantic, "while condition must be a boolean", stmt.position));
      }
      const body = checkMutability(stmt.body, env);
      if (!body.ok) return body;
    } else {
      const unhandled: never = stmt;
      return Err(
        err(ErrorKind.Semantic, `Unhandled statement type`, (unhandled as Statement).position),
      );
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
    case ExprType.Number:
    case ExprType.Boolean:
    case ExprType.Identifier:
    case ExprType.Unary:
    case ExprType.Binary:
    case ExprType.Array:
    case ExprType.Index:
      return Ok(null);
    case ExprType.Ref:
      if (expr.operand.type !== ExprType.Identifier) {
        return Err(
          err(ErrorKind.Semantic, "Can only take a reference to a variable", expr.position),
        );
      }
      return Ok(null);
    case ExprType.Deref: {
      if (expr.operand.type !== ExprType.Identifier) {
        return Err(err(ErrorKind.Semantic, "Can only dereference a variable", expr.position));
      }
      const binding = env.get(expr.operand.name);
      if (binding && binding.value.kind !== ValueKind.Ref) {
        return Err(
          err(ErrorKind.Semantic, `"${expr.operand.name}" is not a reference`, expr.position),
        );
      }
      return Ok(null);
    }
  }
}

export interface IntRange {
  readonly min: number;
  readonly max: number;
}

const INT_RANGES: Record<string, IntRange> = {
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
  if (expr.type !== ExprType.Number || !expr.suffix) return Ok(null);
  const range = INT_RANGES[expr.suffix];
  if (!range) return Ok(null);
  if (expr.value < range.min || expr.value > range.max) {
    return Err(
      err(ErrorKind.Semantic, `${expr.value} does not fit in ${expr.suffix}`, expr.position),
    );
  }
  return Ok(null);
}

function isKnownZero(expr: Expr, env: Map<string, Binding>): boolean {
  return constFold(expr, env) === 0;
}

function inferIntType(expr: Expr, env: Map<string, Binding>): string | null {
  switch (expr.type) {
    case ExprType.Number:
      return expr.suffix ?? null;
    case ExprType.Identifier:
      return null;
    case ExprType.Unary:
      return inferIntType(expr.operand, env);
    case ExprType.Binary: {
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
    return Err(err(ErrorKind.Semantic, `${value} does not fit in ${type}`, expr.position));
  }
  return Ok(null);
}

function constFold(expr: Expr, env: Map<string, Binding>): number | null {
  switch (expr.type) {
    case ExprType.Number:
      return expr.value;
    case ExprType.Identifier:
      return env.get(expr.name)?.literal ?? null;
    case ExprType.Unary: {
      const v = constFold(expr.operand, env);
      return v === null ? null : -v;
    }
    case ExprType.Binary: {
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
    case ExprType.Deref: {
      if (expr.operand.type !== ExprType.Identifier) return null;
      const resolved = resolveRefChain(expr.operand.name, (name) => env.get(name));
      return resolved?.binding.literal ?? null;
    }
    case ExprType.Boolean:
    case ExprType.Ref:
    case ExprType.Array:
    case ExprType.Index:
      return null;
  }
}

function inferValue(expr: Expr, env: Map<string, Binding>): Result<Value, EvalError> {
  const validation = validateExpr(expr, env);
  if (!validation.ok) return validation;
  switch (expr.type) {
    case ExprType.Number: {
      const range = checkIntRange(expr);
      if (!range.ok) return range;
      return Ok({ kind: ValueKind.Number, value: 0 });
    }
    case ExprType.Boolean:
      return Ok({ kind: ValueKind.Boolean, value: false });
    case ExprType.Identifier: {
      const binding = env.get(expr.name);
      if (!binding) {
        return Err(err(ErrorKind.Runtime, `Undefined variable "${expr.name}"`, expr.position));
      }
      return Ok(binding.value);
    }
    case ExprType.Unary: {
      const operand = inferValue(expr.operand, env);
      if (!operand.ok) return operand;
      return Ok({ kind: ValueKind.Number, value: 0 });
    }
    case ExprType.Ref: {
      // validateExpr guarantees the operand is an identifier.
      const name = (expr.operand as IdentifierExpr).name;
      const target = env.get(name);
      if (!target) {
        return Err(err(ErrorKind.Runtime, `Undefined variable "${name}"`, expr.position));
      }
      return Ok({ kind: ValueKind.Ref, target: name, mutable: expr.mutable });
    }
    case ExprType.Deref: {
      // validateExpr guarantees the operand is an identifier.
      const name = (expr.operand as IdentifierExpr).name;
      const binding = env.get(name);
      if (!binding) {
        return Err(err(ErrorKind.Runtime, `Undefined variable "${name}"`, expr.position));
      }
      const resolved = resolveRefChain(name, (n) => env.get(n));
      if (!resolved) {
        return Err(
          err(ErrorKind.Runtime, `Reference target "${name}" is undefined`, expr.position),
        );
      }
      return Ok(resolved.binding.value);
    }
    case ExprType.Binary: {
      const l = inferValue(expr.left, env);
      if (!l.ok) return l;
      const r = inferValue(expr.right, env);
      if (!r.ok) return r;
      if (expr.op === "<") return Ok({ kind: ValueKind.Boolean, value: false });
      if (l.value.kind !== ValueKind.Number || r.value.kind !== ValueKind.Number) {
        const bad = l.value.kind !== ValueKind.Number ? expr.left : expr.right;
        return Err(err(ErrorKind.Semantic, "Arithmetic operands must be numbers", bad.position));
      }
      if ((expr.op === "/" || expr.op === "%") && isKnownZero(expr.right, env)) {
        return Err(err(ErrorKind.Runtime, "Division by zero", expr.right.position));
      }
      const overflow = checkOverflow(expr, env);
      if (!overflow.ok) return overflow;
      return Ok({ kind: ValueKind.Number, value: 0 });
    }
    case ExprType.Array: {
      const elements: Value[] = [];
      for (const el of expr.elements) {
        const v = inferValue(el, env);
        if (!v.ok) return v;
        elements.push(v.value ?? { kind: ValueKind.Number, value: 0 });
      }
      return Ok({ kind: ValueKind.Array, elements });
    }
    case ExprType.Index: {
      const arr = inferValue(expr.array, env);
      if (!arr.ok) return arr;
      const idx = inferValue(expr.index, env);
      if (!idx.ok) return idx;
      if (idx.value && idx.value.kind !== ValueKind.Number) {
        return Err(err(ErrorKind.Semantic, "Array index must be a number", expr.index.position));
      }
      if (arr.value.kind !== ValueKind.Array) {
        return Err(err(ErrorKind.Semantic, "Cannot index a non-array value", expr.array.position));
      }
      // Empty arrays have no element kind; a number placeholder keeps the
      // inference total (accessing them is a runtime out-of-range error).
      return Ok(arr.value.elements[0] ?? { kind: ValueKind.Number, value: 0 });
    }
  }
}

function resolveTarget(
  target: Expr,
  get: (name: string) => Binding | undefined,
): Result<ResolvedTarget, EvalError> {
  if (target.type === ExprType.Identifier) {
    const binding = get(target.name);
    if (!binding) {
      return Err(err(ErrorKind.Runtime, `Undefined variable "${target.name}"`, target.position));
    }
    return Ok({ name: target.name, binding });
  }
  if (target.type === ExprType.Deref) {
    if (target.operand.type !== ExprType.Identifier) {
      return Err(
        err(
          ErrorKind.Semantic,
          "Can only assign through a reference to a variable",
          target.position,
        ),
      );
    }
    const refBinding = get(target.operand.name);
    if (!refBinding) {
      return Err(
        err(ErrorKind.Runtime, `Undefined variable "${target.operand.name}"`, target.position),
      );
    }
    return validateDerefBinding(refBinding, target.operand.name, get, target.position);
  }
  return Err(err(ErrorKind.Semantic, "Invalid assignment target", target.position));
}
