import {
  NodeKind,
  Operator,
  StatementKind,
  type AssignStatement,
  type BlockNode,
  type BooleanNode,
  type ChainNode,
  type ChainStep,
  type Expr,
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
const RESERVED = new Set<string>(["let", "mut", "true", "false"]);
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
    const block: BlockNode = { kind: NodeKind.Block, statements, result: result.value.value };
    return ok({ value: block, next: result.value.next });
  }
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
