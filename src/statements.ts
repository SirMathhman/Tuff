import { textAt, type Token } from "./tokenizer.ts";
import { ok, type Result, type TuffError } from "./errors.ts";
import { INT_TYPES, type Expr, type IntType, type Link, type Statement } from "./ast.ts";
import { intLiteralType, isDigits, isIdentifier } from "./tokenizer.ts";
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

type StatementsRule = (tokens: Token[], pos: number, depth: number, expr: ExprRule) => Result<StatementsParsed, TuffError>;

function parseStatementValue(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  keyword: string,
): Parse {
  const value = expr(tokens, pos, depth);

  if (!value.ok) {
    return value;
  }

  if (textAt(tokens, value.value.next) !== ";") {
    return invalidAt(tokens, value.value.next, "';' after the value", `End the ${keyword} with ';'.`);
  }

  return ok({ value: value.value.value, next: value.value.next + 1 });
}

function parseLet(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Result<StatementParsed, TuffError> {
  const mutable = textAt(tokens, pos + 1) === "mut";
  const nameIndex = mutable ? pos + 2 : pos + 1;
  const name = textAt(tokens, nameIndex);

  if (name === undefined || !isIdentifier(name)) {
    return invalidAt(tokens, nameIndex, "a name after 'let'", "Write a name such as x after 'let'.");
  }

  let annotation: IntType | undefined;
  let equalsIndex = nameIndex + 1;

  if (textAt(tokens, nameIndex + 1) === ":") {
    const typeText = textAt(tokens, nameIndex + 2);

    annotation = INT_TYPES.find((candidate) => candidate === typeText);

    if (annotation === undefined) {
      return invalidAt(tokens, nameIndex + 2, "a sized integer type such as U8", "Write one of U8, U16, U32, U64, I8, I16, I32, or I64 after ':'.");
    }

    equalsIndex = nameIndex + 3;
  }

  if (textAt(tokens, equalsIndex) !== "=") {
    return invalidAt(tokens, equalsIndex, "'=' after the name", "Write '=' and a value after the name.");
  }

  const value = parseStatementValue(tokens, equalsIndex + 1, depth, expr, "let statement");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "let", name, mutable, annotation, value: value.value.value, where: whereAt(tokens, nameIndex) },
    next: value.value.next,
  });
}

function parseAssign(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Result<StatementParsed, TuffError> {
  const name = textAt(tokens, pos) ?? "";
  const value = parseStatementValue(tokens, pos + 2, depth, expr, "assignment");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "assign", name, value: value.value.value, where: whereAt(tokens, pos) },
    next: value.value.next,
  });
}

// x op= value; reads x, applies op, and assigns the result: the same as x = x op value;.
function parseCompoundAssign(tokens: Token[], pos: number, depth: number, expr: ExprRule): Result<StatementParsed, TuffError> {
  const op = compoundOpAt(textAt(tokens, pos + 1));

  if (op === undefined) {
    return invalidAt(tokens, pos + 1, "a compound operator", "Use +=, -=, *=, or /=.");
  }

  const value = parseStatementValue(tokens, pos + 2, depth, expr, "assignment");

  if (!value.ok) {
    return value;
  }

  const name = textAt(tokens, pos);
  const where = whereAt(tokens, pos);
  const read = { kind: "reference" as const, name, where };
  const link = { op, operand: value.value.value, where: whereAt(tokens, pos + 1) };

  return ok({
    statement: { kind: "assign", name, value: { kind: "chain", first: read, links: [link] }, where },
    next: value.value.next,
  });
}

// while (condition) { body }: runs the body while the condition holds.
// while (condition) { body }, or while (condition) statement; with one unbraced statement as the body.
function parseWhile(tokens: Token[], pos: number, depth: number, expr: ExprRule, statementsRule: StatementsRule): Result<StatementParsed, TuffError> {
  const closing = closingOf(tokens, pos + 1, "(", ")");

  if (closing !== undefined && textAt(tokens, closing + 1) === "{") {
    const loop = parseConditionBody(tokens, pos, depth, expr, statementsRule);

    if (!loop.ok) {
      return loop;
    }

    if (textAt(tokens, loop.value.next) !== "}") {
      return invalidAt(tokens, loop.value.next, "'}' after the loop body", "Close the loop body with '}'.");
    }

    return ok({
      statement: { kind: "while", condition: loop.value.condition, body: loop.value.statements, where: whereAt(tokens, pos) },
      next: loop.value.next + 1,
    });
  }

  const condition = parseCondition(tokens, pos, depth, expr);

  if (!condition.ok) {
    return condition;
  }

  if (textAt(tokens, condition.value.next) === "let") {
    return invalidAt(tokens, condition.value.next, "a statement other than let as the loop body", "Wrap the let in braces, or use a statement that does not bind a name.");
  }

  const single = parseOneStatement(tokens, condition.value.next, depth + 1, expr, statementsRule);

  if (!single.ok) {
    return single;
  }

  return ok({
    statement: { kind: "while", condition: condition.value.value, body: [single.value.statement], where: whereAt(tokens, pos) },
    next: single.value.next,
  });
}

// An assignment to one element, as in array[0] = 5; : a name, a bracketed index, and "=".
function isElementAssign(tokens: Token[], pos: number): boolean {
  if (!isIdentifier(textAt(tokens, pos)) || textAt(tokens, pos + 1) !== "[") {
    return false;
  }

  const closing = closingOf(tokens, pos + 1, "[", "]");

  return closing !== undefined && textAt(tokens, closing + 1) === "=";
}

// A write through a reference: *name = expr;
function isDerefAssign(tokens: Token[], pos: number): boolean {
  return textAt(tokens, pos) === "*" && isIdentifier(textAt(tokens, pos + 1)) && textAt(tokens, pos + 2) === "=";
}

function parseDerefAssign(tokens: Token[], pos: number, depth: number, expr: ExprRule): Result<StatementParsed, TuffError> {
  const value = parseStatementValue(tokens, pos + 3, depth, expr, "assignment");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "derefAssign", name: textAt(tokens, pos + 1), value: value.value.value, where: whereAt(tokens, pos) },
    next: value.value.next,
  });
}

function parseElementAssign(tokens: Token[], pos: number, depth: number, expr: ExprRule): Result<StatementParsed, TuffError> {
  const closing = closingOf(tokens, pos + 1, "[", "]") ?? pos + 1;
  const index = expr(tokens, pos + 2, depth + 1);

  if (!index.ok) {
    return index;
  }

  if (index.value.next !== closing) {
    return invalidAt(tokens, index.value.next, "']' after the index", "Close the index with ']'.");
  }

  const value = parseStatementValue(tokens, closing + 2, depth, expr, "element assignment");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "element", name: textAt(tokens, pos), index: index.value.value, value: value.value.value, where: whereAt(tokens, pos) },
    next: value.value.next,
  });
}

function compoundOpAt(token: string | undefined): Link["op"] | undefined {
  return token === "+=" ? "+" : token === "-=" ? "-" : token === "*=" ? "*" : token === "/=" ? "/" : undefined;
}

// A compound assignment such as x += 1; : a name followed by an operator and "=".
function isCompoundAssign(tokens: Token[], pos: number): boolean {
  return isIdentifier(textAt(tokens, pos)) && compoundOpAt(textAt(tokens, pos + 1)) !== undefined;
}

function startsStatement(tokens: Token[], pos: number): boolean {
  const token = textAt(tokens, pos);

  return (
    token === "let" ||
    token === "while" ||
    (token !== undefined && isIdentifier(token) && (textAt(tokens, pos + 1) === "=" || isCompoundAssign(tokens, pos)))
  );
}

function closingOf(tokens: Token[], open: number, opener: string, closer: string): number | undefined {
  let level = 0;
  let index = open;

  while (index < tokens.length) {
    const token = textAt(tokens, index);

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
    token === "while" ||
    (token !== undefined && (isDigits(token) || intLiteralType(token) !== undefined || isIdentifier(token)))
  );
}

// A "{" starts a statement block when its contents begin with a statement and
// the token after its closing "}" can start a statement, an expression, or end
// an enclosing block. A block followed by an operator is a value, as in
// "{ let x = 2; x } * 4".
function isStatementBlock(tokens: Token[], open: number): boolean {
  if (textAt(tokens, open) !== "{" || (!startsStatement(tokens, open + 1) && !isBranchStatement(tokens, open + 1))) {
    return false;
  }

  const close = closingOf(tokens, open, "{", "}");

  if (close === undefined) {
    return false;
  }

  const follower = textAt(tokens, close + 1);

  if (close + 1 >= tokens.length) {
    return textAt(tokens, close - 1) === ";";
  }

  return canFollowStatementBlock(follower);
}

// An "if" is a statement when its branches are statement blocks (each ends
// with ";") and the token after the whole if cannot continue an expression.
// A following operator makes the whole if an expression. The else is optional.
function continuesExpression(token: string | undefined): boolean {
  return token === "+" || token === "-" || token === "*";
}

function isBranchStatement(tokens: Token[], pos: number): boolean {
  if (textAt(tokens, pos) !== "if" || textAt(tokens, pos + 1) !== "(") {
    return false;
  }

  const conditionClose = closingOf(tokens, pos + 1, "(", ")");

  if (conditionClose === undefined || textAt(tokens, conditionClose + 1) !== "{") {
    return false;
  }

  const thenClose = closingOf(tokens, conditionClose + 1, "{", "}");

  if (thenClose === undefined || textAt(tokens, thenClose - 1) !== ";") {
    return false;
  }

  if (textAt(tokens, thenClose + 1) !== "else") {
    return !continuesExpression(textAt(tokens, thenClose + 1));
  }

  if (textAt(tokens, thenClose + 2) !== "{") {
    return false;
  }

  const elseClose = closingOf(tokens, thenClose + 2, "{", "}");

  if (elseClose === undefined || textAt(tokens, elseClose - 1) !== ";") {
    return false;
  }

  return !continuesExpression(textAt(tokens, elseClose + 1));
}

interface ConditionBody {
  condition: Expr;
  statements: Statement[];
  // The index of the closing "}" of the body.
  next: number;
}

// The "(condition)" after if or while, then its "{ statements }" body.
function parseConditionBody(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
): Result<ConditionBody, TuffError> {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const condition = parseCondition(tokens, pos, depth, expr);

  if (!condition.ok) {
    return condition;
  }

  const body = statementsRule(tokens, condition.value.next + 1, depth + 1, expr);

  if (!body.ok) {
    return body;
  }

  return ok({ condition: condition.value.value, statements: body.value.statements, next: body.value.next });
}

function parseBranchStatement(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
): Result<StatementParsed, TuffError> {
  const then = parseConditionBody(tokens, pos, depth, expr, statementsRule);

  if (!then.ok) {
    return then;
  }

  if (textAt(tokens, then.value.next + 1) !== "else") {
    return ok({
      statement: {
        kind: "branch",
        condition: then.value.condition,
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
      condition: then.value.condition,
      then: then.value.statements,
      otherwise: otherwise.value.statements,
      where: whereAt(tokens, pos),
    },
    next: otherwise.value.next + 1,
  });
}

// Parses exactly one statement at pos. Branches, loops, and blocks parse their bodies with statementsRule.
function parseOneStatement(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
): Result<StatementParsed, TuffError> {
  const token = textAt(tokens, pos);

  if (token === "if") {
    return parseBranchStatement(tokens, pos, depth, expr, statementsRule);
  }

  if (token === "while") {
    return parseWhile(tokens, pos, depth, expr, statementsRule);
  }

  if (token === "{") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const body = statementsRule(tokens, pos + 1, depth + 1, expr);

    if (!body.ok) {
      return body;
    }

    if (textAt(tokens, body.value.next) !== "}") {
      return invalidAt(tokens, body.value.next, "'}' after the statements", "Close the statement block with '}'.");
    }

    return ok({ statement: { kind: "scope", statements: body.value.statements }, next: body.value.next + 1 });
  }

  if (token === "let") {
    return parseLet(tokens, pos, depth, expr);
  }

  if (isElementAssign(tokens, pos)) {
    return parseElementAssign(tokens, pos, depth, expr);
  }

  if (isDerefAssign(tokens, pos)) {
    return parseDerefAssign(tokens, pos, depth, expr);
  }

  if (isCompoundAssign(tokens, pos)) {
    return parseCompoundAssign(tokens, pos, depth, expr);
  }

  return parseAssign(tokens, pos, depth, expr);
}

function parseStatementList(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Result<StatementsParsed, TuffError> {
  const statements: Statement[] = [];
  let next = pos;

  while (startsStatement(tokens, next) || isElementAssign(tokens, next) || isDerefAssign(tokens, next) || isStatementBlock(tokens, next) || isBranchStatement(tokens, next)) {
    const parsed = parseOneStatement(tokens, next, depth, expr, parseStatementList);

    if (!parsed.ok) {
      return parsed;
    }

    statements.push(parsed.value.statement);
    next = parsed.value.next;
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
  tokens: Token[],
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
