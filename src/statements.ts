import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import { tokenDetail } from "./tokenizer.ts";
import type { BlockNode, Pos, TuffExpr, TuffStatement } from "./ast.ts";
import { isExpr, parseLevel, parseOperand } from "./expr.ts";

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
  const then = parseStatement(tokens, pos, line);
  if (!isStatement(then) || then.kind !== "Block") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  let elseBlock: BlockNode | null = null;
  const next = tokens[pos.i];
  if (next?.kind === "Ident" && next.name === "else") {
    pos.i++;
    const elseStmt = parseStatement(tokens, pos, line);
    if (!isStatement(elseStmt) || elseStmt.kind !== "Block") {
      return {
        kind: "InvalidStatement",
        token: tokenDetail(tokens[pos.i]),
        line,
      };
    }
    elseBlock = elseStmt;
  }
  return { kind: "If", condition, then, else: elseBlock };
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
  if (token.kind === "Ident") {
    const name = token.name;
    pos.i++;
    const value = parseValue(tokens, pos, line);
    if (!isExpr(value)) return value;
    return {
      kind: "Assign",
      target: { kind: "Identifier", name },
      value,
    };
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
    value.kind === "If"
  );
}
