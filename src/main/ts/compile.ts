import { tokenize } from "./tokenize";
import type { Token, Result, CompileError, Statement } from "./types";
import { parseStatement } from "./parse-statements";
import type { ParseContext } from "./parse-expressions";

function parse(tokens: Token[]): Result<Statement[], CompileError> {
  const ctx: ParseContext = { tokens, pos: 0 };
  const statements: Statement[] = [];
  while (!isEof(ctx)) {
    const stmt = parseStatement(ctx);
    if (!stmt.isOk) return stmt;
    statements.push(stmt.value);
  }
  return { isOk: true, value: statements };
}

function isEof(ctx: ParseContext): boolean {
  return ctx.pos >= ctx.tokens.length;
}

import { analyzeSemantics } from "./semantic";
import { generateCode } from "./generate";

export function compileTuffToTS(
  tuffSource: string,
): Result<string, CompileError> {
  if (tuffSource.length === 0) return { isOk: true, value: "process.exit(0)" };
  const tokensResult = tokenize(tuffSource);
  if (!tokensResult.isOk) return tokensResult;
  const statementsResult = parse(tokensResult.value);
  if (!statementsResult.isOk) return statementsResult;
  const semanticResult = analyzeSemantics(statementsResult.value);
  if (!semanticResult.isOk) return semanticResult;
  const code = generateCode(semanticResult.value);
  return { isOk: true, value: code };
}
