import {
  NodeKind,
  Operator,
  StatementKind,
  type AssignStatement,
  type AssignThroughStatement,
  type BlockNode,
  type BooleanNode,
  type BorrowNode,
  type ChainNode,
  type ChainStep,
  type DerefNode,
  type Expr,
  type IfNode,
  type MatchArm,
  type MatchNode,
  type LetStatement,
  type LiteralNode,
  type NameNode,
  type Statement,
} from "./ast.ts";
import { TuffErrorKind, type TuffError } from "./errors.ts";
import type { Token } from "./lexer.ts";
import { err, ok, type Result } from "./result.ts";
import type { Span } from "./span.ts";

interface Input {
  tokens: Token[];
  end: Span;
}

interface Parsed<T> {
  value: T;
  next: number;
}

type Step<T> = Result<Parsed<T>, TuffError>;
type Parser = (input: Input, pos: number, depth: number) => Step<Expr>;

const MAX_NESTING_DEPTH = 256;
const RESERVED = new Set<string>(["let", "mut", "true", "false", "if", "else", "match", "case"]);
const ADDITIVE = new Map<string, Operator>([
  ["+", Operator.Add],
  ["-", Operator.Subtract],
]);
const MULTIPLICATIVE = new Map<string, Operator>([
  ["*", Operator.Multiply],
  ["/", Operator.Divide],
]);

function isName(text: string): boolean {
  return /^[A-Za-z]+$/.test(text) && !RESERVED.has(text);
}

function parseLet(input: Input, pos: number, depth: number, names: Set<string>, parseExpr: Parser): Step<LetStatement> {
  const mutable = input.tokens[pos + 1]?.text === "mut";
  const nameToken = input.tokens[pos + (mutable ? 2 : 1)];
  if (nameToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (!isName(nameToken.text)) return err({ kind: TuffErrorKind.UnexpectedToken, span: nameToken.span });
  if (names.has(nameToken.text)) return err({ kind: TuffErrorKind.DuplicateName, span: nameToken.span });
  names.add(nameToken.text);

  const equalsPos = pos + (mutable ? 3 : 2);
  const equals = input.tokens[equalsPos];
  if (equals === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (equals.text !== "=") return err({ kind: TuffErrorKind.UnexpectedToken, span: equals.span });

  const rhs = parseExpr(input, equalsPos + 1, depth);
  if (!rhs.ok) return rhs;
  const semicolon = input.tokens[rhs.value.next];
  if (semicolon === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (semicolon.text !== ";") return err({ kind: TuffErrorKind.UnexpectedToken, span: semicolon.span });
  const statement: LetStatement = {
    kind: StatementKind.Let,
    name: nameToken.text,
    span: nameToken.span,
    mutable,
    value: rhs.value.value,
  };
  return ok({ value: statement, next: rhs.value.next + 1 });
}

function parseAssign(input: Input, pos: number, depth: number, parseExpr: Parser): Step<AssignStatement> {
  const nameToken = input.tokens[pos];
  if (nameToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  const rhs = parseExpr(input, pos + 2, depth);
  if (!rhs.ok) return rhs;
  const semicolon = input.tokens[rhs.value.next];
  if (semicolon === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (semicolon.text !== ";") return err({ kind: TuffErrorKind.UnexpectedToken, span: semicolon.span });
  const target: NameNode = { kind: NodeKind.Name, name: nameToken.text, span: nameToken.span };
  const statement: AssignStatement = { kind: StatementKind.Assign, target, value: rhs.value.value };
  return ok({ value: statement, next: rhs.value.next + 1 });
}

/**
 * Parses the rest of a write through a dereference, `*P = value;`, once the dereference and the `=` are seen.
 *
 * @param input - The tokens being parsed.
 * @param deref - The dereference already parsed on the left of the `=`.
 * @param equalsPos - The position of the `=` token.
 * @param depth - The current nesting depth.
 * @param parseExpr - The expression parser for the right-hand side.
 * @returns The write-through statement, or the first syntax error found.
 */
function parseAssignThrough(
  input: Input,
  deref: DerefNode,
  equalsPos: number,
  depth: number,
  parseExpr: Parser,
): Step<AssignThroughStatement> {
  const rhs = parseExpr(input, equalsPos + 1, depth);
  if (!rhs.ok) return rhs;
  const semicolon = input.tokens[rhs.value.next];
  if (semicolon === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (semicolon.text !== ";") return err({ kind: TuffErrorKind.UnexpectedToken, span: semicolon.span });
  const statement: AssignThroughStatement = {
    kind: StatementKind.AssignThrough,
    span: deref.span,
    target: deref.operand,
    value: rhs.value.value,
  };
  return ok({ value: statement, next: rhs.value.next + 1 });
}

function parseBlock(
  input: Input,
  pos: number,
  depth: number,
  parseExpr: Parser,
  closer: string | undefined,
): Step<BlockNode> {
  const statements: Statement[] = [];
  const names = new Set<string>();
  let cursor = pos;
  for (;;) {
    const token = input.tokens[cursor];
    if (token === undefined || token.text === closer) {
      if (closer !== undefined) {
        // A braced block must end in a final expression, so the closing bracket is where one was expected.
        return token === undefined
          ? err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end })
          : err({ kind: TuffErrorKind.UnexpectedToken, span: token.span });
      }
      if (statements.length === 0) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
      const block: BlockNode = { kind: NodeKind.Block, statements, result: undefined };
      return ok({ value: block, next: cursor });
    }
    if (token.text === "let") {
      const statement = parseLet(input, cursor, depth, names, parseExpr);
      if (!statement.ok) return statement;
      statements.push(statement.value.value);
      cursor = statement.value.next;
      continue;
    }
    if (isName(token.text) && input.tokens[cursor + 1]?.text === "=") {
      const statement = parseAssign(input, cursor, depth, parseExpr);
      if (!statement.ok) return statement;
      statements.push(statement.value.value);
      cursor = statement.value.next;
      continue;
    }

    const result = parseExpr(input, cursor, depth);
    if (!result.ok) return result;
    const expr = result.value.value;
    if (expr.kind === NodeKind.Deref && input.tokens[result.value.next]?.text === "=") {
      const statement = parseAssignThrough(input, expr, result.value.next, depth, parseExpr);
      if (!statement.ok) return statement;
      statements.push(statement.value.value);
      cursor = statement.value.next;
      continue;
    }
    const block: BlockNode = { kind: NodeKind.Block, statements, result: expr };
    return ok({ value: block, next: result.value.next });
  }
}

/**
 * Parses `if (condition) then else otherwise`. The branches are full expressions.
 *
 * @param input - The tokens being parsed.
 * @param pos - The position of the `if` token.
 * @param depth - The current nesting depth.
 * @param parseExpr - The expression parser for the condition and branches.
 * @returns The conditional, or the first syntax error found.
 */
function parseIf(input: Input, pos: number, depth: number, parseExpr: Parser): Step<Expr> {
  const ifToken = input.tokens[pos];
  if (ifToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (depth >= MAX_NESTING_DEPTH) return err({ kind: TuffErrorKind.NestingTooDeep, span: ifToken.span });
  const open = input.tokens[pos + 1];
  if (open === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (open.text !== "(") return err({ kind: TuffErrorKind.UnexpectedToken, span: open.span });
  const condition = parseExpr(input, pos + 2, depth + 1);
  if (!condition.ok) return condition;
  const close = input.tokens[condition.value.next];
  if (close === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (close.text !== ")") return err({ kind: TuffErrorKind.ExpectedClosingParen, span: close.span });
  const thenBranch = parseExpr(input, condition.value.next + 1, depth + 1);
  if (!thenBranch.ok) return thenBranch;
  const elseToken = input.tokens[thenBranch.value.next];
  if (elseToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (elseToken.text !== "else") return err({ kind: TuffErrorKind.UnexpectedToken, span: elseToken.span });
  const elseBranch = parseExpr(input, thenBranch.value.next + 1, depth + 1);
  if (!elseBranch.ok) return elseBranch;
  const node: IfNode = {
    kind: NodeKind.If,
    condition: condition.value.value,
    thenBranch: thenBranch.value.value,
    elseBranch: elseBranch.value.value,
    span: ifToken.span,
  };
  return ok({ value: node, next: elseBranch.value.next });
}

/**
 * Parses one arm, `case pattern => expr;`, where the pattern is a number, `true`, `false`, or `_`.
 *
 * @param input - The tokens being parsed.
 * @param pos - The position of the `case` token.
 * @param depth - The current nesting depth.
 * @param parseExpr - The expression parser for the arm's body.
 * @returns The arm, or the first syntax error found.
 */
function parseArm(input: Input, pos: number, depth: number, parseExpr: Parser): Step<MatchArm> {
  const caseToken = input.tokens[pos];
  if (caseToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (caseToken.text !== "case") return err({ kind: TuffErrorKind.UnexpectedToken, span: caseToken.span });
  const patternToken = input.tokens[pos + 1];
  if (patternToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  let pattern: LiteralNode | BooleanNode | undefined;
  if (patternToken.text === "_") {
    pattern = undefined;
  } else if (/^\d+$/.test(patternToken.text)) {
    pattern = { kind: NodeKind.Literal, value: Number(patternToken.text), span: patternToken.span };
  } else if (patternToken.text === "true" || patternToken.text === "false") {
    pattern = { kind: NodeKind.Boolean, value: patternToken.text === "true", span: patternToken.span };
  } else {
    return err({ kind: TuffErrorKind.UnexpectedToken, span: patternToken.span });
  }
  const arrow = input.tokens[pos + 2];
  if (arrow === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (arrow.text !== "=>") return err({ kind: TuffErrorKind.UnexpectedToken, span: arrow.span });
  const body = parseExpr(input, pos + 3, depth + 1);
  if (!body.ok) return body;
  const semicolon = input.tokens[body.value.next];
  if (semicolon === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (semicolon.text !== ";") return err({ kind: TuffErrorKind.UnexpectedToken, span: semicolon.span });
  const arm: MatchArm = { pattern, patternSpan: patternToken.span, body: body.value.value };
  return ok({ value: arm, next: body.value.next + 1 });
}

/**
 * Identifies an arm's pattern, so two arms with the same pattern can be detected.
 *
 * @param arm - The arm.
 * @returns A string that is equal for two arms exactly when their patterns are equal.
 */
function patternKey(arm: MatchArm): string {
  return arm.pattern === undefined ? "_" : `${typeof arm.pattern.value}:${arm.pattern.value}`;
}

/**
 * Parses `match (scrutinee) { case ...; ... }`. A match needs at least one arm, and no two arms may share a pattern.
 *
 * @param input - The tokens being parsed.
 * @param pos - The position of the `match` token.
 * @param depth - The current nesting depth.
 * @param parseExpr - The expression parser for the scrutinee and arms.
 * @returns The match, or the first syntax error found.
 */
function parseMatch(input: Input, pos: number, depth: number, parseExpr: Parser): Step<Expr> {
  const matchToken = input.tokens[pos];
  if (matchToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (depth >= MAX_NESTING_DEPTH) return err({ kind: TuffErrorKind.NestingTooDeep, span: matchToken.span });
  const open = input.tokens[pos + 1];
  if (open === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (open.text !== "(") return err({ kind: TuffErrorKind.UnexpectedToken, span: open.span });
  const scrutinee = parseExpr(input, pos + 2, depth + 1);
  if (!scrutinee.ok) return scrutinee;
  const close = input.tokens[scrutinee.value.next];
  if (close === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (close.text !== ")") return err({ kind: TuffErrorKind.ExpectedClosingParen, span: close.span });
  const brace = input.tokens[scrutinee.value.next + 1];
  if (brace === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (brace.text !== "{") return err({ kind: TuffErrorKind.UnexpectedToken, span: brace.span });

  const arms: MatchArm[] = [];
  const keys = new Set<string>();
  let cursor = scrutinee.value.next + 2;
  for (;;) {
    const token = input.tokens[cursor];
    if (token === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (token.text === "}") break;
    const arm = parseArm(input, cursor, depth, parseExpr);
    if (!arm.ok) return arm;
    const key = patternKey(arm.value.value);
    if (keys.has(key)) return err({ kind: TuffErrorKind.DuplicatePattern, span: arm.value.value.patternSpan });
    keys.add(key);
    arms.push(arm.value.value);
    cursor = arm.value.next;
  }
  const closeBrace = input.tokens[cursor];
  if (arms.length === 0 || closeBrace === undefined) {
    return err({ kind: TuffErrorKind.UnexpectedToken, span: closeBrace?.span ?? input.end });
  }
  const node: MatchNode = { kind: NodeKind.Match, scrutinee: scrutinee.value.value, arms, span: matchToken.span };
  return ok({ value: node, next: cursor + 1 });
}

function parseFactor(input: Input, pos: number, depth: number, parseExpr: Parser): Step<Expr> {
  const token = input.tokens[pos];
  if (token === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (token.text === "(" || token.text === "{") {
    if (depth >= MAX_NESTING_DEPTH) return err({ kind: TuffErrorKind.NestingTooDeep, span: token.span });
    const isBlock = token.text === "{";
    const closer = isBlock ? "}" : ")";
    const inner: Step<Expr> = isBlock
      ? parseBlock(input, pos + 1, depth + 1, parseExpr, "}")
      : parseExpr(input, pos + 1, depth + 1);
    if (!inner.ok) return inner;
    const close = input.tokens[inner.value.next];
    if (close === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (close.text !== closer) {
      return err({ kind: TuffErrorKind.ExpectedClosingParen, span: close.span });
    }
    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }
  if (token.text === "if") return parseIf(input, pos, depth, parseExpr);
  if (token.text === "match") return parseMatch(input, pos, depth, parseExpr);
  if (token.text === "&") {
    const mutable = input.tokens[pos + 1]?.text === "mut";
    const nameToken = input.tokens[pos + (mutable ? 2 : 1)];
    if (nameToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (!isName(nameToken.text)) return err({ kind: TuffErrorKind.UnexpectedToken, span: nameToken.span });
    const target: NameNode = { kind: NodeKind.Name, name: nameToken.text, span: nameToken.span };
    const borrow: BorrowNode = { kind: NodeKind.Borrow, mutable, target, span: token.span };
    return ok({ value: borrow, next: pos + (mutable ? 3 : 2) });
  }
  if (token.text === "*") {
    if (depth >= MAX_NESTING_DEPTH) return err({ kind: TuffErrorKind.NestingTooDeep, span: token.span });
    const operand = parseFactor(input, pos + 1, depth + 1, parseExpr);
    if (!operand.ok) return operand;
    const deref: DerefNode = { kind: NodeKind.Deref, operand: operand.value.value, span: token.span };
    return ok({ value: deref, next: operand.value.next });
  }
  if (/^\d+$/.test(token.text)) {
    const literal: LiteralNode = { kind: NodeKind.Literal, value: Number(token.text), span: token.span };
    return ok({ value: literal, next: pos + 1 });
  }
  if (token.text === "true" || token.text === "false") {
    const literal: BooleanNode = { kind: NodeKind.Boolean, value: token.text === "true", span: token.span };
    return ok({ value: literal, next: pos + 1 });
  }
  if (isName(token.text)) {
    const name: NameNode = { kind: NodeKind.Name, name: token.text, span: token.span };
    return ok({ value: name, next: pos + 1 });
  }
  return err({ kind: TuffErrorKind.UnexpectedToken, span: token.span });
}

function parseBinary(
  input: Input,
  pos: number,
  depth: number,
  level: Map<string, Operator>,
  operand: Parser,
): Step<Expr> {
  const first = operand(input, pos, depth);
  if (!first.ok) return first;
  const steps: ChainStep[] = [];
  let next = first.value.next;
  for (;;) {
    const op = input.tokens[next];
    if (op === undefined) break;
    const operator = level.get(op.text);
    if (operator === undefined) break;
    const right = operand(input, next + 1, depth);
    if (!right.ok) return right;
    steps.push({ operator, operatorSpan: op.span, operand: right.value.value });
    next = right.value.next;
  }
  if (steps.length === 0) return ok({ value: first.value.value, next });
  const chain: ChainNode = { kind: NodeKind.Chain, first: first.value.value, steps };
  return ok({ value: chain, next });
}

function parseTerm(input: Input, pos: number, depth: number, parseExpr: Parser): Step<Expr> {
  return parseBinary(input, pos, depth, MULTIPLICATIVE, (i, p, d) => parseFactor(i, p, d, parseExpr));
}

function parseExpression(input: Input, pos: number, depth: number): Step<Expr> {
  return parseBinary(input, pos, depth, ADDITIVE, (i, p, d) => parseTerm(i, p, d, parseExpression));
}

/**
 * Parses a whole source as a block body (the top level has no braces).
 * Emits an AST only: it neither evaluates nor looks up names.
 *
 * @param tokens - The tokens produced by `tokenize`.
 * @param end - The span just past the last character, used for end-of-input errors.
 * @returns The program's top-level block, or the first syntax error found.
 */
export function parseProgram(tokens: Token[], end: Span): Result<BlockNode, TuffError> {
  const input: Input = { tokens, end };
  const parsed = parseBlock(input, 0, 0, parseExpression, undefined);
  if (!parsed.ok) return parsed;
  const extra = input.tokens[parsed.value.next];
  if (extra !== undefined) return err({ kind: TuffErrorKind.UnexpectedToken, span: extra.span });
  return ok(parsed.value.value);
}
