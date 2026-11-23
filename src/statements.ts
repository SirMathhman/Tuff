import { textAt, type Token } from "./tokenizer.ts";
import { ok, type Result, type TuffError } from "./errors.ts";
import { INT_TYPES, type Annotation, type Expr, type Link, type ScalarAnnotation, type Statement } from "./ast.ts";
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

// Parses exactly one statement; see parseOneStatement.
type OneStatementRule = (tokens: Token[], pos: number, depth: number, expr: ExprRule, statementsRule: StatementsRule) => Result<StatementParsed, TuffError>;

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

function scalarAnnotationAt(text: string | undefined): ScalarAnnotation | undefined {
  return text === "Bool" ? "Bool" : INT_TYPES.find((candidate) => candidate === text);
}

interface AnnotationParsed {
  annotation: Annotation;
  // The index just after the annotation.
  next: number;
}

// A let annotation at start: a scalar type such as U8 or Bool, or an array type [Type; length].
function parseAnnotation(tokens: Token[], start: number): Result<AnnotationParsed, TuffError> {
  if (textAt(tokens, start) !== "[") {
    const scalar = scalarAnnotationAt(textAt(tokens, start));

    if (scalar === undefined) {
      return invalidAt(tokens, start, "a type such as U8, Bool, or [Bool; 3]", "Write a sized integer type, Bool, or [Type; length] after ':'.");
    }

    return ok({ annotation: scalar, next: start + 1 });
  }

  const element = scalarAnnotationAt(textAt(tokens, start + 1));

  if (element === undefined) {
    return invalidAt(tokens, start + 1, "an element type such as U8 or Bool", "Write a sized integer type or Bool as the element type.");
  }

  if (textAt(tokens, start + 2) !== ";") {
    return invalidAt(tokens, start + 2, "';' after the element type", "Write the array type as [Type; length].");
  }

  const length = textAt(tokens, start + 3);

  if (!isDigits(length)) {
    return invalidAt(tokens, start + 3, "the number of elements", "Write the number of elements after ';'.");
  }

  if (textAt(tokens, start + 4) !== "]") {
    return invalidAt(tokens, start + 4, "']' after the length", "Close the array type with ']'.");
  }

  return ok({ annotation: { element, length: Number(length) }, next: start + 5 });
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

  let annotation: Annotation | undefined;
  let equalsIndex = nameIndex + 1;

  if (textAt(tokens, nameIndex + 1) === ":") {
    const parsedType = parseAnnotation(tokens, nameIndex + 2);

    if (!parsedType.ok) {
      return parsedType;
    }

    annotation = parsedType.value.annotation;
    equalsIndex = parsedType.value.next;
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

// The "(condition)" after if or while, then its body.
interface ConditionBody {
  condition: Expr;
  body: BodyParsed;
}

function parseConditionBody(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
  oneRule: OneStatementRule,
): Result<ConditionBody, TuffError> {
  if (depth >= MAX_NESTING_DEPTH) {
    return nestingTooDeepAt(tokens, pos);
  }

  const condition = parseCondition(tokens, pos, depth, expr);

  if (!condition.ok) {
    return condition;
  }

  const body = parseBody(tokens, condition.value.next, depth, expr, statementsRule, oneRule);

  if (!body.ok) {
    return body;
  }

  return ok({ condition: condition.value.value, body: body.value });
}

// while (condition) body: runs the body while the condition holds.
function parseWhile(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
  oneRule: OneStatementRule,
): Result<StatementParsed, TuffError> {
  const loop = parseConditionBody(tokens, pos, depth, expr, statementsRule, oneRule);

  if (!loop.ok) {
    return loop;
  }

  return ok({
    statement: { kind: "while", condition: loop.value.condition, body: loop.value.body.statements, where: whereAt(tokens, pos) },
    next: loop.value.body.next,
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

// A field assignment such as pt.x = 5; : a name, a field name, and "=" after the dot.
function isFieldAssign(tokens: Token[], pos: number): boolean {
  return isIdentifier(textAt(tokens, pos)) && textAt(tokens, pos + 1) === "." && isIdentifier(textAt(tokens, pos + 2)) && textAt(tokens, pos + 3) === "=";
}

function parseFieldAssign(tokens: Token[], pos: number, depth: number, expr: ExprRule): Result<StatementParsed, TuffError> {
  const value = parseStatementValue(tokens, pos + 4, depth, expr, "field assignment");

  if (!value.ok) {
    return value;
  }

  return ok({
    statement: { kind: "fieldAssign", name: textAt(tokens, pos), field: textAt(tokens, pos + 2), value: value.value.value, where: whereAt(tokens, pos) },
    next: value.value.next,
  });
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
    (token !== undefined && isIdentifier(token) && (textAt(tokens, pos + 1) === "=" || isCompoundAssign(tokens, pos) || isFieldAssign(tokens, pos)))
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
  if (textAt(tokens, open) !== "{" || (!startsStatement(tokens, open + 1) && !isIfStatement(tokens, open + 1))) {
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

type IfEndRule = (tokens: Token[], pos: number) => number | undefined;

interface BodyEnd {
  // The index just after the body.
  next: number;
  // True for a { } block, whose last statement must end with ";" to count as a statement.
  braced: boolean;
}

// The index just after a statement that ends at its first ";" outside any brackets, or undefined.
function simpleStatementEnd(tokens: Token[], start: number): number | undefined {
  let depth = 0;
  let index = start;

  while (index < tokens.length) {
    const token = textAt(tokens, index);

    if (token === "(" || token === "[" || token === "{") {
      depth += 1;
    } else if (token === ")" || token === "]" || token === "}") {
      depth -= 1;

      if (depth < 0) {
        return undefined;
      }
    } else if (token === ";" && depth === 0) {
      return index + 1;
    }

    index += 1;
  }

  return undefined;
}

// Where the body that starts at start ends. An if inside the body is measured by ifRule, which is passed in
// rather than named, so the recursion does not close a cycle of functions.
function bodyEnd(tokens: Token[], start: number, ifRule: IfEndRule): BodyEnd | undefined {
  const token = textAt(tokens, start);

  if (token === "{") {
    const close = closingOf(tokens, start, "{", "}");

    return close === undefined ? undefined : { next: close + 1, braced: true };
  }

  if (token === "if") {
    const end = ifRule(tokens, start);

    return end === undefined ? undefined : { next: end, braced: false };
  }

  if (token === "while") {
    const closing = closingOf(tokens, start + 1, "(", ")");
    const body = closing === undefined ? undefined : bodyEnd(tokens, closing + 1, ifRule);

    return body === undefined ? undefined : { next: body.next, braced: false };
  }

  if (token === "let" || startsStatement(tokens, start) || isElementAssign(tokens, start) || isDerefAssign(tokens, start)) {
    const end = simpleStatementEnd(tokens, start);

    return end === undefined ? undefined : { next: end, braced: false };
  }

  return undefined;
}

// The index just after the if statement at pos, or undefined when the tokens there are not an if
// statement. An if whose branches begin like an expression, such as if (c) 1 else 2, is not a statement.
// The then and else branches may each be a block or one statement, including let, which parseBody rejects.
function ifStatementEnd(tokens: Token[], pos: number): number | undefined {
  if (textAt(tokens, pos) !== "if" || textAt(tokens, pos + 1) !== "(") {
    return undefined;
  }

  const closing = closingOf(tokens, pos + 1, "(", ")");

  if (closing === undefined) {
    return undefined;
  }

  const then = bodyEnd(tokens, closing + 1, ifStatementEnd);

  if (then === undefined || (then.braced && textAt(tokens, then.next - 2) !== ";")) {
    return undefined;
  }

  if (textAt(tokens, then.next) !== "else") {
    return continuesExpression(textAt(tokens, then.next)) ? undefined : then.next;
  }

  const otherwise = bodyEnd(tokens, then.next + 1, ifStatementEnd);

  if (otherwise === undefined || (otherwise.braced && textAt(tokens, otherwise.next - 2) !== ";")) {
    return undefined;
  }

  return continuesExpression(textAt(tokens, otherwise.next)) ? undefined : otherwise.next;
}

function isIfStatement(tokens: Token[], pos: number): boolean {
  return ifStatementEnd(tokens, pos) !== undefined;
}

// A branch or loop body: a block's statements, or one unbraced statement other than let.
interface BodyParsed {
  statements: Statement[];
  // The index just after the body.
  next: number;
}

function parseBody(
  tokens: Token[],
  start: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
  oneRule: OneStatementRule,
): Result<BodyParsed, TuffError> {
  if (textAt(tokens, start) === "{") {
    const body = statementsRule(tokens, start + 1, depth + 1, expr);

    if (!body.ok) {
      return body;
    }

    if (textAt(tokens, body.value.next) !== "}") {
      return invalidAt(tokens, body.value.next, "'}' after the statements", "Close the statement block with '}'.");
    }

    return ok({ statements: body.value.statements, next: body.value.next + 1 });
  }

  if (textAt(tokens, start) === "let") {
    return invalidAt(tokens, start, "a statement other than let as the body", "Wrap the let in braces, or use a statement that does not bind a name.");
  }

  const single = oneRule(tokens, start, depth + 1, expr, statementsRule);

  if (!single.ok) {
    return single;
  }

  return ok({ statements: [single.value.statement], next: single.value.next });
}

// if (condition) body, with an optional else body; each body is braced or one unbraced statement.
function parseBranchStatement(
  tokens: Token[],
  pos: number,
  depth: number,
  expr: ExprRule,
  statementsRule: StatementsRule,
  oneRule: OneStatementRule,
): Result<StatementParsed, TuffError> {
  const head = parseConditionBody(tokens, pos, depth, expr, statementsRule, oneRule);

  if (!head.ok) {
    return head;
  }

  const then = head.value.body;

  if (textAt(tokens, then.next) !== "else") {
    return ok({
      statement: { kind: "branch", condition: head.value.condition, then: then.statements, otherwise: [], where: whereAt(tokens, pos) },
      next: then.next,
    });
  }

  const otherwise = parseBody(tokens, then.next + 1, depth, expr, statementsRule, oneRule);

  if (!otherwise.ok) {
    return otherwise;
  }

  return ok({
    statement: {
      kind: "branch",
      condition: head.value.condition,
      then: then.statements,
      otherwise: otherwise.value.statements,
      where: whereAt(tokens, pos),
    },
    next: otherwise.value.next,
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
    return parseBranchStatement(tokens, pos, depth, expr, statementsRule, parseOneStatement);
  }

  if (token === "while") {
    return parseWhile(tokens, pos, depth, expr, statementsRule, parseOneStatement);
  }

  if (token === "{") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }

    const block = parseBody(tokens, pos, depth, expr, statementsRule, parseOneStatement);

    if (!block.ok) {
      return block;
    }

    return ok({ statement: { kind: "scope", statements: block.value.statements }, next: block.value.next });
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

  if (isFieldAssign(tokens, pos)) {
    return parseFieldAssign(tokens, pos, depth, expr);
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

  while (startsStatement(tokens, next) || isElementAssign(tokens, next) || isDerefAssign(tokens, next) || isStatementBlock(tokens, next) || isIfStatement(tokens, next)) {
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
