import type { Statement } from "./ast";
import type { CompileResult } from "./errors";
import { isCompileError } from "./errors";
import {
  parseStatement,
  splitStatements,
  findUnbalancedParen,
  extractExpression,
} from "./parser";
import { checkMutability, buildRefMap } from "./typecheck";
import { emitStatement } from "./emit";

export function compileTuffToTypeScript(tuffSource: string): CompileResult {
  const expr = extractExpression(tuffSource);
  if (expr === "") {
    return { ok: true, value: "process.exit(0);" };
  }

  const { statements, finalExpr } = splitStatements(expr);

  const unbalanced = findUnbalancedParen(finalExpr);
  if (unbalanced) {
    return {
      ok: false,
      error: {
        kind: "parse",
        location: unbalanced,
        message: "Unbalanced parentheses",
      },
    };
  }

  const parsedStatements: Statement[] = [];
  for (const s of statements) {
    const result = parseStatement(s);
    if (isCompileError(result)) return { ok: false, error: result };
    parsedStatements.push(result);
  }
  const parsedFinalResult = parseStatement(finalExpr);
  if (isCompileError(parsedFinalResult))
    return { ok: false, error: parsedFinalResult };
  const parsedFinal = parsedFinalResult;

  const typeError = checkMutability(parsedStatements, parsedFinal);
  if (typeError) {
    return { ok: false, error: typeError };
  }

  const refMap = buildRefMap(parsedStatements);
  const lines = parsedStatements.map((s) => `${emitStatement(s, refMap)};`);
  lines.push(`process.exit(${emitStatement(parsedFinal, refMap)});`);
  return { ok: true, value: lines.join("\n") };
}
