import type { Expr, Stmt } from "./ast";
import { OPERATORS } from "./operators";
import { Env } from "./env";
import type { Value } from "./value";
import { toNumber } from "./value";
import { TypeError } from "./errors";

const CONTINUE: unique symbol = Symbol("continue");

type EvalResult = Value | typeof CONTINUE;

function evalCondition(expr: Expr, env: Env): boolean {
  const value = evalExpr(expr, env);
  if (value.type !== "boolean") {
    throw new TypeError("Condition must be a boolean");
  }
  return value.value;
}

function evalOptional(expr: Expr | null, env: Env, fallback: Value): Value {
  return expr ? evalExpr(expr, env) : fallback;
}

function evalExpr(expr: Expr, env: Env): Value {
  switch (expr.kind) {
    case "number":
      return { type: "number", value: expr.value };
    case "boolean":
      return { type: "boolean", value: expr.value };
    case "variable": {
      return env.get(expr.name);
    }
    case "block": {
      const blockEnv = env.child();
      let result: Value = { type: "number", value: 0 };
      for (const statement of expr.statements) {
        result = evalStmt(statement, blockEnv) as Value;
      }
      return result;
    }
    case "binary": {
      const left = evalExpr(expr.left, env);
      const right = evalExpr(expr.right, env);
      return OPERATORS[expr.op].evaluate(left, right);
    }
    case "if": {
      return evalCondition(expr.condition, env)
        ? evalExpr(expr.then, env)
        : evalOptional(expr.otherwise, env, { type: "number", value: 0 });
    }
  }
}

function evalStmt(stmt: Stmt, env: Env): EvalResult {
  switch (stmt.kind) {
    case "let": {
      const value = evalExpr(stmt.value, env);
      env.define(stmt.name, value, stmt.mutable);
      return value;
    }
    case "assign": {
      const value = evalExpr(stmt.value, env);
      env.assign(stmt.name, value);
      return value;
    }
    case "compound_assign": {
      const current = env.get(stmt.name);
      const right = evalExpr(stmt.value, env);
      const result = OPERATORS[stmt.op].evaluate(current, right);
      env.assign(stmt.name, result);
      return result;
    }
    case "while": {
      let result: Value = { type: "number", value: 0 };
      while (evalCondition(stmt.condition, env)) {
        const r = evalStmt(stmt.body, env);
        if (r === CONTINUE) {
          continue;
        }
        result = r;
      }
      return result;
    }
    case "continue": {
      return CONTINUE;
    }
    case "expr": {
      return evalExpr(stmt.expr, env);
    }
    case "block": {
      const blockEnv = env.child();
      let result: Value = { type: "number", value: 0 };
      for (const statement of stmt.statements) {
        const r = evalStmt(statement, blockEnv);
        if (r === CONTINUE) {
          return CONTINUE;
        }
        result = r;
      }
      return result;
    }
  }
}

export function evalAst(stmt: Stmt, env: Env): number {
  return toNumber(evalStmt(stmt, env) as Value);
}
