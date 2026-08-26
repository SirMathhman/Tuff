import type { TuffError } from "./errors.ts";
import { tokenize, type TuffToken } from "./tokenizer.ts";

/** A literal expression node (number or boolean). */
export interface LiteralNode {
  kind: "Literal";
  value: number;
}

/** An identifier expression node. */
export interface IdentifierNode {
  kind: "Identifier";
  name: string;
}

/** A binary `||` expression node. */
export interface OrNode {
  kind: "Or";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `&&` expression node. */
export interface AndNode {
  kind: "And";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `+` expression node. */
export interface AddNode {
  kind: "Add";
  left: TuffExpr;
  right: TuffExpr;
}

/** A binary `==` expression node. */
export interface EqualNode {
  kind: "Equal";
  left: TuffExpr;
  right: TuffExpr;
}

/** A prefix `&` reference expression node. */
export interface RefNode {
  kind: "Ref";
  operand: TuffExpr;
}

/** A prefix `*` dereference expression node. */
export interface DerefNode {
  kind: "Deref";
  operand: TuffExpr;
}

/** A parsed tuff expression. */
export type TuffExpr =
  | LiteralNode
  | IdentifierNode
  | OrNode
  | AndNode
  | AddNode
  | EqualNode
  | RefNode
  | DerefNode;

/** A `let` declaration statement node. */
export interface LetNode {
  kind: "Let";
  mut: boolean;
  name: string;
  value: TuffExpr;
}

/** An assignment statement node. */
export interface AssignNode {
  kind: "Assign";
  name: string;
  value: TuffExpr;
}

/** A `return` statement node. */
export interface ReturnNode {
  kind: "Return";
  value: TuffExpr;
}

/** A braced block statement node. */
export interface BlockNode {
  kind: "Block";
  statements: TuffStatement[];
}

/** A parsed tuff statement. */
export type TuffStatement = LetNode | AssignNode | ReturnNode | BlockNode;

/** A mutable parse position over a token list. */
interface Pos {
  i: number;
}

/** A binary operator's grammar properties. */
interface BinaryOp {
  token: "Or" | "And" | "Plus" | "Equal";
  node: "Or" | "And" | "Add" | "Equal";
  assoc: "left" | "right";
}

/**
 * The binary operator grammar, loosest binding first.
 * Precedence and associativity are declared here, never by function order.
 */
const BINARY_OPS: BinaryOp[] = [
  { token: "Or", node: "Or", assoc: "right" },
  { token: "And", node: "And", assoc: "right" },
  { token: "Equal", node: "Equal", assoc: "left" },
  { token: "Plus", node: "Add", assoc: "left" },
];

/**
 * Type guard distinguishing a parsed expression node from an error.
 * @param value {TuffExpr | TuffError} - The value to test.
 * @returns {boolean} True if the value is an expression node.
 */
export function isExpr(value: TuffExpr | TuffError): value is TuffExpr {
  if (
    value.kind === "Literal" ||
    value.kind === "Identifier" ||
    value.kind === "Ref" ||
    value.kind === "Deref"
  ) {
    return true;
  }
  return BINARY_OPS.some((op) => op.node === value.kind);
}

/**
 * Parse a single operand: a literal, an identifier, or a parenthesized expression.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the operand.
 * @param line {number} - The 1-based line number.
 * @returns {TuffExpr | TuffError} The operand node, or a TuffError.
 */
function parseOperand(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffExpr | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidExpression", expression: "", line };
  if (token.kind === "Number" || token.kind === "Bool") {
    pos.i++;
    return { kind: "Literal", value: token.value };
  }
  if (token.kind === "Ref" || token.kind === "Deref") {
    const kind = token.kind;
    pos.i++;
    const operand = parseOperand(tokens, pos, line);
    if (!isExpr(operand)) return operand;
    return { kind, operand };
  }
  if (token.kind === "Ident") {
    pos.i++;
    return { kind: "Identifier", name: token.name };
  }
  if (token.kind === "LParen") {
    pos.i++;
    const inner = parseLevel(tokens, pos, line, 0);
    if (!isExpr(inner)) return inner;
    const close = tokens[pos.i];
    if (close?.kind !== "RParen") {
      return { kind: "InvalidExpression", expression: "", line };
    }
    pos.i++;
    return inner;
  }
  return { kind: "InvalidExpression", expression: "", line };
}

/**
 * Parse an expression at one precedence level of the binary operator grammar.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @param level {number} - The index into BINARY_OPS; the next level binds tighter.
 * @returns {TuffExpr | TuffError} The expression node, or a TuffError.
 */
function parseLevel(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  level: number,
): TuffExpr | TuffError {
  const op = BINARY_OPS[level];
  if (!op) return parseOperand(tokens, pos, line);
  const first = parseLevel(tokens, pos, line, level + 1);
  if (!isExpr(first)) return first;
  let left: TuffExpr = first;
  while (tokens[pos.i]?.kind === op.token) {
    pos.i++;
    const right =
      op.assoc === "right"
        ? parseLevel(tokens, pos, line, level)
        : parseLevel(tokens, pos, line, level + 1);
    if (!isExpr(right)) return right;
    left = { kind: op.node, left, right };
  }
  return left;
}

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
    return { kind: "InvalidStatement", statement: "", line };
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
    return { kind: "InvalidStatement", statement: "", line };
  }
  pos.i++;
  const value = parseValue(tokens, pos, line);
  if (!isExpr(value)) return value;
  return { kind: "Let", mut, name: nameTok.name, value };
}

/**
 * Parse a braced block: `{ stmt; ... }`.
 * @param tokens {TuffToken[]} - The token list; `{` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the block.
 * @param line {number} - The 1-based line number of the block's first statement.
 * @returns {TuffStatement | TuffError} The Block node, or a TuffError.
 */
function parseBlock(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  const statements: TuffStatement[] = [];
  for (;;) {
    const next = tokens[pos.i];
    if (!next || next.kind === "RBrace") break;
    const stmt = parseStatement(tokens, pos, line + statements.length);
    if (!isStatement(stmt)) return stmt;
    statements.push(stmt);
    const sep = tokens[pos.i];
    if (sep?.kind === "Semicolon") {
      pos.i++;
      continue;
    }
    if (sep?.kind === "RBrace") break;
    return { kind: "InvalidStatement", statement: "", line };
  }
  const close = tokens[pos.i];
  if (close?.kind !== "RBrace") {
    return { kind: "InvalidStatement", statement: "", line };
  }
  pos.i++;
  return { kind: "Block", statements };
}

/**
 * Parse a single statement: a block, `let`, `return`, or an assignment.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @returns {TuffStatement | TuffError} The statement node, or a TuffError.
 */
function parseStatement(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  const token = tokens[pos.i];
  if (!token) return { kind: "InvalidStatement", statement: "", line };
  if (token.kind === "LBrace") {
    pos.i++;
    return parseBlock(tokens, pos, line);
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
  if (token.kind === "Ident") {
    const name = token.name;
    pos.i++;
    const value = parseValue(tokens, pos, line);
    if (!isExpr(value)) return value;
    return { kind: "Assign", name, value };
  }
  return { kind: "InvalidStatement", statement: "", line };
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
    value.kind === "Block"
  );
}

/**
 * Parse a full program string into a list of statement ASTs.
 * @param text {string} - The program text.
 * @param line {number} - The 1-based line number of the first statement.
 * @returns {TuffStatement[] | TuffError} The statements, or a TuffError.
 */
export function parseProgram(
  text: string,
  line: number,
): TuffStatement[] | TuffError {
  let tokens: TuffToken[];
  try {
    tokens = tokenize(text);
  } catch {
    return { kind: "InvalidStatement", statement: text.trim(), line };
  }
  const pos: Pos = { i: 0 };
  const statements: TuffStatement[] = [];
  for (;;) {
    const next = tokens[pos.i];
    if (!next) break;
    const stmtLine = line + statements.length;
    const stmt = parseStatement(tokens, pos, stmtLine);
    if (!isStatement(stmt)) {
      if (stmt.kind === "InvalidStatement") {
        return {
          kind: "InvalidStatement",
          statement: text.trim(),
          line: stmtLine,
        };
      }
      return stmt;
    }
    statements.push(stmt);
    const sep = tokens[pos.i];
    if (sep?.kind === "Semicolon") {
      pos.i++;
      continue;
    }
    if (!sep) break;
    if (stmt.kind !== "Block") {
      return {
        kind: "InvalidStatement",
        statement: text.trim(),
        line: stmtLine,
      };
    }
  }
  return statements;
}
