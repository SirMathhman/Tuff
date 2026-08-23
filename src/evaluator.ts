import { TuffError } from "./errors.ts";
import type { Position } from "./errors.ts";
import type { Expr, Program } from "./parser.ts";

type Value =
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "ref"; readonly target: string };

interface Binding {
  value: Value;
  mutable: boolean;
}

export function evaluateProgram(program: Program): number {
  const env = new Map<string, Binding>();
  for (const stmt of program.statements) {
    if (stmt.type === "let") {
      if (env.has(stmt.name)) {
        throw new TuffError("syntax", `Duplicate binding "${stmt.name}"`, stmt.position);
      }
      env.set(stmt.name, { value: evalExpr(stmt.value, env), mutable: stmt.mutable });
    } else if (stmt.type === "assign") {
      const binding = env.get(stmt.name);
      if (!binding) {
        throw new TuffError("runtime", `Undefined variable "${stmt.name}"`, stmt.position);
      }
      if (!binding.mutable) {
        throw new TuffError(
          "mutability",
          `Cannot reassign immutable binding "${stmt.name}"`,
          stmt.position,
        );
      }
      binding.value = evalExpr(stmt.value, env);
    } else {
      return toNumber(evalExpr(stmt.value, env), stmt.position);
    }
  }
  throw new TuffError("runtime", "Program does not end with a return statement", {
    line: 1,
    column: 1,
  });
}

function toNumber(value: Value, position: Position): number {
  if (value.kind === "number") return value.value;
  throw new TuffError(
    "runtime",
    `Expected a number but found a reference to "${value.target}"`,
    position,
  );
}

function evalExpr(expr: Expr, env: Map<string, Binding>): Value {
  switch (expr.type) {
    case "number":
      return { kind: "number", value: expr.value };
    case "identifier": {
      const binding = env.get(expr.name);
      if (!binding) {
        throw new TuffError("runtime", `Undefined variable "${expr.name}"`, expr.position);
      }
      return binding.value;
    }
    case "unary":
      return { kind: "number", value: -toNumber(evalExpr(expr.operand, env), expr.position) };
    case "ref": {
      if (expr.operand.type !== "identifier") {
        throw new TuffError("syntax", "Can only take a reference to a variable", expr.position);
      }
      const target = env.get(expr.operand.name);
      if (!target) {
        throw new TuffError("runtime", `Undefined variable "${expr.operand.name}"`, expr.position);
      }
      return { kind: "ref", target: expr.operand.name };
    }
    case "deref": {
      if (expr.operand.type !== "identifier") {
        throw new TuffError("syntax", "Can only dereference a variable", expr.position);
      }
      const binding = env.get(expr.operand.name);
      if (!binding) {
        throw new TuffError("runtime", `Undefined variable "${expr.operand.name}"`, expr.position);
      }
      if (binding.value.kind !== "ref") {
        throw new TuffError("runtime", `"${expr.operand.name}" is not a reference`, expr.position);
      }
      const target = env.get(binding.value.target);
      if (!target) {
        throw new TuffError(
          "runtime",
          `Reference target "${binding.value.target}" is undefined`,
          expr.position,
        );
      }
      return target.value;
    }
    case "binary": {
      const l = toNumber(evalExpr(expr.left, env), expr.position);
      const r = toNumber(evalExpr(expr.right, env), expr.position);
      switch (expr.op) {
        case "+":
          return { kind: "number", value: l + r };
        case "-":
          return { kind: "number", value: l - r };
        case "*":
          return { kind: "number", value: l * r };
        case "/":
          return { kind: "number", value: l / r };
        case "%":
          return { kind: "number", value: l % r };
        default:
          throw new TuffError("runtime", `Unknown operator "${expr.op}"`, expr.position);
      }
    }
  }
}
