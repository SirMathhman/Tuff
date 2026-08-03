import type { Expr, Stmt } from "./ast";
import { Env } from "./env";

function evalExpr(expr: Expr, env: Env): number {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "boolean":
      return expr.value ? 1 : 0;
    case "variable": {
      return env.get(expr.name);
    }
    case "block": {
      const blockEnv = env.child();
      let result = 0;
      for (const statement of expr.statements) {
        result = evalStmt(statement, blockEnv);
      }
      return result;
    }
    case "binary": {
      const left = evalExpr(expr.left, env);
      const right = evalExpr(expr.right, env);

      switch (expr.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "||":
          return left || right ? 1 : 0;
      }
    }
  }
}

function evalStmt(stmt: Stmt, env: Env): number {
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
      let result = 0;
      for (const statement of stmt.statements) {
        result = evalStmt(statement, blockEnv);
      }
      return result;
    }
  }
}

export function evalAst(stmt: Stmt, env: Env): number {
  return evalStmt(stmt, env);
}
