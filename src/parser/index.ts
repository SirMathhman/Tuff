import type { Result } from "../errors.ts";
import type { Token } from "../lexer.ts";
import { parseStatements } from "./statements.ts";
import type { Cursor, Statement } from "./types.ts";

export type {
  Assignment,
  Declaration,
  Expr,
  IfStatement,
  Return,
  Statement,
  WhileStatement,
} from "./types.ts";

export function groupStatements(tokens: Token[]): Result<Statement[]> {
  const c: Cursor = { tokens, i: 0 };
  const result = parseStatements(c);
  if (!result.ok) return result;
  return { ok: true, value: result.value.statements };
}
