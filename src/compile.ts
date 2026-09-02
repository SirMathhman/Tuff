import type { Statement } from "./ast";
import type { CompileResult } from "./errors";
import { isCompileError } from "./errors";
import { parseProgram, extractExpression } from "./parser";
import { tokenize } from "./lexer";
import { checkMutability, buildRefMap } from "./typecheck";
import { emitStatement } from "./emit";

export function compileTuffToTypeScript(tuffSource: string): CompileResult {
  const expr = extractExpression(tuffSource);
  if (expr === "") {
    return { ok: true, value: "process.exit(0);" };
  }

  const tokens = tokenize(expr);
  const program = parseProgram(tokens);
  if (isCompileError(program)) {
    return { ok: false, error: program };
  }

  const { statements, finalExpr } = program;

  const typeError = checkMutability(statements, finalExpr);
  if (typeError) {
    return { ok: false, error: typeError };
  }

  const refMap = buildRefMap(statements);
  const lines = statements.map((s) => `${emitStatement(s, refMap)};`);
  lines.push(`process.exit(${emitStatement(finalExpr, refMap)});`);
  return { ok: true, value: lines.join("\n") };
}
