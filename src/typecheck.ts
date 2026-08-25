import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Expr, Statement } from "./parser.ts";

type ValueType = "number" | "boolean";

function literalType(value: number | boolean): ValueType {
  return typeof value === "boolean" ? "boolean" : "number";
}

function checkExpr(expr: Expr, env: Map<string, ValueType>): Result<void> {
  if ("literal" in expr) return { ok: true, value: undefined };
  if ("identifier" in expr) {
    if (!env.has(expr.identifier))
      return fail({
        kind: "UndeclaredVariable",
        name: expr.identifier,
        position: expr.position,
      });
    return { ok: true, value: undefined };
  }
  const left = checkExpr(expr.binary.left, env);
  if (!left.ok) return left;
  return checkExpr(expr.binary.right, env);
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
      const expr = checkExpr(item.declaration.expr, env);
      if (!expr.ok) return expr;
      const type = exprType(item.declaration.expr, env);
      if (type) env.set(item.declaration.name, type);
    } else if ("assignment" in item) {
      if (!env.has(item.assignment.name))
        return fail({
          kind: "UndeclaredVariable",
          name: item.assignment.name,
          position: item.assignment.position,
        });
      const expr = checkExpr(item.assignment.expr, env);
      if (!expr.ok) return expr;
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
    } else if ("return" in item) {
      const expr = checkExpr(item.return.expr, env);
      if (!expr.ok) return expr;
    } else if ("block" in item) {
      const result = checkStatements(item.block, env);
      if (!result.ok) return result;
    } else if ("if" in item) {
      const condition = checkExpr(item.if.condition, env);
      if (!condition.ok) return condition;
      const then = checkStatements(item.if.thenBlock, env);
      if (!then.ok) return then;
      if (item.if.elseBlock) {
        const els = checkStatements(item.if.elseBlock, env);
        if (!els.ok) return els;
      }
    } else if ("while" in item) {
      const condition = checkExpr(item.while.condition, env);
      if (!condition.ok) return condition;
      const result = checkStatements(item.while.body, env);
      if (!result.ok) return result;
    }
  }
  return { ok: true, value: undefined };
}

export function typecheck(statements: Statement[]): Result<unknown> {
  return checkStatements(statements, new Map());
}
