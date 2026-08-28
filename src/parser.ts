import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import { tokenDetail } from "./tokenizer.ts";
import type { Pos, TuffStatement } from "./ast.ts";
import { isStatement, parseStatement } from "./statements.ts";

export type {
  LiteralNode,
  IdentifierNode,
  OrNode,
  AndNode,
  AddNode,
  EqualNode,
  LessNode,
  RefNode,
  DerefNode,
  TupleNode,
  TupleIndexNode,
  ArrayNode,
  ArrayIndexNode,
  RangeNode,
  CallNode,
  TuffExpr,
  LetNode,
  FnNode,
  FnParam,
  AssignNode,
  ReturnNode,
  ExprNode,
  BlockNode,
  IfNode,
  WhileNode,
  ForNode,
  BreakNode,
  ContinueNode,
  TuffStatement,
  Pos,
} from "./ast.ts";

/**
 * Parse a token list into a list of statement ASTs.
 * @param tokens {TuffToken[]} - The program tokens.
 * @param line {number} - The 1-based line number of the first statement.
 * @returns {TuffStatement[] | TuffError} The statements, or a TuffError.
 */
export function parseProgram(
  tokens: TuffToken[],
  line: number,
): TuffStatement[] | TuffError {
  const pos: Pos = { i: 0 };
  const statements: TuffStatement[] = [];
  for (;;) {
    const next = tokens[pos.i];
    if (!next) break;
    const stmtLine = line + statements.length;
    const stmt = parseStatement(tokens, pos, stmtLine);
    if (!isStatement(stmt)) return stmt;
    statements.push(stmt);
    const sep = tokens[pos.i];
    if (sep?.kind === "Semicolon") {
      pos.i++;
      continue;
    }
    if (!sep) break;
    if (
      stmt.kind !== "Block" &&
      stmt.kind !== "If" &&
      stmt.kind !== "While" &&
      stmt.kind !== "For" &&
      stmt.kind !== "Struct" &&
      stmt.kind !== "Fn"
    ) {
      return {
        kind: "InvalidStatement",
        token: tokenDetail(sep),
        line: stmtLine,
      };
    }
  }
  return statements;
}
