import type { TuffError } from "./errors.ts";
import { parseError } from "./errors.ts";
import { atEnd, next, parseExpr, peek } from "./expr.ts";
import type { Expr, ParserState } from "./expr.ts";
import { tokenize } from "./tokenizer.ts";

/**
 * A `let` (optionally `mut`) variable declaration.
 */
export interface LetDecl {
  type: "LetDecl";
  mutable: boolean;
  name: string;
  value: Expr;
}

/**
 * An assignment to a variable.
 */
export interface Assign {
  type: "Assign";
  name: string;
  value: Expr;
  pos: number;
}

/**
 * A return statement.
 */
export interface Return {
  type: "Return";
  value: Expr;
}

/**
 * A block of statements delimited by braces.
 */
export interface Block {
  type: "Block";
  stmts: Stmt[];
}

/**
 * An `if` statement with an optional `else` branch.
 */
export interface If {
  type: "If";
  cond: Expr;
  then: Stmt[];
  else: Stmt[];
}

/**
 * A statement in the program.
 */
export type Stmt = LetDecl | Assign | Return | Block | If;

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
 * A successful statement parse result.
 */
interface ParseStmtOk {
  ok: true;
  stmt: Stmt;
}

/**
 * A successful statement-list parse result.
 */
interface ParseStmtsOk {
  ok: true;
  stmts: Stmt[];
}

/**
 * A successful separator-consumption result.
 */
interface SepOk {
  ok: true;
}

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
 * Parse a list of statements, optionally terminated by a closing `}`.
 *
 * @param state - The parser state.
 * @param inBlock - Whether the list is inside a block (terminated by `}`).
 * @returns The statements, or a structured parse error.
 */
function parseStmtList(
  state: ParserState,
  inBlock: boolean,
): ParseStmtsOk | ParseErr {
  const stmts: Stmt[] = [];
  while (!atEnd(state) && !(inBlock && peek(state).value === "}")) {
    const t = peek(state);
    if (t.value === ";") {
      next(state);
      continue;
    }
    const r = parseStmt(state);
    if (!r.ok) return r;
    stmts.push(r.stmt);
    const sep = consumeSeparator(
      state,
      inBlock,
      r.stmt.type === "Block" || r.stmt.type === "If",
    );
    if (!sep.ok) return sep;
  }
  if (inBlock) {
    if (atEnd(state)) {
      return {
        ok: false,
        error: parseError("Expected '}' to close block", state.tokens.length),
      };
    }
    next(state);
  }
  return { ok: true, stmts };
}

/**
 * Consume the separator following a parsed statement.
 *
 * @param state - The parser state.
 * @param inBlock - Whether the list is inside a block.
 * @param isBlock - Whether the parsed statement was a block.
 * @returns A success marker, or a structured parse error.
 */
function consumeSeparator(
  state: ParserState,
  inBlock: boolean,
  isBlock: boolean,
): SepOk | ParseErr {
  if (atEnd(state)) return { ok: true };
  const sep = peek(state);
  if (sep.value === ";") {
    next(state);
    return { ok: true };
  }
  if (sep.value === "}") {
    if (!inBlock) {
      return { ok: false, error: parseError("Unexpected '}'", sep.pos) };
    }
    if (!isBlock) {
      return {
        ok: false,
        error: parseError("Expected ';' after statement", sep.pos),
      };
    }
    return { ok: true };
  }
  if (!isBlock) {
    return {
      ok: false,
      error: parseError("Expected ';' after statement", sep.pos),
    };
  }
  return { ok: true };
}

/**
 * Parse a single statement.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseStmt(state: ParserState): ParseStmtOk | ParseErr {
  const t = peek(state);
  if (t.kind === "keyword" && t.value === "let") {
    return parseLetDecl(state);
  }
  if (t.kind === "keyword" && t.value === "return") {
    return parseReturn(state);
  }
  if (t.kind === "keyword" && t.value === "if") {
    return parseIf(state);
  }
  if (t.kind === "ident") {
    return parseAssign(state);
  }
  if (t.value === "{") {
    return parseBlock(state);
  }
  return {
    ok: false,
    error: parseError(`Unexpected token: ${t.value}`, t.pos),
  };
}

/**
 * Parse a block: statements delimited by `{` and `}`.
 *
 * @param state - The parser state.
 * @returns The block, or a structured parse error.
 */
function parseBlock(state: ParserState): ParseStmtOk | ParseErr {
  next(state);
  const r = parseStmtList(state, true);
  if (!r.ok) return r;
  return { ok: true, stmt: { type: "Block", stmts: r.stmts } };
}

/**
 * Parse a `let` (optionally `mut`) declaration.
 *
 * @param state - The parser state.
 * @returns The declaration, or a structured parse error.
 */
function parseLetDecl(state: ParserState): ParseStmtOk | ParseErr {
  next(state);
  let mutable = false;
  const maybeMut = peek(state);
  if (maybeMut.kind === "keyword" && maybeMut.value === "mut") {
    next(state);
    mutable = true;
  }
  const nameTok = next(state);
  if (nameTok?.kind !== "ident") {
    return {
      ok: false,
      error: parseError(
        "Expected variable name after 'let'",
        nameTok?.pos ?? 0,
      ),
    };
  }
  const eq = next(state);
  if (eq?.value !== "=") {
    return {
      ok: false,
      error: parseError(
        "Expected '=' after variable name",
        eq?.pos ?? nameTok.pos,
      ),
    };
  }
  const value = parseExpr(state);
  if (!value.ok) return value;
  return {
    ok: true,
    stmt: {
      type: "LetDecl",
      mutable,
      name: nameTok.value,
      value: value.expr,
    },
  };
}

/**
 * Parse a `return` statement.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseReturn(state: ParserState): ParseStmtOk | ParseErr {
  next(state);
  const value = parseExpr(state);
  if (!value.ok) return value;
  return { ok: true, stmt: { type: "Return", value: value.expr } };
}

/**
 * Parse an `if` statement: `if (cond) { ... } [else { ... }]`.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseIf(state: ParserState): ParseStmtOk | ParseErr {
  next(state);
  const open = next(state);
  if (open.value !== "(") {
    return {
      ok: false,
      error: parseError("Expected '(' after 'if'", open.pos),
    };
  }
  const cond = parseExpr(state);
  if (!cond.ok) return cond;
  const close = next(state);
  if (close.value !== ")") {
    return {
      ok: false,
      error: parseError("Expected ')' after condition", close.pos),
    };
  }
  const thenBlock = parseBlock(state);
  if (!thenBlock.ok) return thenBlock;
  let elseStmts: Stmt[] = [];
  if (!atEnd(state) && peek(state).value === "else") {
    next(state);
    const elseBlock = parseBlock(state);
    if (!elseBlock.ok) return elseBlock;
    elseStmts = (elseBlock.stmt as Block).stmts;
  }
  return {
    ok: true,
    stmt: {
      type: "If",
      cond: cond.expr,
      then: (thenBlock.stmt as Block).stmts,
      else: elseStmts,
    },
  };
}

/**
 * Parse an assignment statement.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseAssign(state: ParserState): ParseStmtOk | ParseErr {
  const nameTok = next(state);
  const eq = next(state);
  if (eq?.value !== "=") {
    return {
      ok: false,
      error: parseError(
        "Expected '=' after identifier",
        eq?.pos ?? nameTok.pos,
      ),
    };
  }
  const value = parseExpr(state);
  if (!value.ok) return value;
  return {
    ok: true,
    stmt: {
      type: "Assign",
      name: nameTok.value,
      value: value.expr,
      pos: nameTok.pos,
    },
  };
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
