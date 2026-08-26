import type { TuffError } from "./errors.ts";
import type { ParserState } from "./expr.ts";
import { tokenize } from "./tokenizer.ts";
import { parseStmtList } from "./stmts-control.ts";
import type { Stmt } from "./stmts.ts";
export type {
  Assign,
  Block,
  For,
  If,
  LetDecl,
  Return,
  Stmt,
  While,
} from "./stmts.ts";

/**
 * A parsed program: an ordered list of statements.
 */
export interface Program {
  stmts: Stmt[];
}

/**
 * A successful parse result.
 */
export interface ParseOk {
  ok: true;
  program: Program;
}

/**
 * A failed parse result.
 */
export interface ParseErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of parsing: a program or a structured error.
 */
export type ParseResult = ParseOk | ParseErr;

/**
 * Parse the full program: statements separated by `;`.
 *
 * @param state - The parser state.
 * @returns The program, or a structured parse error.
 */
function parseProgram(state: ParserState): ParseResult {
  const r = parseStmtList(state, false);
  if (!r.ok) return r;
  return { ok: true, program: { stmts: r.stmts } };
}

/**
 * Parse source text into a program AST.
 *
 * @param input - The source text.
 * @returns The program, or a structured parse error.
 */
export function parse(input: string): ParseResult {
  const tok = tokenize(input);
  if (!tok.ok) return tok;
  return parseProgram({ tokens: tok.tokens, idx: 0 });
}
