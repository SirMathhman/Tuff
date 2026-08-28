import type { TuffError } from "./errors.ts";
import type { TuffToken } from "./tokenizer.ts";
import { tokenDetail } from "./tokenizer.ts";
import {
  isStatement,
  type FnParam,
  type KindName,
  type Pos,
  type StructField,
  type TuffExpr,
  type TuffStatement,
} from "./ast.ts";
import {
  isExpr,
  isKindName,
  parseIndexSuffix,
  parseKindName,
  parseLevel,
  parseOperand,
  type BinaryNodeKind,
  type ParseStatement,
} from "./expr.ts";

export type { ParseStatement } from "./expr.ts";

/**
 * A function that parses the rest of a keyword statement, with the keyword
 * itself already consumed. The shape every entry of the keyword table shares.
 */
type ParseKeyword = (
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
) => TuffStatement | TuffError;

/**
 * Parse the `= expr` tail of a declaration or assignment.
 * @param tokens {TuffToken[]} - The token list; the name already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the value.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffExpr | TuffError} The value expression, or a TuffError.
 */
function parseValue(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffExpr | TuffError {
  if (tokens[pos.i]?.kind !== "Assign") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  const value = parseLevel(tokens, pos, line, 0, parseStatement);
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
 * Parse an assignment: `target = expr` or a compound form like `target += expr`.
 * @param tokens {TuffToken[]} - The token list; the target already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the assignment.
 * @param line {number} - The 1-based line number.
 * @param target {TuffExpr} - The target expression: an identifier or an array index.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffStatement | TuffError} The Assign node, or a TuffError.
 */
function parseAssign(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  target: TuffExpr,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  for (const op of COMPOUND_OPS) {
    if (tokens[pos.i]?.kind !== op.token) continue;
    pos.i++;
    const rhs = parseLevel(tokens, pos, line, 0, parseStatement);
    if (!isExpr(rhs)) return rhs;
    return {
      kind: "Assign",
      target,
      value: { kind: op.node, left: target, right: rhs },
    };
  }
  const value = parseValue(tokens, pos, line, parseStatement);
  if (!isExpr(value)) return value;
  return { kind: "Assign", target, value };
}

/**
 * Parse a `let` declaration: `let [mut] name [: KindName] = expr`.
 * @param tokens {TuffToken[]} - The token list; `let` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the declaration.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffStatement | TuffError} The Let node, or a TuffError.
 */
function parseLet(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
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
  let annotation: KindName | undefined;
  if (tokens[pos.i]?.kind === "Colon") {
    pos.i++;
    const parsed = parseKindName(tokens, pos, line);
    if (!isKindName(parsed)) return parsed;
    annotation = parsed;
  }
  const value = parseValue(tokens, pos, line, parseStatement);
  if (!isExpr(value)) return value;
  return { kind: "Let", mut, name: nameTok.name, annotation, value };
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
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffExpr | TuffError} The condition expression, or a TuffError.
 */
function parseCondition(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffExpr | TuffError {
  if (tokens[pos.i]?.kind !== "LParen") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  const condition = parseLevel(tokens, pos, line, 0, parseStatement);
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
 * Parse a parenthesized condition for an `if` or `while` statement,
 * narrowing the result to an expression.
 * @param tokens {TuffToken[]} - The token list; the keyword already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the condition.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffExpr | TuffError} The condition expression, or a TuffError.
 */
function parseConditionExpr(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffExpr | TuffError {
  const condition = parseCondition(tokens, pos, line, parseStatement);
  return isExpr(condition) ? condition : condition;
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
  const condition = parseConditionExpr(tokens, pos, line, parseStatement);
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
  const cond = parseConditionExpr(tokens, pos, line, parseStatement);
  if (!isExpr(cond)) return cond;
  const body = parseLoopBody(tokens, pos, line, parseStatement);
  if (!isStatement(body)) return body;
  return { kind: "While", condition: cond, body };
}

/**
 * Parse the body of a loop statement: the body statement, then an optional
 * trailing semicolon.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the body.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, breaking mutual recursion.
 * @returns {TuffStatement | TuffError} The body statement, or a TuffError.
 */
function parseLoopBody(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const body = parseStatement(tokens, pos, line);
  if (!isStatement(body)) {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  if (tokens[pos.i]?.kind === "Semicolon") pos.i++;
  return body;
}

/**
 * Parse a `for` statement: `for (name in range) stmt`.
 * @param tokens {TuffToken[]} - The token list; `for` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, breaking mutual recursion.
 * @returns {TuffStatement | TuffError} The For node, or a TuffError.
 */
function parseFor(
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
  const nameTok = tokens[pos.i];
  if (nameTok?.kind !== "Ident") {
    return { kind: "InvalidStatement", token: tokenDetail(nameTok), line };
  }
  pos.i++;
  const inTok = tokens[pos.i];
  if (inTok?.kind !== "Ident" || inTok.name !== "in") {
    return { kind: "InvalidStatement", token: tokenDetail(inTok), line };
  }
  pos.i++;
  const range = parseLevel(tokens, pos, line, 0, parseStatement);
  if (!isExpr(range)) return range;
  if (tokens[pos.i]?.kind !== "RParen") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  const body = parseLoopBody(tokens, pos, line, parseStatement);
  if (!isStatement(body)) return body;
  return { kind: "For", name: nameTok.name, range, body };
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
 * Parse a `type` alias declaration: `type Name = KindName`.
 * @param tokens {TuffToken[]} - The token list; `type` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the declaration.
 * @param line {number} - The 1-based line number.
 * @returns {TuffStatement | TuffError} The Type node, or a TuffError.
 */
function parseType(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  const name = parseDeclName(tokens, pos, line, "Assign");
  if (typeof name !== "string") return name;
  const alias = parseKindName(tokens, pos, line);
  if (!isKindName(alias)) return alias;
  return { kind: "Type", name, alias };
}

/**
 * Parse the name and following token of a declaration: an identifier name
 * followed by an expected token kind.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the name and
 * the expected token.
 * @param line {number} - The 1-based line number.
 * @param expected {string} - The token kind expected after the name.
 * @returns {string | TuffError} The declaration name, or a TuffError.
 */
function parseDeclName(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  expected: string,
): string | TuffError {
  const nameTok = tokens[pos.i];
  if (nameTok?.kind !== "Ident") {
    return { kind: "InvalidStatement", token: tokenDetail(nameTok), line };
  }
  pos.i++;
  if (tokens[pos.i]?.kind !== expected) {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  return nameTok.name;
}

/** A parsed `name : KindName` pair. */
interface TypedName {
  /** The identifier name. */
  name: string;
  /** The declared kind. */
  type: KindName;
}

/**
 * Parse a `name : KindName` pair.
 * @param tokens {TuffToken[]} - The token list; the name token not yet consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the pair.
 * @param line {number} - The 1-based line number.
 * @returns {TypedName | TuffError} The name and kind, or a TuffError.
 */
function parseTypedName(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TypedName | TuffError {
  const name = parseDeclName(tokens, pos, line, "Colon");
  if (typeof name !== "string") return name;
  const type = parseKindName(tokens, pos, line);
  if (!isKindName(type)) return type;
  return { name, type };
}

/**
 * Type guard distinguishing a parsed typed name from a structured error.
 * @param value {TypedName | TuffError} - The value to test.
 * @returns {boolean} True if the value is a typed name.
 */
function isTypedName(value: TypedName | TuffError): value is TypedName {
  return !("kind" in value);
}

/**
 * Parse a `struct` declaration: `struct Name { field : KindName, ... }`.
 * @param tokens {TuffToken[]} - The token list; `struct` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the declaration.
 * @param line {number} - The 1-based line number.
 * @returns {TuffStatement | TuffError} The Struct node, or a TuffError.
 */
function parseStruct(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  const name = parseDeclName(tokens, pos, line, "LBrace");
  if (typeof name !== "string") return name;
  const fields: StructField[] = [];
  for (;;) {
    if (tokens[pos.i]?.kind === "RBrace") break;
    const field = parseTypedName(tokens, pos, line);
    if (!isTypedName(field)) return field;
    fields.push(field);
    if (tokens[pos.i]?.kind === "Comma") {
      pos.i++;
      continue;
    }
    if (tokens[pos.i]?.kind === "RBrace") break;
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  return { kind: "Struct", name, fields };
}

/**
 * Parse a `fn` declaration: `fn name(param : KindName, ...) : KindName =>
 * { ... }`.
 * @param tokens {TuffToken[]} - The token list; `fn` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the
 * declaration.
 * @param line {number} - The 1-based line number.
 * @returns {TuffStatement | TuffError} The Fn node, or a TuffError.
 */
function parseFn(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
): TuffStatement | TuffError {
  const name = parseDeclName(tokens, pos, line, "LParen");
  if (typeof name !== "string") return name;
  const params: FnParam[] = [];
  for (;;) {
    if (tokens[pos.i]?.kind === "RParen") break;
    const param = parseTypedName(tokens, pos, line);
    if (!isTypedName(param)) return param;
    params.push(param);
    if (tokens[pos.i]?.kind === "Comma") {
      pos.i++;
      continue;
    }
    if (tokens[pos.i]?.kind === "RParen") break;
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  let returnType: KindName | undefined;
  if (tokens[pos.i]?.kind === "Colon") {
    pos.i++;
    const parsed = parseKindName(tokens, pos, line);
    if (!isKindName(parsed)) return parsed;
    returnType = parsed;
  }
  if (tokens[pos.i]?.kind !== "Arrow") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  if (tokens[pos.i]?.kind !== "LBrace") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  pos.i++;
  const body = parseBlock(tokens, pos, line, parseStatement);
  if (!isStatement(body) || body.kind !== "Block") {
    return {
      kind: "InvalidStatement",
      token: tokenDetail(tokens[pos.i]),
      line,
    };
  }
  return { kind: "Fn", name, params, returnType, body };
}

/**
 * The statement keywords, mapped to the parser that parses the rest of the
 * statement. A leading identifier that is not in this table starts an
 * assignment or a bare expression.
 */
const KEYWORDS: Record<string, ParseKeyword> = {
  let: parseLet,
  type: parseType,
  struct: parseStruct,
  fn: parseFn,
  return: parseReturn,
  if: parseIf,
  while: parseWhile,
  for: parseFor,
  break: () => ({ kind: "Break" }),
  continue: () => ({ kind: "Continue" }),
};

/**
 * Parse a `return` statement: `return expr`.
 * @param tokens {TuffToken[]} - The token list; `return` already consumed.
 * @param pos {Pos} - The mutable parse position, advanced past the value.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffStatement | TuffError} The Return node, or a TuffError.
 */
function parseReturn(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const value = parseLevel(tokens, pos, line, 0, parseStatement);
  if (!isExpr(value)) return value;
  return { kind: "Return", value };
}

/**
 * Parse an assignment target: an identifier followed by any number of
 * `[index]` suffixes, or a dereference. Returns null when the statement does
 * not begin with a target, so the caller parses it as an expression instead.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the target.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions in an index.
 * @returns {TuffExpr | TuffError | null} The target, a TuffError, or null.
 */
function parseTarget(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffExpr | TuffError | null {
  const token = tokens[pos.i];
  if (token?.kind === "Deref") {
    return parseOperand(tokens, pos, line, parseStatement);
  }
  if (token?.kind !== "Ident") return null;
  pos.i++;
  let target: TuffExpr = { kind: "Identifier", name: token.name };
  while (tokens[pos.i]?.kind === "LBracket") {
    pos.i++;
    const index = parseIndexSuffix(tokens, pos, line, parseStatement);
    if (!isExpr(index)) return index;
    target = { kind: "ArrayIndex", operand: target, index };
  }
  return target;
}

/**
 * Whether an assignment tail (`=` or a compound `op=`) starts at a token.
 * @param token {TuffToken | undefined} - The token to test.
 * @returns {boolean} True if the token opens an assignment.
 */
function startsAssignment(token: TuffToken | undefined): boolean {
  if (!token) return false;
  if (token.kind === "Assign") return true;
  return COMPOUND_OPS.some((op) => op.token === token.kind);
}

/**
 * Whether the statement that just ended is in tail position: the value of its
 * enclosing block or program, so a bare expression there is its value.
 * @param token {TuffToken | undefined} - The token following the statement.
 * @returns {boolean} True at a closing brace or the end of the input.
 */
function inTailPosition(token: TuffToken | undefined): boolean {
  return !token || token.kind === "RBrace";
}

/**
 * Parse a statement that is an assignment or a bare expression. A statement
 * that opens with an assignment target (an identifier or a dereference) is an
 * assignment when an assignment tail follows it, and otherwise is a bare
 * expression only in tail position — elsewhere the incomplete assignment
 * stands, and reports its own error. A statement that opens with anything
 * else is always a bare expression, desugared to a `return`.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the statement.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffStatement | TuffError} The statement node, or a TuffError.
 */
function parseAssignOrExpr(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const start = pos.i;
  const target = parseTarget(tokens, pos, line, parseStatement);
  if (target === null) return parseBareExpr(tokens, pos, line, parseStatement);
  if (!isExpr(target)) return target;
  if (startsAssignment(tokens[pos.i])) {
    return parseAssign(tokens, pos, line, target, parseStatement);
  }
  const afterTarget = pos.i;
  pos.i = start;
  const value = parseLevel(tokens, pos, line, 0, parseStatement);
  if (isExpr(value) && inTailPosition(tokens[pos.i])) {
    return { kind: "Return", value };
  }
  pos.i = afterTarget;
  return parseAssign(tokens, pos, line, target, parseStatement);
}

/**
 * Parse a bare expression statement, desugaring it to a `return`.
 * @param tokens {TuffToken[]} - The token list.
 * @param pos {Pos} - The mutable parse position, advanced past the expression.
 * @param line {number} - The 1-based line number.
 * @param parseStatement {ParseStatement} - The statement parser, for block
 * expressions.
 * @returns {TuffStatement | TuffError} The Return node, or a TuffError.
 */
function parseBareExpr(
  tokens: TuffToken[],
  pos: Pos,
  line: number,
  parseStatement: ParseStatement,
): TuffStatement | TuffError {
  const token = tokens[pos.i];
  const value = parseLevel(tokens, pos, line, 0, parseStatement);
  if (!isExpr(value)) {
    return { kind: "InvalidStatement", token: tokenDetail(token), line };
  }
  return { kind: "Return", value };
}

/**
 * Parse a single statement: a block, a keyword statement, an assignment, or a
 * bare expression.
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
  if (token.kind === "Ident") {
    const keyword = KEYWORDS[token.name];
    if (keyword) {
      pos.i++;
      return keyword(tokens, pos, line, parseStatement);
    }
  }
  return parseAssignOrExpr(tokens, pos, line, parseStatement);
}
