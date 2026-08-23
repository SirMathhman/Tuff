import { TuffError } from "./errors.ts";
import type { Expr, Program } from "./parser.ts";

interface Binding {
  value: number;
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
      return evalExpr(stmt.value, env);
    }
  }
  throw new TuffError("runtime", "Program does not end with a return statement", {
    line: 1,
    column: 1,
  });
}

function evalExpr(expr: Expr, env: Map<string, Binding>): number {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "identifier": {
      const binding = env.get(expr.name);
      if (!binding) {
        throw new TuffError("runtime", `Undefined variable "${expr.name}"`, expr.position);
      }
      return binding.value;
    }
    case "unary":
      return -evalExpr(expr.operand, env);
    case "binary": {
      const l = evalExpr(expr.left, env);
      const r = evalExpr(expr.right, env);
      switch (expr.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return l / r;
        case "%":
          return l % r;
        default:
          throw new TuffError("runtime", `Unknown operator "${expr.op}"`, expr.position);
      }
    }
  }
}
