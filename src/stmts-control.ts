import type { Block, Expr, Stmt } from "./ast.ts";
import type { TuffError } from "./errors.ts";
import { parseError } from "./errors.ts";
import { atEnd, next, parseExpr, peek } from "./expr.ts";
import type { ParseExprResult, ParserState } from "./expr.ts";
import type { ParseStmtErr, ParseStmtResult } from "./stmts.ts";
import { parseAssign, parseLetDecl, parseReturn } from "./stmts.ts";

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
        error: parseError("Expected '}' to close block", state.end),
      };
    }
    next(state);
  }
  return { ok: true, stmts };
}

/**
 * Consume the separator following a parsed statement. A `;` is optional
 * after a block-like statement, and after the last statement of a block,
 * where the closing `}` ends the list.
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
 * Parse a single statement. An identifier not followed by `=` or `+=`
 * is a bare expression statement, which implicitly returns its value.
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
    if (!atEnd(state)) {
      const after = state.tokens[state.idx + 1];
      if (
        after !== undefined &&
        (after.value === "=" || after.value === "+=")
      ) {
        return parseAssign(state);
      }
    }
    return parseBareExpr(state);
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
 * Parse a bare expression statement: an expression that is not an
 * assignment, which implicitly returns its value.
 *
 * @param state - The parser state, positioned at the expression.
 * @returns A return statement carrying the expression, or a structured
 * parse error.
 */
function parseBareExpr(state: ParserState): ParseStmtResult {
  const value = parseExpr(state);
  if (!value.ok) return value;
  return { ok: true, stmt: { type: "Return", value: value.expr } };
}

/**
 * Parse a block expression: statements delimited by `{` and `}`, producing
 * the value the block returns. Wired into the expression parser through
 * `ParserState.parseBlockExpr`.
 *
 * @param state - The parser state, positioned at the opening `{`.
 * @returns The block expression, or a structured parse error.
 */
export function parseBlockExpr(state: ParserState): ParseExprResult {
  const open = peek(state);
  const block = parseBlock(state);
  if (!block.ok) return block;
  return {
    ok: true,
    expr: {
      type: "BlockExpr",
      stmts: (block.stmt as Block).stmts,
      pos: open.pos,
    },
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
