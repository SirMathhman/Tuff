import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import { tokenDetail } from "./tokenizer.ts";
import type { Pos, TuffExpr, TuffStatement } from "./ast.ts";
import {
  isExpr,
  parseLevel,
  parseOperand,
  type BinaryNodeKind,
} from "./expr.ts";

/**
 * A function that parses one statement from a token list.
 * Passed to the statement parsers to break their mutual recursion.
 */
export type ParseStatement = (
  tokens: TuffToken[],
  pos: Pos,
  line: number,
) => TuffStatement | TuffError;

/**
 * Parse the `= expr` tail of a declaration or assignment.
 * @param tokens {TuffToken[]} - The token list; the name already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the value.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The value expression, or a TuffError.
 */
function parseValue(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  if (tokens[pos.i]?.kind !== "Assign") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  const value = parseLevel(tokens, pos, line, 0);
  if (!isExpr(value)) return value;
  return value;
}

/** A compound-assignment operator's grammar properties. */
interface CompoundOp {
  token: "PlusAssign";
  node: BinaryNodeKind;
}

/**
 * The compound-assignment grammar: each token desugars `name op= rhs` to
 * `name = name <node> rhs`.
 */
const COMPOUND_OPS: CompoundOp[] = [{ token: "PlusAssign", node: "Add" }];

/**
 * Parse an assignment: `name = expr` or a compound form like `name += expr`.
 * @param tokens {TuffToken[]} - The token list; the name already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the assignment.
 * @param line {number} - The 1-based line number.
 * @param name {string} - The target identifier name.
 * @returns {TuffStatement | TuffError} The Assign node, or a TuffError.
 */
function parseAssign(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  name: string,
): TuffStatement | TuffError {
  const target: TuffExpr = { kind: "Identifier", name };
  for (const op of COMPOUND_OPS) {
    if (tokens[pos.i]?.kind !== op.token) continue;
    pos.i++;
    const rhs = parseLevel(tokens, pos, line, 0);
    if (!isExpr(rhs)) return rhs;
    return {
      kind: "Assign",
      target,
      value: { kind: op.node, left: target, right: rhs },
    };
  }
  const value = parseValue(tokens, pos, line);
  if (!isExpr(value)) return value;
  return { kind: "Assign", target, value };
}

/**
 * Parse a `let` declaration: `let [mut] name = expr`.
 * @param tokens {TuffToken[]} - The token list; `let` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the declaration.
 * @param line {number} - The 1-based line number.
 * @returns {TuffStatement | TuffError} The Let node, or a TuffError.
 */
function parseLet(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  let mut = false;
  const mutTok = tokens[pos.i];
  if (mutTok?.kind === "Ident" && mutTok.name === "mut") {
    mut = true;
    pos.i++;
  }
  const nameTok = tokens[pos.i];
  if (nameTok?.kind !== "Ident") {
    return { kind: "InvalidStatement", token: tokenDetail(nameTok), line };
  }
  pos.i++;
  const value = parseValue(tokens, pos, line);
  if (!isExpr(value)) return value;
  return { kind: "Let", mut, name: nameTok.name, value };
}

/**
 * Parse one statement and append it to the list.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @param statements {TuffStatement[]} - The list to append the statement to.
 * @param parseStatement {ParseStatement} - The statement parser, breaking mutual recursion.
 * @returns {TuffStatement | TuffError} The parsed statement, or a TuffError.
 */
function parseAndCollect(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  statements: TuffStatement[],
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const stmt = parseStatement(tokens, pos, line);
  if (!isStatement(stmt)) return stmt;
  statements.push(stmt);
  return stmt;
}

/**
 * Parse a parenthesized condition: `(expr)`, shared by `if` and `while`.
 * @param tokens {TuffToken[]} - The token list; the keyword already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the condition.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The condition expression, or a TuffError.
 */
function parseCondition(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  if (tokens[pos.i]?.kind !== "LParen") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  const condition = parseLevel(tokens, pos, line, 0);
  if (!isExpr(condition)) return condition;
  if (tokens[pos.i]?.kind !== "RParen") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  return condition;
}

/**
 * Parse an `if` statement: `if (expr) { ... } [else { ... }]`.
 * @param tokens {TuffToken[]} - The token list; `if` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, breaking mutual recursion.
 * @returns {TuffStatement | TuffError} The If node, or a TuffError.
 */
function parseIf(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const condition = parseCondition(tokens, pos, line);
  if (!isExpr(condition)) return condition;
  const then = parseStatement(tokens, pos, line);
  if (!isStatement(then)) {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  if (tokens[pos.i]?.kind === "Semicolon") pos.i++;
  let elseStmt: TuffStatement | null = null;
  const next = tokens[pos.i];
  if (next?.kind === "Ident" && next.name === "else") {
    pos.i++;
    const parsed = parseStatement(tokens, pos, line);
    if (!isStatement(parsed)) {
      return {
        kind: "InvalidStatement",
        token: tokenDetail(tokens[pos.i]),
        line,
      };
    }
    elseStmt = parsed;
  }
  return { kind: "If", condition, then, else: elseStmt };
}

/**
 * Parse a `while` statement: `while (expr) stmt`.
 * @param tokens {TuffToken[]} - The token list; `while` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, breaking mutual recursion.
 * @returns {TuffStatement | TuffError} The While node, or a TuffError.
 */
function parseWhile(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const condition = parseCondition(tokens, pos, line);
  if (!isExpr(condition)) return condition;
  const body = parseStatement(tokens, pos, line);
  if (!isStatement(body)) {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  if (tokens[pos.i]?.kind === "Semicolon") pos.i++;
  return { kind: "While", condition, body };
}

/**
 * Parse a braced block: `{ stmt; ... }`.
 * @param tokens {TuffToken[]} - The token list; `{` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the block.
 * @param line {number} - The 1-based line number of the block's first statement.
 * @param parseStatement {ParseStatement} - The statement parser, breaking mutual recursion.
 * @returns {TuffStatement | TuffError} The Block node, or a TuffError.
 */
function parseBlock(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const statements: TuffStatement[] = [];
  for (;;) {
    const next = tokens[pos.i];
    if (!next || next.kind === "RBrace") break;
    const stmt = parseAndCollect(
      tokens,
      pos,
      line + statements.length,
      statements,
      parseStatement,
    );
    if (!isStatement(stmt)) return stmt;
    const sep = tokens[pos.i];
    if (sep?.kind === "Semicolon") {
      pos.i++;
      continue;
    }
    if (sep?.kind === "RBrace") break;
    return { kind: "InvalidStatement", token: tokenDetail(sep), line };
  }
  const close = tokens[pos.i];
  if (close?.kind !== "RBrace") {
    return { kind: "InvalidStatement", token: tokenDetail(close), line };
  }
  pos.i++;
  return { kind: "Block", statements };
}

/**
 * Parse a single statement: a block, `let`, `return`, `if`, or an assignment.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @returns {TuffStatement | TuffError} The statement node, or a TuffError.
 */
export function parseStatement(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidStatement", token: "", line };
  if (token.kind === "LBrace") {
    pos.i++;
    return parseBlock(tokens, pos, line, parseStatement);
  }
  if (token.kind === "Ident" && token.name === "let") {
    pos.i++;
    return parseLet(tokens, pos, line);
  }
  if (token.kind === "Ident" && token.name === "return") {
    pos.i++;
    const value = parseLevel(tokens, pos, line, 0);
    if (!isExpr(value)) return value;
    return { kind: "Return", value };
  }
  if (token.kind === "Ident" && token.name === "if") {
    pos.i++;
    return parseIf(tokens, pos, line, parseStatement);
  }
  if (token.kind === "Ident" && token.name === "while") {
    pos.i++;
    return parseWhile(tokens, pos, line, parseStatement);
  }
  if (token.kind === "Ident") {
    const name = token.name;
    pos.i++;
    return parseAssign(tokens, pos, line, name);
  }
  if (token.kind === "Deref") {
    const target = parseOperand(tokens, pos, line);
    if (!isExpr(target)) return target;
    const value = parseValue(tokens, pos, line);
    if (!isExpr(value)) return value;
    return { kind: "Assign", target, value };
  }
  return { kind: "InvalidStatement", token: tokenDetail(token), line };
}

/**
 * Type guard distinguishing a parsed statement node from an error.
 * @param value {TuffStatement | TuffError} - The value to test.
 * @returns {boolean} True if the value is a statement node.
 */
export function isStatement(
  value: TuffStatement | TuffError,
): value is TuffStatement {
  return (
    value.kind === "Let" ||
    value.kind === "Assign" ||
    value.kind === "Return" ||
    value.kind === "Block" ||
    value.kind === "If" ||
    value.kind === "While"
  );
}
