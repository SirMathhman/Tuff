import type { EvalError, Position } from "./errors.ts";
import type { Expr, Program, Statement } from "./parser.ts";
import { Err, Ok, andThen } from "./result.ts";
import type { Result } from "./result.ts";
import type { Binding, Value } from "./value.ts";
import { resolveRefChain } from "./value.ts";

function err(kind: EvalError["kind"], message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

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
      if (l.value.kind !== "number" || r.value.kind !== "number") {
        const bad = l.value.kind !== "number" ? expr.left : expr.right;
        return Err(err("semantic", "Arithmetic operands must be numbers", bad.position));
      }
      const ln = toNumber(l.value, expr.position);
      if (!ln.ok) return ln;
      const rn = toNumber(r.value, expr.position);
      if (!rn.ok) return rn;
      if ((expr.op === "/" || expr.op === "%") && rn.value === 0) {
        return Err(err("runtime", "Division by zero", expr.right.position));
      }
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
          return Ok({ kind: "number", value: Math.trunc(ln.value / rn.value) });
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
    case "index": {
      // The static pass guarantees an array value and a number index.
      const arr = evalExpr(expr.array, env);
      if (!arr.ok) return arr;
      const idx = evalExpr(expr.index, env);
      if (!idx.ok) return idx;
      const n = idx.value.kind === "number" ? idx.value.value : 0;
      const elements = arr.value.kind === "array" ? arr.value.elements : [];
      if (!Number.isInteger(n) || n < 0 || n >= elements.length) {
        return Err(
          err(
            "runtime",
            `Index ${n} out of range for array of length ${elements.length}`,
            expr.index.position,
          ),
        );
      }
      return Ok(elements[n]!);
    }
  }
}
