import { err } from "../errors.ts";
import { ErrorKind } from "../errors.ts";
import type { EvalError, Position } from "../errors.ts";
import { ExprType, StatementType } from "../ast/index.ts";
import type {
  BinaryExpr,
  DerefExpr,
  Expr,
  FieldExpr,
  Program,
  Statement,
  StructExpr,
} from "../ast/index.ts";
import { Err, Ok, andThen } from "../result.ts";
import type { Result } from "../result.ts";
import { ValueKind } from "./value.ts";
import type { ArrayValue, Binding, FnValue, NumberValue, StructValue, Value } from "./value.ts";
import { resolveRefChain } from "./value.ts";

export function evaluateProgram(program: Program): Result<number, EvalError> {
  const env = new Map<string, Binding>();
  const result = evalStatements(program.statements, env);
  if (!result.ok) return result;
  return Ok(result.value ?? 0);
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

function evalStatements(
  statements: readonly Statement[],
  env: Map<string, Binding>,
): Result<number | null, EvalError> {
  const shadowed = new Map<string, Binding | null>();
  for (const stmt of statements) {
    if (stmt.type === StatementType.Let) {
      const value = evalExpr(stmt.value, env);
      if (!value.ok) return value;
      if (!shadowed.has(stmt.name)) {
        shadowed.set(stmt.name, env.get(stmt.name) ?? null);
      }
      env.set(stmt.name, { value: value.value, mutable: stmt.mutable });
    } else if (stmt.type === StatementType.Assign) {
      // The static pass validates all assignment targets.
      const target = resolveAssignTarget(stmt.target, (n) => env.get(n), stmt.position);
      if (!target.ok) return target;
      const value = evalExpr(stmt.value, env);
      if (!value.ok) return value;
      const live = env.get(target.value);
      if (live) live.value = value.value;
    } else if (stmt.type === StatementType.Block) {
      const inner = evalStatements(stmt.statements, env);
      if (!inner.ok) return inner;
      if (inner.value !== null) return inner;
    } else if (stmt.type === StatementType.If) {
      // The static pass already checked the condition is a boolean.
      const cond = evalExpr(stmt.condition, env);
      if (!cond.ok) return cond;
      const branch =
        cond.value.kind === ValueKind.Boolean && cond.value.value ? stmt.then : stmt.else;
      if (branch) {
        const inner = evalStatements(branch, env);
        if (!inner.ok) return inner;
        if (inner.value !== null) return inner;
      }
    } else if (stmt.type === StatementType.Return) {
      return andThen(evalExpr(stmt.value, env), (v) => toNumber(v, stmt.position));
    } else if (stmt.type === StatementType.While) {
      // The static pass already checked the condition is a boolean.
      for (;;) {
        const cond = evalExpr(stmt.condition, env);
        if (!cond.ok) return cond;
        if (!(cond.value.kind === ValueKind.Boolean && cond.value.value)) break;
        const inner = evalStatements(stmt.body, env);
        if (!inner.ok) return inner;
        if (inner.value !== null) return inner;
      }
    } else if (stmt.type === StatementType.FnDecl) {
      if (!shadowed.has(stmt.name)) {
        shadowed.set(stmt.name, env.get(stmt.name) ?? null);
      }
      env.set(stmt.name, {
        value: {
          kind: ValueKind.Fn,
          params: stmt.params,
          returnType: stmt.returnType,
          body: stmt.body,
        },
        mutable: false,
      });
    } else if (stmt.type === StatementType.StructDecl) {
      if (!shadowed.has(stmt.name)) {
        shadowed.set(stmt.name, env.get(stmt.name) ?? null);
      }
      env.set(stmt.name, {
        value: { kind: ValueKind.Struct, structName: stmt.name, fields: stmt.fields, values: [] },
        mutable: false,
      });
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

function resolveAssignTarget(
  target: Expr,
  get: (name: string) => Binding | undefined,
  position: Position,
): Result<string, EvalError> {
  if (target.type === ExprType.Identifier) return Ok(target.name);
  if (target.type === ExprType.Deref && target.operand.type === ExprType.Identifier) {
    // The static pass validates the reference kind and mutability; here we
    // only resolve the chain to find the binding to update.
    const resolved = resolveRefChain(target.operand.name, get);
    if (!resolved) {
      return Err(
        err(
          ErrorKind.Runtime,
          `Reference target "${target.operand.name}" is undefined`,
          target.position,
        ),
      );
    }
    return Ok(resolved.name);
  }
  return Err(err(ErrorKind.Semantic, "Invalid assignment target", position));
}

function toNumber(value: Value, position: Position): Result<number, EvalError> {
  if (value.kind === ValueKind.Number) return Ok(value.value);
  if (value.kind === ValueKind.Boolean) return Ok(value.value ? 1 : 0);
  if (value.kind === ValueKind.Ref) {
    return Err(
      err(
        ErrorKind.Semantic,
        `Expected a number but found a reference to "${value.target}"`,
        position,
      ),
    );
  }
  if (value.kind === ValueKind.Struct) {
    return Err(err(ErrorKind.Semantic, "Expected a number but found a struct", position));
  }
  if (value.kind === ValueKind.String) {
    return Err(err(ErrorKind.Semantic, "Expected a number but found a string", position));
  }
  return Err(err(ErrorKind.Semantic, "Expected a number but found an array", position));
}

function evalDeref(expr: DerefExpr, env: Map<string, Binding>): Result<Value, EvalError> {
  const name = expr.operand.type === ExprType.Identifier ? expr.operand.name : "";
  // The static pass validates the reference kind.
  const resolved = resolveRefChain(name, (n) => env.get(n));
  if (!resolved) {
    return Err(err(ErrorKind.Runtime, `Reference target "${name}" is undefined`, expr.position));
  }
  return Ok(resolved.binding.value);
}

function evalExpr(expr: Expr, env: Map<string, Binding>): Result<Value, EvalError> {
  // Semantic checks (operand shape, binding existence, reference kinds) are
  // performed by the static pass; this pass only computes values.
  switch (expr.type) {
    case ExprType.Number:
      return Ok({ kind: ValueKind.Number, value: expr.value });
    case ExprType.Boolean:
      return Ok({ kind: ValueKind.Boolean, value: expr.value });
    case ExprType.String:
      return Ok({ kind: ValueKind.String, value: expr.value });
    case ExprType.Identifier:
      return Ok(env.get(expr.name)!.value);
    case ExprType.Unary:
      return andThen(evalExpr(expr.operand, env), (v) =>
        andThen(toNumber(v, expr.position), (n) => Ok({ kind: ValueKind.Number, value: -n })),
      );
    case ExprType.Ref: {
      const name = expr.operand.type === ExprType.Identifier ? expr.operand.name : "";
      return Ok({ kind: ValueKind.Ref, target: name, mutable: expr.mutable });
    }
    case ExprType.Deref:
      return evalDeref(expr, env);
    case ExprType.Binary:
      return evalBinary(expr, env);
    case ExprType.Array: {
      const elements: Value[] = [];
      for (const el of expr.elements) {
        const v = evalExpr(el, env);
        if (!v.ok) return v;
        elements.push(v.value);
      }
      return Ok({ kind: ValueKind.Array, elements });
    }
    case ExprType.Index: {
      // The static pass validates the array and index kinds; only the
      // out-of-range check is genuinely dynamic.
      const arr = evalExpr(expr.array, env);
      if (!arr.ok) return arr;
      const idx = evalExpr(expr.index, env);
      if (!idx.ok) return idx;
      const n = (idx.value as NumberValue).value;
      const elements = (arr.value as ArrayValue).elements;
      if (!Number.isInteger(n) || n < 0 || n >= elements.length) {
        return Err(
          err(
            ErrorKind.Runtime,
            `Index ${n} out of range for array of length ${elements.length}`,
            expr.index.position,
          ),
        );
      }
      return Ok(elements[n]!);
    }
    case ExprType.Call: {
      // The static pass validates the callee, arity, and argument types.
      const fn = env.get(expr.callee);
      if (!fn || fn.value.kind !== ValueKind.Fn) {
        return Err(err(ErrorKind.Semantic, `"${expr.callee}" is not a function`, expr.position));
      }
      const fnValue = fn.value as FnValue;
      const callEnv = new Map<string, Binding>();
      for (let i = 0; i < fnValue.params.length; i++) {
        const arg = evalExpr(expr.args[i]!, env);
        if (!arg.ok) return arg;
        callEnv.set(fnValue.params[i]!.name, { value: arg.value, mutable: false });
      }
      const body = evalStatements(fnValue.body, callEnv);
      if (!body.ok) return body;
      return Ok({ kind: ValueKind.Number, value: body.value ?? 0 });
    }
    case ExprType.Struct:
      return evalStruct(expr, env);
    case ExprType.Field:
      return evalField(expr, env);
  }
}

function evalBinary(expr: BinaryExpr, env: Map<string, Binding>): Result<Value, EvalError> {
  const l = evalExpr(expr.left, env);
  if (!l.ok) return l;
  const r = evalExpr(expr.right, env);
  if (!r.ok) return r;
  // The static pass validates operand kinds.
  const ln = toNumber(l.value, expr.position);
  if (!ln.ok) return ln;
  const rn = toNumber(r.value, expr.position);
  if (!rn.ok) return rn;
  if ((expr.op === "/" || expr.op === "%") && rn.value === 0) {
    return Err(err(ErrorKind.Runtime, "Division by zero", expr.right.position));
  }
  if (expr.op === "<") {
    return Ok({ kind: ValueKind.Boolean, value: ln.value < rn.value });
  }
  switch (expr.op) {
    case "+":
      return Ok({ kind: ValueKind.Number, value: ln.value + rn.value });
    case "-":
      return Ok({ kind: ValueKind.Number, value: ln.value - rn.value });
    case "*":
      return Ok({ kind: ValueKind.Number, value: ln.value * rn.value });
    case "/":
      return Ok({ kind: ValueKind.Number, value: Math.trunc(ln.value / rn.value) });
    case "%":
      return Ok({ kind: ValueKind.Number, value: ln.value % rn.value });
    default:
      return Err(err(ErrorKind.Runtime, `Unknown operator "${expr.op}"`, expr.position));
  }
}

function evalStruct(expr: StructExpr, env: Map<string, Binding>): Result<Value, EvalError> {
  // The static pass validates the struct name, field names, and types.
  const decl = env.get(expr.structName);
  if (!decl || decl.value.kind !== ValueKind.Struct) {
    return Err(err(ErrorKind.Semantic, `Undefined struct "${expr.structName}"`, expr.position));
  }
  const values: Value[] = [];
  for (const init of expr.fields) {
    const v = evalExpr(init.value, env);
    if (!v.ok) return v;
    values.push(v.value);
  }
  return Ok({
    kind: ValueKind.Struct,
    structName: expr.structName,
    fields: (decl.value as StructValue).fields,
    values,
  });
}

function evalField(expr: FieldExpr, env: Map<string, Binding>): Result<Value, EvalError> {
  // The static pass validates the object kind and field existence.
  const obj = evalExpr(expr.object, env);
  if (!obj.ok) return obj;
  if (obj.value.kind === ValueKind.String) {
    // The static pass guarantees the only valid string field is "length".
    return Ok({ kind: ValueKind.Number, value: obj.value.value.length });
  }
  if (obj.value.kind !== ValueKind.Struct) {
    return Err(
      err(ErrorKind.Semantic, "Cannot access a field of a non-struct value", expr.position),
    );
  }
  const structValue = obj.value as StructValue;
  const idx = structValue.fields.findIndex((f) => f.name === expr.field);
  const value = structValue.values[idx];
  if (value === undefined) {
    return Err(
      err(
        ErrorKind.Semantic,
        `Struct "${structValue.structName}" has no field "${expr.field}"`,
        expr.position,
      ),
    );
  }
  return Ok(value);
}
