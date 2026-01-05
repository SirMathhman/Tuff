import { ExpressionStmt, LiteralExpr, Program } from "../ast/ast.js";
import { DiagnosticReporter } from "../common/diagnostics.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";

export function compileSource(
  source: string,
  sourceFile: string,
  reporter: DiagnosticReporter
): Program {
  const lexer = new Lexer(source, sourceFile, reporter);
  const tokens = lexer.scanTokens();
  const parser = new Parser(tokens, sourceFile, reporter);
  return parser.parse();
}

/**
 * Stage-0 behavior (spec): the last expression in the top-level scope determines the process exit code.
 *
 * For now, we only return a non-zero exit code when the final top-level statement is a numeric literal.
 */
export function computeExitCode(program: Program): number {
  const last = program.statements[program.statements.length - 1];
  if (!last || last.kind !== "ExpressionStmt") return 0;

  const exprStmt = last as ExpressionStmt;
  const expr = exprStmt.expression;

  if (expr.kind !== "LiteralExpr") return 0;

  const lit = expr as LiteralExpr;
  if (typeof lit.value !== "number") return 0;

  // Node expects exit codes in [0, 255].
  const n = Math.trunc(lit.value);
  return ((n % 256) + 256) % 256;
}
