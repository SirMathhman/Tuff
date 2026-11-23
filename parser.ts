import {
  ok,
  err,
  type Err,
  type ErrorWhere,
  type Result,
  type TuffError,
} from "./errors.ts";
import { type Expr, type Link, type Statement } from "./ast.ts";

// Grammar, implemented by the functions below:
//   program   := body
//   body      := statement* expr
//   statement := "let" "mut"? name "=" expr ";" | name "=" expr ";" | "{" statement* "}"
//   expr      := term (("+" | "-") term)*
//   term      := factor ("*" factor)*
//   factor    := "-"? primary
//   primary   := number | "true" | "false" | name | "(" expr ")" | "{" body "}"
//              | "if" "(" expr ")" expr "else" expr
// A name starts with a letter or underscore and continues with letters,
// digits, or underscores; "let" and "mut" are reserved. The parser builds an
// AST; the evaluator computes its value. primary receives expr as a parameter,
// so the rules form no static cycle.

interface Parsed {
  value: Expr;
  next: number;
}

interface StatementParsed {
  statement: Statement;
  next: number;
}

interface StatementsParsed {
  statements: Statement[];
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
    text !== "if" &&
    text !== "else" &&
    text !== "true" &&
    text !== "false" &&
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

  if (token === "true" || token === "false") {
    return ok({ value: { kind: "boolean", value: token === "true" }, next: pos + 1 });
  }

  if (token === "if") {
    return parseIf(tokens, pos, depth, expr);
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

function parseCondition(tokens: string[], pos: number, depth: number, expr: ExprRule): Parse {
  if (tokens[pos + 1] !== "(") {
    return invalidAt(tokens, pos + 1, "'(' after 'if'", "Write the condition in parentheses after 'if'.");
  }

  const condition = expr(tokens, pos + 2, depth + 1);

  if (!condition.ok) {
    return condition;
  }

  if (tokens[condition.value.next] !== ")") {
    return invalidAt(tokens, condition.value.next, "')' after the condition", "Close the condition with ')'.");
  }

  return ok({ value: condition.value.value, next: condition.value.next + 1 });
}

function parseIf(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const condition = parseCondition(tokens, pos, depth, expr);

  if (!condition.ok) {
    return condition;
  }

  const then = expr(tokens, condition.value.next, depth);

  if (!then.ok) {
    return then;
  }

  if (tokens[then.value.next] !== "else") {
    return invalidAt(tokens, then.value.next, "'else' after the then branch", "Every if needs an else branch.");
  }

  const otherwise = expr(tokens, then.value.next + 1, depth);

  if (!otherwise.ok) {
    return otherwise;
  }

  return ok({
    value: {
      kind: "if",
      condition: condition.value.value,
      then: then.value.value,
      otherwise: otherwise.value.value,
      where: whereAt(tokens, pos),
    },
    next: otherwise.value.next,
  });
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
      ? ok({ value: { kind: "negate", operand: operand.value.value, where: whereAt(tokens, pos) }, next: operand.value.next })
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

function closingOf(tokens: string[], open: number, opener: string, closer: string): number | undefined {
  let level = 0;
  let index = open;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token === opener) {
      level += 1;
    }

    if (token === closer) {
      level -= 1;
    }

    if (level === 0) {
      return index;
    }

    index += 1;
  }

  return undefined;
}

function canFollowStatementBlock(token: string | undefined): boolean {
  return (
    token === "let" ||
    token === "(" ||
    token === "{" ||
    token === "}" ||
    (token !== undefined && (isDigits(token) || isIdentifier(token)))
  );
}

// A "{" starts a statement block when its contents begin with a statement and
// the token after its closing "}" can start a statement, an expression, or end
// an enclosing block. A block followed by an operator is a value, as in
// "{ let x = 2; x } * 4".
function isStatementBlock(tokens: string[], open: number): boolean {
  if (tokens[open] !== "{" || !startsStatement(tokens, open + 1)) {
    return false;
  }

  const close = closingOf(tokens, open, "{", "}");

  if (close === undefined) {
    return false;
  }

  const follower = tokens[close + 1];

  if (follower === undefined) {
    return tokens[close - 1] === ";";
  }

  return canFollowStatementBlock(follower);
}

type StatementsRule = (tokens: string[], pos: number, depth: number, expr: ExprRule) => Result<StatementsParsed, TuffError>;

// An "if" is a statement when both branches are statement blocks (each ends
// with ";") and the token after the else block cannot continue an expression.
// A following operator makes the whole if an expression, as with statement blocks.
function isBranchStatement(tokens: string[], pos: number): boolean {
  if (tokens[pos] !== "if" || tokens[pos + 1] !== "(") {
    return false;
  }

  const conditionClose = closingOf(tokens, pos + 1, "(", ")");

  if (conditionClose === undefined || tokens[conditionClose + 1] !== "{") {
    return false;
  }

  const thenClose = closingOf(tokens, conditionClose + 1, "{", "}");

  if (thenClose === undefined || tokens[thenClose + 1] !== "else" || tokens[thenClose + 2] !== "{") {
    return false;
  }

  const elseClose = closingOf(tokens, thenClose + 2, "{", "}");

  if (elseClose === undefined || tokens[thenClose - 1] !== ";" || tokens[elseClose - 1] !== ";") {
    return false;
  }

  const follower = tokens[elseClose + 1];

  return follower !== "+" && follower !== "-" && follower !== "*";
}

function parseBranchStatement(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
): Result<StatementParsed, TuffError> {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const condition = parseCondition(tokens, pos, depth, expr);

  if (!condition.ok) {
    return condition;
  }

  const then = statementsRule(tokens, condition.value.next + 1, depth + 1, expr);

  if (!then.ok) {
    return then;
  }

  const otherwise = statementsRule(tokens, then.value.next + 3, depth + 1, expr);

  if (!otherwise.ok) {
    return otherwise;
  }

  return ok({
    statement: {
      kind: "branch",
      condition: condition.value.value,
      then: then.value.statements,
      otherwise: otherwise.value.statements,
      where: whereAt(tokens, pos),
    },
    next: otherwise.value.next + 1,
  });
}

function parseStatementList(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Result<StatementsParsed, TuffError> {
  const statements: Statement[] = [];
  let next = pos;

  while (startsStatement(tokens, next) || isStatementBlock(tokens, next) || isBranchStatement(tokens, next)) {
    if (tokens[next] === "if") {
      const branch = parseBranchStatement(tokens, next, depth, expr, parseStatementList);

      if (!branch.ok) {
        return branch;
      }

      statements.push(branch.value.statement);
      next = branch.value.next;
    } else if (tokens[next] === "{") {
      if (depth >= MAX_NESTING_DEPTH) {
        return nestingTooDeepAt(tokens, next);
      }

      const body = parseStatementList(tokens, next + 1, depth + 1, expr);

      if (!body.ok) {
        return body;
      }

      if (tokens[body.value.next] !== "}") {
        return invalidAt(tokens, body.value.next, "'}' after the statements", "Close the statement block with '}'.");
      }

      statements.push({ kind: "scope", statements: body.value.statements });
      next = body.value.next + 1;
    } else {
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
  }

  return ok({ statements, next });
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
  const list = parseStatementList(tokens, pos, depth, expr);

  if (!list.ok) {
    return list;
  }

  const { statements } = list.value;

  if (depth === 0 && list.value.next === tokens.length && statements.length > 0) {
    return ok({
      value: { kind: "block", statements, result: { kind: "number", value: 0 } },
      next: list.value.next,
    });
  }

  const result = expr(tokens, list.value.next, depth);

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
