// Control flow statement parsing (if/while/for) — shared between top-level and block expressions.
import state from "./parser_state";
import { parseExpr } from "./expr_parser";

export function parseIfStmt(parseItem) {
  // if (cond) stmt; else stmt;
  state.pos++; // skip 'if'
  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "paren_open"
  )
    throw new Error("Expected '(' after 'if'");
  state.pos++; // skip '('
  const cond = parseExpr();
  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "paren_close"
  )
    throw new Error("Expected ')' after condition");
  state.pos++; // skip ')'

  const thenBranch = [parseItem()];

  let elseBranch;
  if (
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "keyword" &&
    state.tokens[state.pos].value === "else"
  ) {
    state.pos++; // skip 'else'
    elseBranch = [parseItem()];
  }

  return { type: "if_stmt", cond, thenBranch, elseBranch };
}

export function parseWhileStmt(parseItem) {
  // while (cond) stmt;
  state.pos++; // skip 'while'
  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "paren_open"
  )
    throw new Error("Expected '(' after 'while'");
  state.pos++; // skip '('
  const cond = parseExpr();
  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "paren_close"
  )
    throw new Error("Expected ')' after while condition");
  state.pos++; // skip ')'

  const body = [parseItem()];
  return { type: "while_stmt", cond, body };
}

export function parseForStmt(parseItem) {
  // for (i in start..end) stmt;
  state.pos++; // skip 'for'
  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "paren_open"
  )
    throw new Error("Expected '(' after 'for'");
  state.pos++; // skip '('

  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "identifier"
  )
    throw new Error("Expected identifier in for loop");
  const variable = state.tokens[state.pos++].value;

  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "keyword" ||
    state.tokens[state.pos].value !== "in"
  )
    throw new Error("Expected 'in' after for loop variable");
  state.pos++; // skip 'in'

  const from = parseExpr();

  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "range"
  )
    throw new Error("Expected '..' in for loop range");
  state.pos++; // skip '..'
  const to = parseExpr();

  if (
    state.pos >= state.tokens.length ||
    state.tokens[state.pos].type !== "paren_close"
  )
    throw new Error("Expected ')' after for loop range");
  state.pos++; // skip ')'

  const body = [parseItem()];
  return { type: "for_stmt", variable, from, to, body };
}
