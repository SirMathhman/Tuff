import type { TuffError } from "./errors.ts";
import { parseError } from "./errors.ts";
import { next, parseExpr, peek } from "./expr.ts";
import type { Expr, ParserState } from "./expr.ts";

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
 * Parse a `let` (optionally `mut`) declaration.
 *
 * @param state - The parser state.
 * @returns The declaration, or a structured parse error.
 */
export function parseLetDecl(state: ParserState): ParseStmtResult {
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
export function parseReturn(state: ParserState): ParseStmtResult {
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
export function parseAssign(state: ParserState): ParseStmtResult {
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
