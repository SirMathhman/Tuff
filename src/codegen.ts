import type { Expr, Program, Stmt } from "./parser.ts";

function compileExpr(expr: Expr): string {
  switch (expr.kind) {
    case "Identifier":
      return expr.name;
    case "NumberLiteral":
      return String(expr.value);
    case "StringLiteral":
      return JSON.stringify(expr.value);
    case "Unary":
      return `${expr.operator}${compileExpr(expr.operand)}`;
    case "MemberAccess":
      return `${compileExpr(expr.object)}.${expr.property}`;
  }
}

function compileStmt(stmt: Stmt): string {
  switch (stmt.kind) {
    case "VariableDecl":
      return `let ${stmt.name} = ${compileExpr(stmt.value)};`;
    case "ExprStmt":
      return `${compileExpr(stmt.expr)};`;
  }
}

export function codegen(program: Program): string {
  const lines = program.body.map(compileStmt);

  // A program's result (the last body statement, if it's an expression)
  // becomes its exit code.
  const result = program.body[program.body.length - 1];
  if (result?.kind === "ExprStmt") {
    lines.push(`process.exit(${compileExpr(result.expr)});`);
  }

  return lines.join("\n");
}
