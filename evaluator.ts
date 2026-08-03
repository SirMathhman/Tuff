import type { Expr, Stmt } from "./ast";
import { OPERATORS } from "./operators";
import { Env } from "./env";
import type { Value } from "./value";
import { toNumber } from "./value";
import { TypeError } from "./errors";

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
        result = evalStmt(statement, blockEnv);
      }
      return result;
    }
    case "binary": {
      const left = evalExpr(expr.left, env);
      const right = evalExpr(expr.right, env);
      return OPERATORS[expr.op].evaluate(left, right);
    }
    case "if": {
      const condition = evalExpr(expr.condition, env);
      if (condition.type !== "boolean") {
        throw new TypeError("If condition must be a boolean");
      }
      return condition.value ? evalExpr(expr.then, env) : evalExpr(expr.otherwise, env);
    }
  }
}

function evalStmt(stmt: Stmt, env: Env): Value {
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
    case "expr": {
      return evalExpr(stmt.expr, env);
    }
    case "block": {
      const blockEnv = env.child();
      let result: Value = { type: "number", value: 0 };
      for (const statement of stmt.statements) {
        result = evalStmt(statement, blockEnv);
      }
      return result;
    }
  }
}

export function evalAst(stmt: Stmt, env: Env): number {
  return toNumber(evalStmt(stmt, env));
}
