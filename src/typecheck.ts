import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Expr, Statement } from "./parser/index.ts";

type ValueType = "number" | "boolean";

type Binding = { type: ValueType; mutable: boolean };

type Env = Map<string, Binding>;

function literalType(value: number | boolean): ValueType {
  return typeof value === "boolean" ? "boolean" : "number";
}

function checkExpr(expr: Expr, env: Env): Result<void> {
  if ("literal" in expr) return { ok: true, value: undefined };
  if ("grouped" in expr) return checkExpr(expr.grouped, env);
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

function exprType(expr: Expr, env: Env): ValueType | undefined {
  if ("literal" in expr) return literalType(expr.literal);
  if ("grouped" in expr) return exprType(expr.grouped, env);
  if ("identifier" in expr) return env.get(expr.identifier)?.type;
  return expr.binary.op === "+" ||
    expr.binary.op === "-" ||
    expr.binary.op === "*"
    ? "number"
    : "boolean";
}

function checkStatements(statements: Statement[], env: Env): Result<unknown> {
  for (const item of statements) {
    if ("declaration" in item) {
      const expr = checkExpr(item.declaration.expr, env);
      if (!expr.ok) return expr;
      const type = exprType(item.declaration.expr, env);
      if (type)
        env.set(item.declaration.name, {
          type,
          mutable: item.declaration.mutable,
        });
    } else if ("assignment" in item) {
      const binding = env.get(item.assignment.name);
      if (!binding)
        return fail({
          kind: "UndeclaredVariable",
          name: item.assignment.name,
          position: item.assignment.position,
        });
      if (!binding.mutable)
        return fail({
          kind: "ImmutableReassignment",
          name: item.assignment.name,
          position: item.assignment.position,
        });
      const expr = checkExpr(item.assignment.expr, env);
      if (!expr.ok) return expr;
      const found = exprType(item.assignment.expr, env);
      if (item.assignment.op === "=") {
        if (binding.type !== found)
          return fail({
            kind: "TypeMismatch",
            name: item.assignment.name,
            expected: binding.type,
            found: found!,
            position: item.assignment.position,
          });
      } else {
        if (binding.type !== "number" || found !== "number")
          return fail({
            kind: "TypeMismatch",
            name: item.assignment.name,
            expected: "number",
            found: found ?? binding.type,
            position: item.assignment.position,
          });
      }
    } else if ("return" in item) {
      const expr = checkExpr(item.return.expr, env);
      if (!expr.ok) return expr;
    } else if ("block" in item) {
      const result = checkStatements(item.block, new Map(env));
      if (!result.ok) return result;
    } else if ("if" in item) {
      const condition = checkExpr(item.if.condition, env);
      if (!condition.ok) return condition;
      const then = checkStatements(item.if.thenBlock, new Map(env));
      if (!then.ok) return then;
      if (item.if.elseBlock) {
        const els = checkStatements(item.if.elseBlock, new Map(env));
        if (!els.ok) return els;
      }
    } else if ("while" in item) {
      const condition = checkExpr(item.while.condition, env);
      if (!condition.ok) return condition;
      const result = checkStatements(item.while.body, new Map(env));
      if (!result.ok) return result;
    } else if ("match" in item) {
      const scrutinee = checkExpr(item.match.scrutinee, env);
      if (!scrutinee.ok) return scrutinee;
      for (const matchCase of item.match.cases) {
        const result = checkStatements(matchCase.block, new Map(env));
        if (!result.ok) return result;
      }
    }
  }
  return { ok: true, value: undefined };
}

export function typecheck(statements: Statement[]): Result<unknown> {
  return checkStatements(statements, new Map<string, Binding>());
}
