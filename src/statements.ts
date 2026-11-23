import { ok, type Result, type TuffError } from "./errors.ts";
import { type Statement } from "./ast.ts";
import { isDigits, isIdentifier } from "./tokenizer.ts";
import { whereAt, invalidAt, nestingTooDeepAt, MAX_NESTING_DEPTH, type Parse, type ExprRule } from "./parse-errors.ts";
import { parseCondition } from "./conditions.ts";

interface StatementParsed {
  statement: Statement;
  next: number;
}

interface StatementsParsed {
  statements: Statement[];
  next: number;
}

type StatementsRule = (tokens: string[], pos: number, depth: number, expr: ExprRule) => Result<StatementsParsed, TuffError>;

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
    token === "if" ||
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

// An "if" is a statement when its branches are statement blocks (each ends
// with ";") and the token after the whole if cannot continue an expression.
// A following operator makes the whole if an expression. The else is optional.
function continuesExpression(token: string | undefined): boolean {
  return token === "+" || token === "-" || token === "*";
}

function isBranchStatement(tokens: string[], pos: number): boolean {
  if (tokens[pos] !== "if" || tokens[pos + 1] !== "(") {
    return false;
  }

  const conditionClose = closingOf(tokens, pos + 1, "(", ")");

  if (conditionClose === undefined || tokens[conditionClose + 1] !== "{") {
    return false;
  }

  const thenClose = closingOf(tokens, conditionClose + 1, "{", "}");

  if (thenClose === undefined || tokens[thenClose - 1] !== ";") {
    return false;
  }

  if (tokens[thenClose + 1] !== "else") {
    return !continuesExpression(tokens[thenClose + 1]);
  }

  if (tokens[thenClose + 2] !== "{") {
    return false;
  }

  const elseClose = closingOf(tokens, thenClose + 2, "{", "}");

  if (elseClose === undefined || tokens[elseClose - 1] !== ";") {
    return false;
  }

  return !continuesExpression(tokens[elseClose + 1]);
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

  if (tokens[then.value.next + 1] !== "else") {
    return ok({
      statement: {
        kind: "branch",
        condition: condition.value.value,
        then: then.value.statements,
        otherwise: [],
        where: whereAt(tokens, pos),
      },
      next: then.value.next + 1,
    });
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
