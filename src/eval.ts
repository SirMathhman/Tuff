import type { EvalError, Position } from "./errors.ts";
import type { Expr, Program, Statement } from "./parser.ts";
import { Err, Ok, andThen } from "./result.ts";
import type { Result } from "./result.ts";

type Value =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "ref"; readonly target: string; readonly mutable: boolean };

interface Binding {
  value: Value;
  mutable: boolean;
}

function err(kind: EvalError["kind"], message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

export function evaluateProgram(program: Program): Result<number, EvalError> {
  const env = new Map<string, Binding>();
  const result = evalStatements(program.statements, env);
  if (!result.ok) return result;
  return Ok(result.value ?? 0);
}

function evalStatements(
  statements: readonly Statement[],
  env: Map<string, Binding>,
): Result<number | null, EvalError> {
  const declared: string[] = [];
  for (const stmt of statements) {
    if (stmt.type === "let") {
      if (env.has(stmt.name)) {
        return Err(err("semantic", `Duplicate binding "${stmt.name}"`, stmt.position));
      }
      const value = evalExpr(stmt.value, env);
      if (!value.ok) return value;
      env.set(stmt.name, { value: value.value, mutable: stmt.mutable });
      declared.push(stmt.name);
    } else if (stmt.type === "assign") {
      const target = resolveAssignTarget(stmt.target, env);
      if (!target.ok) return target;
      const { name, binding } = target.value;
      if (!binding.mutable) {
        return Err(err("mutability", `Cannot reassign immutable binding "${name}"`, stmt.position));
      }
      const value = evalExpr(stmt.value, env);
      if (!value.ok) return value;
      binding.value = value.value;
    } else if (stmt.type === "block") {
      const inner = evalStatements(stmt.statements, env);
      if (!inner.ok) return inner;
      if (inner.value !== null) return inner;
    } else if (stmt.type === "if") {
      const cond = evalExpr(stmt.condition, env);
      if (!cond.ok) return cond;
      if (cond.value.kind !== "boolean") {
        return Err(err("semantic", "if condition must be a boolean", stmt.position));
      }
      const branch = cond.value.value ? stmt.then : stmt.else;
      if (branch) {
        const inner = evalStatements(branch, env);
        if (!inner.ok) return inner;
        if (inner.value !== null) return inner;
      }
    } else {
      return andThen(evalExpr(stmt.value, env), (v) => toNumber(v, stmt.position));
    }
  }
  for (const name of declared) {
    env.delete(name);
  }
  return Ok(null);
}

interface NamedBinding {
  name: string;
  binding: Binding;
}

function resolveAssignTarget(
  target: Expr,
  env: Map<string, Binding>,
): Result<NamedBinding, EvalError> {
  if (target.type === "identifier") {
    const binding = env.get(target.name);
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
    const refBinding = env.get(target.operand.name);
    if (!refBinding) {
      return Err(err("runtime", `Undefined variable "${target.operand.name}"`, target.position));
    }
    if (refBinding.value.kind !== "ref") {
      return Err(err("semantic", `"${target.operand.name}" is not a reference`, target.position));
    }
    if (!refBinding.value.mutable) {
      return Err(
        err(
          "mutability",
          `Cannot assign through immutable reference "${target.operand.name}"`,
          target.position,
        ),
      );
    }
    const targetBinding = env.get(refBinding.value.target);
    if (!targetBinding) {
      return Err(
        err(
          "runtime",
          `Reference target "${refBinding.value.target}" is undefined`,
          target.position,
        ),
      );
    }
    return Ok({ name: refBinding.value.target, binding: targetBinding });
  }
  return Err(err("semantic", "Invalid assignment target", target.position));
}

function toNumber(value: Value, position: Position): Result<number, EvalError> {
  if (value.kind === "number") return Ok(value.value);
  if (value.kind === "boolean") return Ok(value.value ? 1 : 0);
  return Err(
    err("semantic", `Expected a number but found a reference to "${value.target}"`, position),
  );
}

function evalExpr(expr: Expr, env: Map<string, Binding>): Result<Value, EvalError> {
  switch (expr.type) {
    case "number":
      return Ok({ kind: "number", value: expr.value });
    case "boolean":
      return Ok({ kind: "boolean", value: expr.value });
    case "identifier": {
      const binding = env.get(expr.name);
      if (!binding) {
        return Err(err("runtime", `Undefined variable "${expr.name}"`, expr.position));
      }
      return Ok(binding.value);
    }
    case "unary":
      return andThen(evalExpr(expr.operand, env), (v) =>
        andThen(toNumber(v, expr.position), (n) => Ok({ kind: "number", value: -n })),
      );
    case "ref": {
      if (expr.operand.type !== "identifier") {
        return Err(err("semantic", "Can only take a reference to a variable", expr.position));
      }
      const target = env.get(expr.operand.name);
      if (!target) {
        return Err(err("runtime", `Undefined variable "${expr.operand.name}"`, expr.position));
      }
      return Ok({ kind: "ref", target: expr.operand.name, mutable: expr.mutable });
    }
    case "deref": {
      if (expr.operand.type !== "identifier") {
        return Err(err("semantic", "Can only dereference a variable", expr.position));
      }
      const binding = env.get(expr.operand.name);
      if (!binding) {
        return Err(err("runtime", `Undefined variable "${expr.operand.name}"`, expr.position));
      }
      if (binding.value.kind !== "ref") {
        return Err(err("semantic", `"${expr.operand.name}" is not a reference`, expr.position));
      }
      const target = env.get(binding.value.target);
      if (!target) {
        return Err(
          err("runtime", `Reference target "${binding.value.target}" is undefined`, expr.position),
        );
      }
      return Ok(target.value);
    }
    case "binary": {
      const l = evalExpr(expr.left, env);
      if (!l.ok) return l;
      const r = evalExpr(expr.right, env);
      if (!r.ok) return r;
      const ln = toNumber(l.value, expr.position);
      if (!ln.ok) return ln;
      const rn = toNumber(r.value, expr.position);
      if (!rn.ok) return rn;
      if (expr.op === "<") {
        return Ok({ kind: "boolean", value: ln.value < rn.value });
      }
      switch (expr.op) {
        case "+":
          return Ok({ kind: "number", value: ln.value + rn.value });
        case "-":
          return Ok({ kind: "number", value: ln.value - rn.value });
        case "*":
          return Ok({ kind: "number", value: ln.value * rn.value });
        case "/":
          return Ok({ kind: "number", value: ln.value / rn.value });
        case "%":
          return Ok({ kind: "number", value: ln.value % rn.value });
        default:
          return Err(err("runtime", `Unknown operator "${expr.op}"`, expr.position));
      }
    }
  }
}
