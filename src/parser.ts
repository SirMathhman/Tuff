import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";
import type { Token } from "./lexer.ts";

export type Expr =
  | { literal: number | boolean; position: number }
  | { identifier: string; position: number }
  | {
      binary: { op: "||" | "&&" | "<" | "=="; left: Expr; right: Expr };
      position: number;
    };

export type IfStatement = {
  condition: Expr;
  thenBlock: Statement[];
  elseBlock?: Statement[];
};

export type WhileStatement = { condition: Expr; body: Statement[] };

export type Declaration = {
  name: string;
  mutable: boolean;
  expr: Expr;
  position: number;
};

export type Assignment = {
  name: string;
  op: "=" | "+=";
  expr: Expr;
  position: number;
};

export type Return = { expr: Expr; position: number };

export type Statement =
  | { block: Statement[]; position: number }
  | { declaration: Declaration; position: number }
  | { assignment: Assignment; position: number }
  | { return: Return; position: number }
  | { if: IfStatement; position: number }
  | { while: WhileStatement; position: number };

const NAME_KEYWORDS = [
  "let",
  "mut",
  "return",
  "true",
  "false",
  "if",
  "else",
  "while",
];

type Cursor = { tokens: Token[]; i: number };

function peek(c: Cursor): Token | undefined {
  return c.tokens[c.i];
}

function advance(c: Cursor): Token {
  const t = c.tokens[c.i]!;
  c.i++;
  return t;
}

type ParsedStatements = { statements: Statement[]; closed: boolean };

function parseStatements(c: Cursor): Result<ParsedStatements> {
  const statements: Statement[] = [];
  while (c.i < c.tokens.length) {
    const token = c.tokens[c.i]!;
    if (token.value === "}") {
      advance(c);
      return { ok: true, value: { statements, closed: true } };
    }
    if (token.value === "{") {
      const open = advance(c);
      const inner = parseStatements(c);
      if (!inner.ok) return inner;
      if (!inner.value.closed)
        return fail({
          kind: "UnbalancedBrace",
          position: c.tokens[c.tokens.length - 1]?.position ?? open.position,
        });
      statements.push({
        block: inner.value.statements,
        position: open.position,
      });
      continue;
    }
    if (token.value === "if") {
      const parsed = parseIf(c);
      if (!parsed.ok) return parsed;
      statements.push(parsed.value);
      continue;
    }
    if (token.value === "while") {
      const parsed = parseWhile(c);
      if (!parsed.ok) return parsed;
      statements.push(parsed.value);
      continue;
    }
    const stmt = parsePlainStatement(c);
    if (!stmt.ok) return stmt;
    statements.push(stmt.value);
  }
  return { ok: true, value: { statements, closed: false } };
}

function parseExprAndSemicolon(c: Cursor, position: number): Result<Expr> {
  const expr = parseExpr(c);
  if (!expr.ok) return expr;
  if (peek(c)?.value !== ";")
    return fail({ kind: "MissingTerminator", position });
  advance(c);
  return expr;
}

function expectOpenBrace(c: Cursor, refToken: Token): Result<void> {
  if (peek(c)?.value !== "{")
    return fail({
      kind: "ExpectedToken",
      expected: "'{'",
      found: peek(c)?.value,
      position: peek(c)?.position ?? refToken.position,
    });
  advance(c);
  return { ok: true, value: undefined };
}

function parsePlainStatement(c: Cursor): Result<Statement> {
  const first = peek(c)!;
  if (first.value === ";")
    return fail({ kind: "EmptyStatement", position: first.position });
  if (first.value === "let") {
    advance(c);
    let mutable = false;
    if (peek(c)?.value === "mut") {
      mutable = true;
      advance(c);
    }
    const nameToken = peek(c);
    if (!nameToken || NAME_KEYWORDS.includes(nameToken.value))
      return fail({
        kind: "ExpectedToken",
        expected: "variable name",
        found: nameToken?.value,
        position: nameToken?.position ?? first.position,
      });
    advance(c);
    if (peek(c)?.value !== "=")
      return fail({
        kind: "ExpectedToken",
        expected: "'='",
        found: peek(c)?.value,
        position: peek(c)?.position ?? first.position,
      });
    advance(c);
    const expr = parseExprAndSemicolon(c, first.position);
    if (!expr.ok) return expr;
    return {
      ok: true,
      value: {
        declaration: {
          name: nameToken.value,
          mutable,
          expr: expr.value,
          position: first.position,
        },
        position: first.position,
      },
    };
  }
  if (first.value === "return") {
    advance(c);
    const expr = parseExprAndSemicolon(c, first.position);
    if (!expr.ok) return expr;
    return {
      ok: true,
      value: {
        return: { expr: expr.value, position: first.position },
        position: first.position,
      },
    };
  }
  if (first.kind === "keyword")
    return fail({
      kind: "ExpectedToken",
      expected: "statement",
      found: first.value,
      position: first.position,
    });
  const name = advance(c);
  const opToken = peek(c);
  if (opToken?.value !== "=" && opToken?.value !== "+=")
    return fail({
      kind: "ExpectedToken",
      expected: "'='",
      found: opToken?.value,
      position: opToken?.position ?? name.position,
    });
  advance(c);
  const expr = parseExprAndSemicolon(c, name.position);
  if (!expr.ok) return expr;
  return {
    ok: true,
    value: {
      assignment: {
        name: name.value,
        op: opToken.value as "=" | "+=",
        expr: expr.value,
        position: name.position,
      },
      position: name.position,
    },
  };
}

function parseOperand(c: Cursor): Result<Expr> {
  const token = peek(c);
  if (!token) return fail({ kind: "UnsupportedExpression", position: 0 });
  if (token.kind === "number") {
    advance(c);
    return {
      ok: true,
      value: { literal: Number(token.value), position: token.position },
    };
  }
  if (token.kind === "keyword") {
    if (token.value === "true") {
      advance(c);
      return { ok: true, value: { literal: true, position: token.position } };
    }
    if (token.value === "false") {
      advance(c);
      return { ok: true, value: { literal: false, position: token.position } };
    }
    return fail({ kind: "UnsupportedExpression", position: token.position });
  }
  if (token.kind === "identifier") {
    advance(c);
    return {
      ok: true,
      value: { identifier: token.value, position: token.position },
    };
  }
  return fail({ kind: "UnsupportedExpression", position: token.position });
}

function parseExpr(c: Cursor): Result<Expr> {
  return parseOr(c);
}

function parseOr(c: Cursor): Result<Expr> {
  let left = parseAnd(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "||") {
    advance(c);
    const right = parseAnd(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: { op: "||", left: left.value, right: right.value },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseAnd(c: Cursor): Result<Expr> {
  let left = parseComparison(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "&&") {
    advance(c);
    const right = parseComparison(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: { op: "&&", left: left.value, right: right.value },
        position: left.value.position,
      },
    };
  }
  return left;
}

function parseComparison(c: Cursor): Result<Expr> {
  let left = parseOperand(c);
  if (!left.ok) return left;
  while (peek(c)?.value === "<" || peek(c)?.value === "==") {
    const op = advance(c);
    const right = parseOperand(c);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        binary: {
          op: op.value as "<" | "==",
          left: left.value,
          right: right.value,
        },
        position: left.value.position,
      },
    };
  }
  return left;
}

type ParsedConditionBlock = { condition: Expr; body: Statement[] };

function parseConditionBlock(
  c: Cursor,
  keyword: Token,
): Result<ParsedConditionBlock> {
  if (peek(c)?.value !== "(")
    return fail({
      kind: "ExpectedToken",
      expected: "'('",
      found: peek(c)?.value,
      position: peek(c)?.position ?? keyword.position,
    });
  advance(c);
  const condition = parseExpr(c);
  if (!condition.ok) return condition;
  if (peek(c)?.value !== ")")
    return fail({
      kind: "UnbalancedParen",
      position: c.tokens[c.tokens.length - 1]?.position ?? keyword.position,
    });
  advance(c);
  const openBrace = expectOpenBrace(c, keyword);
  if (!openBrace.ok) return openBrace;
  const body = parseStatements(c);
  if (!body.ok) return body;
  if (!body.value.closed)
    return fail({
      kind: "UnbalancedBrace",
      position: c.tokens[c.tokens.length - 1]?.position ?? keyword.position,
    });
  return {
    ok: true,
    value: { condition: condition.value, body: body.value.statements },
  };
}

function parseIf(c: Cursor): Result<Statement> {
  const keyword = advance(c);
  const parsed = parseConditionBlock(c, keyword);
  if (!parsed.ok) return parsed;
  const { condition, body: thenBlock } = parsed.value;
  let elseBlock: Statement[] | undefined;
  if (peek(c)?.value === "else") {
    const elseToken = advance(c);
    const openBrace = expectOpenBrace(c, elseToken);
    if (!openBrace.ok) return openBrace;
    const elseResult = parseStatements(c);
    if (!elseResult.ok) return elseResult;
    if (!elseResult.value.closed)
      return fail({
        kind: "UnbalancedBrace",
        position: c.tokens[c.tokens.length - 1]?.position ?? elseToken.position,
      });
    elseBlock = elseResult.value.statements;
  }
  return {
    ok: true,
    value: {
      if: { condition, thenBlock, elseBlock },
      position: keyword.position,
    },
  };
}

function parseWhile(c: Cursor): Result<Statement> {
  const keyword = advance(c);
  const parsed = parseConditionBlock(c, keyword);
  if (!parsed.ok) return parsed;
  const { condition, body } = parsed.value;
  return {
    ok: true,
    value: { while: { condition, body }, position: keyword.position },
  };
}

export function groupStatements(tokens: Token[]): Result<Statement[]> {
  const c: Cursor = { tokens, i: 0 };
  const result = parseStatements(c);
  if (!result.ok) return result;
  return { ok: true, value: result.value.statements };
}
