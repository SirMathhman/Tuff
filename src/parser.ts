import type { TuffError } from "./errors.ts";
import { tokenize } from "./tokenizer.ts";
import type { Token } from "./tokenizer.ts";

/**
 * A numeric literal expression.
 */
export interface NumberExpr {
  type: "Number";
  value: number;
  pos: number;
}

/**
 * An identifier reference expression.
 */
export interface IdentifierExpr {
  type: "Identifier";
  name: string;
  pos: number;
}

/**
 * A boolean literal expression.
 */
export interface BooleanExpr {
  type: "Boolean";
  value: boolean;
  pos: number;
}

/**
 * A binary operator expression.
 */
export interface BinaryExpr {
  type: "Binary";
  op: "||";
  left: Expr;
  right: Expr;
  pos: number;
}

/**
 * An expression: a number or boolean literal, an identifier reference,
 * or a binary operator expression.
 */
export type Expr = NumberExpr | IdentifierExpr | BooleanExpr | BinaryExpr;

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
 * A statement in the program.
 */
export type Stmt = LetDecl | Assign | Return | Block;

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
 * A successful expression parse result.
 */
interface ParseExprOk {
  ok: true;
  expr: Expr;
}

/**
 * Build a structured parse error.
 *
 * @param message - Human-readable description of the failure.
 * @param position - Zero-based offset of the failure in the source.
 * @returns The structured error.
 */
function parseError(message: string, position: number): TuffError {
  return { type: "ParseError", message, position };
}

/**
 * Mutable parser state: the token list and the current cursor.
 */
interface ParserState {
  tokens: Token[];
  idx: number;
}

/**
 * Peek at the current token without advancing.
 *
 * @param state - The parser state.
 * @returns The current token.
 */
function peek(state: ParserState): Token {
  return state.tokens[state.idx] as Token;
}

/**
 * Consume and return the current token.
 *
 * @param state - The parser state.
 * @returns The consumed token.
 */
function next(state: ParserState): Token {
  const t = state.tokens[state.idx] as Token;
  state.idx++;
  return t;
}

/**
 * Whether the cursor has reached the end of the token list.
 *
 * @param state - The parser state.
 * @returns True when no tokens remain.
 */
function atEnd(state: ParserState): boolean {
  return state.idx >= state.tokens.length;
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
    if (!atEnd(state)) {
      const sep = peek(state);
      if (sep.value === ";") {
        next(state);
        continue;
      }
      if (sep.value === "}") {
        if (!inBlock) {
          return {
            ok: false,
            error: parseError("Unexpected '}'", sep.pos),
          };
        }
        if (r.stmt.type !== "Block") {
          return {
            ok: false,
            error: parseError("Expected ';' after statement", sep.pos),
          };
        }
        continue;
      }
      if (r.stmt.type !== "Block") {
        return {
          ok: false,
          error: parseError("Expected ';' after statement", sep.pos),
        };
      }
    }
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
 * Parse an expression, including `||` binary operators.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parseExpr(state: ParserState): ParseExprOk | ParseErr {
  const first = parsePrimary(state);
  if (!first.ok) return first;
  let expr = first.expr;
  while (!atEnd(state) && peek(state).value === "||") {
    const opTok = next(state);
    const right = parsePrimary(state);
    if (!right.ok) return right;
    expr = {
      type: "Binary",
      op: "||",
      left: expr,
      right: right.expr,
      pos: opTok.pos,
    };
  }
  return { ok: true, expr };
}

/**
 * Parse a primary expression: a number or boolean literal, or an identifier.
 *
 * @param state - The parser state.
 * @returns The expression, or a structured parse error.
 */
function parsePrimary(state: ParserState): ParseExprOk | ParseErr {
  const t = peek(state);
  if (t.kind === "number") {
    next(state);
    return {
      ok: true,
      expr: { type: "Number", value: Number(t.value), pos: t.pos },
    };
  }
  if (t.kind === "boolean") {
    next(state);
    return {
      ok: true,
      expr: { type: "Boolean", value: t.value === "true", pos: t.pos },
    };
  }
  if (t.kind === "ident") {
    next(state);
    return {
      ok: true,
      expr: { type: "Identifier", name: t.value, pos: t.pos },
    };
  }
  return {
    ok: false,
    error: parseError(`Expected expression, got: ${t.value}`, t.pos),
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
