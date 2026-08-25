import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Expr, Statement } from "./parser.ts";

type ValueType = "number" | "boolean";

function literalType(value: number | boolean): ValueType {
  return typeof value === "boolean" ? "boolean" : "number";
}

function exprType(
  expr: Expr,
  env: Map<string, ValueType>,
): ValueType | undefined {
  if ("literal" in expr) return literalType(expr.literal);
  if ("identifier" in expr) return env.get(expr.identifier);
  return "boolean";
}

function checkStatements(
  statements: Statement[],
  env: Map<string, ValueType>,
): Result<unknown> {
  for (const item of statements) {
    if ("declaration" in item) {
      const type = exprType(item.declaration.expr, env);
      if (type) env.set(item.declaration.name, type);
    } else if ("assignment" in item) {
      if (item.assignment.op === "=") {
        const known = env.get(item.assignment.name);
        const found = exprType(item.assignment.expr, env);
        if (known && found && known !== found)
          return fail({
            kind: "TypeMismatch",
            name: item.assignment.name,
            expected: known,
            found,
            position: item.assignment.position,
          });
      }
    } else if ("block" in item) {
      const result = checkStatements(item.block, env);
      if (!result.ok) return result;
    } else if ("if" in item) {
      const then = checkStatements(item.if.thenBlock, env);
      if (!then.ok) return then;
      if (item.if.elseBlock) {
        const els = checkStatements(item.if.elseBlock, env);
        if (!els.ok) return els;
      }
    } else if ("while" in item) {
      const result = checkStatements(item.while.body, env);
      if (!result.ok) return result;
    }
  }
  return { ok: true, value: undefined };
}

export function typecheck(statements: Statement[]): Result<unknown> {
  return checkStatements(statements, new Map());
}
