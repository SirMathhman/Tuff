import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Token } from "./lexer.ts";

export type IfStatement = {
  condition: Token[];
  thenBlock: Statement[];
  elseBlock?: Statement[];
};

export type Statement =
  | { block: Statement[]; position: number }
  | { stmt: Token[]; position: number }
  | { if: IfStatement; position: number };

type ParsedStatements = { statements: Statement[]; next: number };

function parseStatements(
  tokens: Token[],
  start: number,
): Result<ParsedStatements> {
  const statements: Statement[] = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (token.value === "}") {
      return { ok: true, value: { statements, next: i + 1 } };
    }
    if (token.value === "{") {
      const inner = parseStatements(tokens, i + 1);
      if (!inner.ok) return inner;
      const { statements: innerStatements, next } = inner.value;
      if (tokens[next - 1]?.value !== "}")
        return fail({
          kind: "UnbalancedBrace",
          position: tokens[next - 1]?.position ?? token.position,
        });
      statements.push({ block: innerStatements, position: token.position });
      i = next;
      continue;
    }
    if (token.value === "if") {
      const parsed = parseIf(tokens, i);
      if (!parsed.ok) return parsed;
      const { ifStatement, next } = parsed.value;
      statements.push({ if: ifStatement, position: token.position });
      i = next;
      continue;
    }
    let j = i;
    while (j < tokens.length && tokens[j]!.value !== ";") j++;
    if (j >= tokens.length)
      return fail({ kind: "MissingTerminator", position: token.position });
    const stmtTokens = tokens.slice(i, j);
    if (stmtTokens.length === 0)
      return fail({ kind: "EmptyStatement", position: token.position });
    statements.push({ stmt: stmtTokens, position: token.position });
    i = j + 1;
  }
  return { ok: true, value: { statements, next: i } };
}

function parseIf(
  tokens: Token[],
  start: number,
): Result<{ ifStatement: IfStatement; next: number }> {
  const ifToken = tokens[start]!;
  if (tokens[start + 1]?.value !== "(")
    return fail({
      kind: "ExpectedToken",
      expected: "'('",
      found: tokens[start + 1]?.value,
      position: tokens[start + 1]?.position ?? ifToken.position,
    });
  let k = start + 2;
  let parenDepth = 1;
  while (k < tokens.length && parenDepth > 0) {
    if (tokens[k]!.value === "(") parenDepth++;
    else if (tokens[k]!.value === ")") parenDepth--;
    k++;
  }
  if (parenDepth !== 0)
    return fail({
      kind: "UnbalancedBrace",
      position: tokens[tokens.length - 1]?.position ?? ifToken.position,
    });
  const condition = tokens.slice(start + 2, k - 1);
  if (tokens[k]?.value !== "{")
    return fail({
      kind: "ExpectedToken",
      expected: "'{'",
      found: tokens[k]?.value,
      position: tokens[k]?.position ?? ifToken.position,
    });
  const thenResult = parseStatements(tokens, k + 1);
  if (!thenResult.ok) return thenResult;
  const { statements: thenBlock, next: afterThen } = thenResult.value;
  let elseBlock: Statement[] | undefined;
  let next = afterThen;
  if (tokens[afterThen]?.value === "else") {
    if (tokens[afterThen + 1]?.value !== "{")
      return fail({
        kind: "ExpectedToken",
        expected: "'{'",
        found: tokens[afterThen + 1]?.value,
        position:
          tokens[afterThen + 1]?.position ?? tokens[afterThen]!.position,
      });
    const elseResult = parseStatements(tokens, afterThen + 2);
    if (!elseResult.ok) return elseResult;
    elseBlock = elseResult.value.statements;
    next = elseResult.value.next;
  }
  return {
    ok: true,
    value: { ifStatement: { condition, thenBlock, elseBlock }, next },
  };
}

export function groupStatements(tokens: Token[]): Result<Statement[]> {
  const result = parseStatements(tokens, 0);
  if (!result.ok) return result;
  return { ok: true, value: result.value.statements };
}
