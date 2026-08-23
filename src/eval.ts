import type { EvalError, Position } from "./errors.ts";
import type { Expr, Program, Statement } from "./parser.ts";
import { Err, Ok, andThen } from "./result.ts";
import type { Result } from "./result.ts";

type Value =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "ref"; readonly target: string; readonly mutable: boolean }
  | { readonly kind: "array"; readonly elements: readonly Value[] };

interface Binding {
  value: Value;
  mutable: boolean;
}

function err(kind: EvalError["kind"], message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

export function evaluateProgram(program: Program): Result<number, EvalError> {
  const staticResult = checkMutability(program.statements, new Map());
  if (!staticResult.ok) return staticResult;
  const env = new Map<string, Binding>();
  const result = evalStatements(program.statements, env);
  if (!result.ok) return result;
  return Ok(result.value ?? 0);
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
      env.set(stmt.name, {
        value: value.value ?? { kind: "number", value: 0 },
        mutable: stmt.mutable,
      });
    } else if (stmt.type === "assign") {
      const target = resolveTarget(stmt.target, (name) => env.get(name));
      if (!target.ok) return target;
      if (!target.value.binding.mutable) {
        return Err(
          err(
            "mutability",
            `Cannot reassign immutable binding "${target.value.name}"`,
            stmt.position,
          ),
        );
      }
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
      if (binding && binding.value.kind !== "ref") {
        return Err(err("semantic", `"${expr.operand.name}" is not a reference`, expr.position));
      }
      return Ok(null);
    }
  }
}

function inferValue(expr: Expr, env: Map<string, Binding>): Result<Value | null, EvalError> {
  const validation = validateExpr(expr, env);
  if (!validation.ok) return validation;
  switch (expr.type) {
    case "number":
      return Ok({ kind: "number", value: 0 });
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
  }
}

function resolveRefChain(
  name: string,
  get: (name: string) => Binding | undefined,
): { name: string; binding: Binding } | null {
  const visited = new Set<string>();
  let currentName = name;
  let current = get(currentName);
  while (current && current.value.kind === "ref") {
    currentName = current.value.target;
    if (visited.has(currentName)) return null;
    visited.add(currentName);
    const next = get(currentName);
    if (!next) return null;
    current = next;
  }
  return current ? { name: currentName, binding: current } : null;
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
    const resolved = resolveRefChain(target.operand.name, get);
    if (!resolved) {
      return Err(
        err("runtime", `Reference target "${target.operand.name}" is undefined`, target.position),
      );
    }
    return Ok(resolved);
  }
  return Err(err("semantic", "Invalid assignment target", target.position));
}

function evalStatements(
  statements: readonly Statement[],
  env: Map<string, Binding>,
): Result<number | null, EvalError> {
  const shadowed = new Map<string, Binding | null>();
  for (const stmt of statements) {
    if (stmt.type === "let") {
      const value = evalExpr(stmt.value, env);
      if (!value.ok) return value;
      if (!shadowed.has(stmt.name)) {
        shadowed.set(stmt.name, env.get(stmt.name) ?? null);
      }
      env.set(stmt.name, { value: value.value, mutable: stmt.mutable });
    } else if (stmt.type === "assign") {
      // The static pass already validated the target and its mutability.
      const name = assignTargetName(stmt.target, (n) => env.get(n));
      const value = evalExpr(stmt.value, env);
      if (!value.ok) return value;
      const live = env.get(name);
      if (live) live.value = value.value;
    } else if (stmt.type === "block") {
      const inner = evalStatements(stmt.statements, env);
      if (!inner.ok) return inner;
      if (inner.value !== null) return inner;
    } else if (stmt.type === "if") {
      // The static pass already checked the condition is a boolean.
      const cond = evalExpr(stmt.condition, env);
      if (!cond.ok) return cond;
      const branch = cond.value.kind === "boolean" && cond.value.value ? stmt.then : stmt.else;
      if (branch) {
        const inner = evalStatements(branch, env);
        if (!inner.ok) return inner;
        if (inner.value !== null) return inner;
      }
    } else if (stmt.type === "return") {
      return andThen(evalExpr(stmt.value, env), (v) => toNumber(v, stmt.position));
    } else if (stmt.type === "while") {
      // The static pass already checked the condition is a boolean.
      for (;;) {
        const cond = evalExpr(stmt.condition, env);
        if (!cond.ok) return cond;
        if (!(cond.value.kind === "boolean" && cond.value.value)) break;
        const inner = evalStatements(stmt.body, env);
        if (!inner.ok) return inner;
        if (inner.value !== null) return inner;
      }
    } else {
      const unhandled: never = stmt;
      return Err(err("semantic", `Unhandled statement type`, (unhandled as Statement).position));
    }
  }
  restoreShadowed(env, shadowed);
  return Ok(null);
}

function assignTargetName(target: Expr, get: (name: string) => Binding | undefined): string {
  if (target.type === "identifier") return target.name;
  if (target.type === "deref" && target.operand.type === "identifier") {
    // The static pass guarantees a bound, mutable reference chain.
    return resolveRefChain(target.operand.name, get)!.name;
  }
  return "";
}

function toNumber(value: Value, position: Position): Result<number, EvalError> {
  if (value.kind === "number") return Ok(value.value);
  if (value.kind === "boolean") return Ok(value.value ? 1 : 0);
  if (value.kind === "ref") {
    return Err(
      err("semantic", `Expected a number but found a reference to "${value.target}"`, position),
    );
  }
  return Err(err("semantic", "Expected a number but found an array", position));
}

function evalExpr(expr: Expr, env: Map<string, Binding>): Result<Value, EvalError> {
  // Semantic checks (operand shape, binding existence, reference kinds) are
  // performed by the static pass; this pass only computes values.
  switch (expr.type) {
    case "number":
      return Ok({ kind: "number", value: expr.value });
    case "boolean":
      return Ok({ kind: "boolean", value: expr.value });
    case "identifier":
      return Ok(env.get(expr.name)!.value);
    case "unary":
      return andThen(evalExpr(expr.operand, env), (v) =>
        andThen(toNumber(v, expr.position), (n) => Ok({ kind: "number", value: -n })),
      );
    case "ref": {
      const name = expr.operand.type === "identifier" ? expr.operand.name : "";
      return Ok({ kind: "ref", target: name, mutable: expr.mutable });
    }
    case "deref": {
      const name = expr.operand.type === "identifier" ? expr.operand.name : "";
      return Ok(resolveRefChain(name, (n) => env.get(n))!.binding.value);
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
    case "array": {
      const elements: Value[] = [];
      for (const el of expr.elements) {
        const v = evalExpr(el, env);
        if (!v.ok) return v;
        elements.push(v.value);
      }
      return Ok({ kind: "array", elements });
    }
  }
}
