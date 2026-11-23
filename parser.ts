import {
  ok,
  err,
  type Err,
  type ErrorWhere,
  type Result,
  type TuffError,
} from "./errors.ts";

// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | name | "(" expr ")" | "{" body "}"
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface NumberNode {
  kind: "number";
  value: number;
}

interface NegateNode {
  kind: "negate";
  operand: Expr;
}

interface ReferenceNode {
  kind: "reference";
  name: string;
  where: ErrorWhere;
}

/**
 * One operator and its right-hand operand in a chain.
 */
export interface Link {
  /** The operator applied to the running value. */
  op: "+" | "-" | "*";
  /** The right-hand operand. */
  operand: Expr;
  /** Where the operator appears in the token list. */
  where: ErrorWhere;
}

interface ChainNode {
  kind: "chain";
  first: Expr;
  links: Link[];
}

interface LetStatement {
  kind: "let";
  name: string;
  mutable: boolean;
  value: Expr;
}

/**
 * An assignment to a name that an enclosing let statement declared.
 */
export interface AssignStatement {
  /** The statement kind. */
  kind: "assign";
  /** The name being assigned. */
  name: string;
  /** The expression whose value replaces the name's value. */
  value: Expr;
  /** Where the assigned name appears in the token list. */
  where: ErrorWhere;
}

/**
 * A statement inside a block body: a let declaration or an assignment.
 */
export type Statement = LetStatement | AssignStatement;

interface BlockNode {
  kind: "block";
  statements: Statement[];
  result: Expr;
}

/**
 * A parsed expression: a number, a name, a negation, a chain of operators, or a block.
 */
export type Expr =
  | NumberNode
  | NegateNode
  | ReferenceNode
  | ChainNode
  | BlockNode;

interface Parsed {
  value: Expr;
  next: number;
}

interface StatementParsed {
  statement: Statement;
  next: number;
}

type Parse = Result<Parsed, TuffError>;

type ExprRule = (tokens: string[], pos: number, depth: number) => Parse;

const MAX_NESTING_DEPTH = 1000;

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isLetterOrUnderscore(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
}

function isDigits(text: string): boolean {
  return text.length > 0 && [...text].every(isDigit);
}

function isIdentifier(text: string): boolean {
  const chars = [...text];

  return (
    text !== "let" &&
    text !== "mut" &&
    chars.length > 0 &&
    isLetterOrUnderscore(chars[0] ?? "") &&
    chars.every((char) => isLetterOrUnderscore(char) || isDigit(char))
  );
}

function whereAt(tokens: string[], index: number): ErrorWhere {
  return { index, text: tokens[index] ?? "" };
}

/**
 * Builds an InvalidTerm error for a token the grammar does not allow at a position.
 * @param tokens - The token list being parsed.
 * @param index - The position of the unexpected token.
 * @param expected - A description of what the grammar expected there.
 * @param fix - How the user can correct the input.
 * @returns An Err result holding the InvalidTerm error.
 */
export function invalidAt(
  tokens: string[],
  index: number,
  expected: string,
  fix: string,
): Err<TuffError> {
  const where = whereAt(tokens, index);
  const found =
    where.text === "" ? "the end of the input" : JSON.stringify(where.text);

  return err({
    kind: "InvalidTerm",
    why: `Expected ${expected} but found ${found}.`,
    where,
    fix,
  });
}

function termTooLargeAt(tokens: string[], index: number): Err<TuffError> {
  const where = whereAt(tokens, index);

  return err({
    kind: "TermTooLarge",
    why: `${JSON.stringify(where.text)} is larger than ${Number.MAX_SAFE_INTEGER}, so it cannot be stored exactly.`,
    where,
    fix: `Use an integer of at most ${Number.MAX_SAFE_INTEGER}.`,
  });
}

function nestingTooDeepAt(tokens: string[], index: number): Err<TuffError> {
  return err({
    kind: "NestingTooDeep",
    why: `Groups nest deeper than ${MAX_NESTING_DEPTH} levels.`,
    where: whereAt(tokens, index),
    fix: `Reduce the nesting to at most ${MAX_NESTING_DEPTH} levels.`,
  });
}

function operatorAt(
  token: string | undefined,
  allowed: Link["op"][],
): Link["op"] | undefined {
  return allowed.find((candidate) => candidate === token);
}

function parseChain(
  tokens: string[],
  pos: number,
  allowed: Link["op"][],
  operand: (next: number) => Parse,
): Parse {
  const first = operand(pos);

  if (!first.ok) {
    return first;
  }

  const links: Link[] = [];
  let next = first.value.next;
  let op = operatorAt(tokens[next], allowed);

  while (op !== undefined) {
    const right = operand(next + 1);

    if (!right.ok) {
      return right;
    }

    links.push({ op, operand: right.value.value, where: whereAt(tokens, next) });
    next = right.value.next;
    op = operatorAt(tokens[next], allowed);
  }

  return ok({
    value: links.length === 0 ? first.value.value : { kind: "chain", first: first.value.value, links },
    next,
  });
}

function parsePrimary(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  const token = tokens[pos];

  if (token === "(" || token === "{") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const closer = token === "(" ? ")" : "}";
    const inner =
      token === "{"
        ? blockBody(tokens, pos + 1, depth + 1, expr)
        : expr(tokens, pos + 1, depth + 1);

    if (!inner.ok) {
      return inner;
    }

    if (tokens[inner.value.next] !== closer) {
      return invalidAt(
        tokens,
        inner.value.next,
        `'${closer}'`,
        `Close the group with '${closer}'.`,
      );
    }

    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }

  if (token !== undefined && isDigits(token)) {
    if (Number(token) > Number.MAX_SAFE_INTEGER) {
      return termTooLargeAt(tokens, pos);
    }

    return ok({ value: { kind: "number", value: Number(token) }, next: pos + 1 });
  }

  if (token !== undefined && isIdentifier(token)) {
    return ok({ value: { kind: "reference", name: token, where: whereAt(tokens, pos) }, next: pos + 1 });
  }

  return invalidAt(
    tokens,
    pos,
    "a number, a name, '-', or '('",
    "Put a number, a name, a '-' before a number, or a parenthesized expression here.",
  );
}

function parseFactor(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  if (tokens[pos] === "-") {
    const operand = parsePrimary(tokens, pos + 1, depth, expr);

    return operand.ok
      ? ok({ value: { kind: "negate", operand: operand.value.value }, next: operand.value.next })
      : operand;
  }

  return parsePrimary(tokens, pos, depth, expr);
}

function parseTerm(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  return parseChain(tokens, pos, ["*"], (next) =>
    parseFactor(tokens, next, depth, expr),
  );
}

/**
 * Parses a complete expression starting at a token position.
 * @param tokens - The token list to parse.
 * @param pos - The index of the first token of the expression.
 * @param depth - The number of groups enclosing this position.
 * @returns The expression tree and the index of the next unread token, or an error.
 */
export function parseExpr(tokens: string[], pos: number, depth: number): Parse {
  return parseChain(tokens, pos, ["+", "-"], (next) =>
    parseTerm(tokens, next, depth, parseExpr),
  );
}

function parseStatementValue(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
  keyword: string,
): Parse {
  const value = expr(tokens, pos, depth);

  if (!value.ok) {
    return value;
  }

  if (tokens[value.value.next] !== ";") {
    return invalidAt(tokens, value.value.next, "';' after the value", `End the ${keyword} with ';'.`);
  }

  return ok({ value: value.value.value, next: value.value.next + 1 });
}

function parseLet(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Result<StatementParsed, TuffError> {
  const mutable = tokens[pos + 1] === "mut";
  const nameIndex = mutable ? pos + 2 : pos + 1;
  const name = tokens[nameIndex];

  if (name === undefined || !isIdentifier(name)) {
    return invalidAt(tokens, nameIndex, "a name after 'let'", "Write a name such as x after 'let'.");
  }

  if (tokens[nameIndex + 1] !== "=") {
    return invalidAt(tokens, nameIndex + 1, "'=' after the name", "Write '=' and a value after the name.");
  }

  const value = parseStatementValue(tokens, nameIndex + 2, depth, expr, "let statement");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "let", name, mutable, value: value.value.value },
    next: value.value.next,
  });
}

function parseAssign(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Result<StatementParsed, TuffError> {
  const name = tokens[pos] ?? "";
  const value = parseStatementValue(tokens, pos + 2, depth, expr, "assignment");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "assign", name, value: value.value.value, where: whereAt(tokens, pos) },
    next: value.value.next,
  });
}

function startsStatement(tokens: string[], pos: number): boolean {
  const token = tokens[pos];

  return token === "let" || (token !== undefined && isIdentifier(token) && tokens[pos + 1] === "=");
}

/**
 * Parses a block body: any statements followed by the final expression.
 * @param tokens - The token list to parse.
 * @param pos - The index of the first token of the body.
 * @param depth - The number of groups enclosing this position.
 * @param expr - The expression rule used for values and the final expression.
 * @returns The body as an expression, or a block when it has statements.
 */
export function blockBody(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  const statements: Statement[] = [];
  let next = pos;

  while (startsStatement(tokens, next)) {
    const parsed =
      tokens[next] === "let"
        ? parseLet(tokens, next, depth, expr)
        : parseAssign(tokens, next, depth, expr);

    if (!parsed.ok) {
      return parsed;
    }

    statements.push(parsed.value.statement);
    next = parsed.value.next;
  }

  const result = expr(tokens, next, depth);

  if (!result.ok) {
    return result;
  }

  if (statements.length === 0) {
    return result;
  }

  return ok({
    value: { kind: "block", statements, result: result.value.value },
    next: result.value.next,
  });
}
