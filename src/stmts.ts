import type { TuffError } from "./errors.ts";
import { parseError } from "./errors.ts";
import { atEnd, next, parseExpr, peek } from "./expr.ts";
import type { Expr, ParseExprResult, ParserState } from "./expr.ts";

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
 * A `while` loop: repeats its body while the condition is truthy.
 */
export interface While {
  type: "While";
  cond: Expr;
  body: Stmt[];
}

/**
 * A `for` loop over a numeric range: `for (name in start..end) body`.
 * The end is exclusive; the loop variable is a fresh number binding
 * visible only inside the body.
 */
export interface For {
  type: "For";
  name: string;
  start: Expr;
  end: Expr;
  body: Stmt[];
}

/**
 * A statement in the program.
 */
export type Stmt = LetDecl | Assign | Return | Block | If | While | For;

/**
 * A successful statement parse result.
 */
export interface ParseStmtOk {
  ok: true;
  stmt: Stmt;
}

/**
 * A failed statement parse result.
 */
export interface ParseStmtErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of parsing a statement: a statement or a structured error.
 */
export type ParseStmtResult = ParseStmtOk | ParseStmtErr;

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
 * Whether a statement is block-like and does not require a trailing `;`.
 *
 * @param stmt - The statement to test.
 * @returns True for block-like statements.
 */
function isBlockLike(stmt: Stmt): boolean {
  return (
    stmt.type === "Block" ||
    stmt.type === "If" ||
    stmt.type === "While" ||
    stmt.type === "For"
  );
}

/**
 * Parse a list of statements, optionally terminated by a closing `}`.
 *
 * @param state - The parser state.
 * @param inBlock - Whether the list is inside a block (terminated by `}`).
 * @returns The statements, or a structured parse error.
 */
export function parseStmtList(
  state: ParserState,
  inBlock: boolean,
): ParseStmtsOk | ParseStmtErr {
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
    const sep = consumeSeparator(state, inBlock, isBlockLike(r.stmt));
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
): SepOk | ParseStmtErr {
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
export function parseStmt(state: ParserState): ParseStmtResult {
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
  if (t.kind === "keyword" && t.value === "while") {
    return parseWhile(state);
  }
  if (t.kind === "keyword" && t.value === "for") {
    return parseFor(state);
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
function parseBlock(state: ParserState): ParseStmtResult {
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
function parseLetDecl(state: ParserState): ParseStmtResult {
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
function parseReturn(state: ParserState): ParseStmtResult {
  next(state);
  const value = parseExpr(state);
  if (!value.ok) return value;
  return { ok: true, stmt: { type: "Return", value: value.expr } };
}

/**
 * Parse a parenthesized condition: `(expr)`.
 *
 * @param state - The parser state.
 * @param keyword - The keyword the condition follows, for error messages.
 * @returns The condition expression, or a structured parse error.
 */
function parseCond(state: ParserState, keyword: string): ParseExprResult {
  const open = next(state);
  if (open.value !== "(") {
    return {
      ok: false,
      error: parseError(`Expected '(' after '${keyword}'`, open.pos),
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
  return cond;
}

/**
 * Parse an `if` statement: `if (cond) { ... } [else { ... }]`.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseIf(state: ParserState): ParseStmtResult {
  next(state);
  const cond = parseCond(state, "if");
  if (!cond.ok) return cond;
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
 * Parse a `while` statement: `while (cond) { ... }` or `while (cond) stmt`.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseWhile(state: ParserState): ParseStmtResult {
  next(state);
  const cond = parseCond(state, "while");
  if (!cond.ok) return cond;
  let body: Stmt[];
  if (!atEnd(state) && peek(state).value === "{") {
    const block = parseBlock(state);
    if (!block.ok) return block;
    body = (block.stmt as Block).stmts;
  } else {
    const r = parseStmt(state);
    if (!r.ok) return r;
    const sep = consumeSeparator(state, false, isBlockLike(r.stmt));
    if (!sep.ok) return sep;
    body = [r.stmt];
  }
  return {
    ok: true,
    stmt: {
      type: "While",
      cond: cond.expr,
      body,
    },
  };
}

/**
 * Parse a `for` loop: `for (name in start..end) { ... }`.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseFor(state: ParserState): ParseStmtResult {
  next(state);
  const open = next(state);
  if (open.value !== "(") {
    return {
      ok: false,
      error: parseError("Expected '(' after 'for'", open.pos),
    };
  }
  const range = parseForRange(state, open.pos);
  if (!range.ok) return range;
  const block = parseBlock(state);
  if (!block.ok) return block;
  return {
    ok: true,
    stmt: {
      type: "For",
      name: range.name,
      start: range.start,
      end: range.end,
      body: (block.stmt as Block).stmts,
    },
  };
}

/**
 * Parse the `name in start..end` head of a `for` loop, including the
 * closing `)`.
 *
 * @param state - The parser state, positioned at the loop variable.
 * @param openPos - The position of the opening `(`, for error messages.
 * @returns The loop variable and range bounds, or a structured parse error.
 */
function parseForRange(
  state: ParserState,
  openPos: number,
): ParseForRangeResult {
  const nameTok = next(state);
  if (nameTok?.kind !== "ident") {
    return {
      ok: false,
      error: parseError(
        "Expected loop variable after 'for ('",
        nameTok?.pos ?? openPos,
      ),
    };
  }
  const inTok = next(state);
  if (inTok?.value !== "in") {
    return {
      ok: false,
      error: parseError(
        "Expected 'in' after loop variable",
        inTok?.pos ?? nameTok.pos,
      ),
    };
  }
  const start = parseExpr(state);
  if (!start.ok) return start;
  const dots = next(state);
  if (dots.value !== "..") {
    return {
      ok: false,
      error: parseError("Expected '..' after range start", dots.pos),
    };
  }
  const end = parseExpr(state);
  if (!end.ok) return end;
  const close = next(state);
  if (close.value !== ")") {
    return {
      ok: false,
      error: parseError("Expected ')' after range", close.pos),
    };
  }
  return { ok: true, name: nameTok.value, start: start.expr, end: end.expr };
}

/**
 * A successful `for` range parse result.
 */
interface ParseForRangeOk {
  ok: true;
  name: string;
  start: Expr;
  end: Expr;
}

/**
 * A failed `for` range parse result.
 */
interface ParseForRangeErr {
  ok: false;
  error: TuffError;
}

/**
 * The result of parsing a `for` loop range.
 */
type ParseForRangeResult = ParseForRangeOk | ParseForRangeErr;

/**
 * Parse an assignment statement.
 *
 * @param state - The parser state.
 * @returns The statement, or a structured parse error.
 */
function parseAssign(state: ParserState): ParseStmtResult {
  const nameTok = next(state);
  const eq = next(state);
  if (eq?.value !== "=" && eq?.value !== "+=") {
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
  const expr: Expr =
    eq.value === "+="
      ? {
          type: "Binary",
          op: "+",
          left: { type: "Identifier", name: nameTok.value, pos: nameTok.pos },
          right: value.expr,
          pos: eq.pos,
        }
      : value.expr;
  return {
    ok: true,
    stmt: {
      type: "Assign",
      name: nameTok.value,
      value: expr,
      pos: nameTok.pos,
    },
  };
}
