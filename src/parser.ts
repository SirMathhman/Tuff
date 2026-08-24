import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Token } from "./lexer.ts";

export type Statement =
  | { block: Statement[]; position: number }
  | { stmt: Token[]; position: number };

export function groupStatements(tokens: Token[]): Result<Statement[]> {
  const statements: Statement[] = [];
  let current: Token[] = [];
  let depth = 0;
  for (const token of tokens) {
    if (token.value === "{") {
      if (current.length !== 0)
        return fail({ kind: "UnbalancedBrace", position: token.position });
      depth++;
      statements.push({ block: [], position: token.position });
    } else if (token.value === "}") {
      depth--;
      if (depth < 0)
        return fail({ kind: "UnbalancedBrace", position: token.position });
    } else if (token.value === ";") {
      if (current.length === 0)
        return fail({ kind: "EmptyStatement", position: token.position });
      if (depth === 0) {
        statements.push({ stmt: current, position: current[0]!.position });
        current = [];
      } else {
        const block = statements[statements.length - 1];
        if (!block || "stmt" in block)
          return fail({ kind: "UnbalancedBrace", position: token.position });
        block.block.push({ stmt: current, position: current[0]!.position });
        current = [];
      }
    } else {
      current.push(token);
    }
  }
  if (depth !== 0)
    return fail({
      kind: "UnbalancedBrace",
      position: tokens[tokens.length - 1]?.position ?? 0,
    });
  if (current.length !== 0)
    return fail({
      kind: "MissingTerminator",
      position: current[current.length - 1]!.position,
    });
  return { ok: true, value: statements };
}
