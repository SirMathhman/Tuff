import type { Result } from "../errors.ts";
import { fail } from "../errors.ts";
import type { Token } from "../lexer.ts";
import { parseExpr } from "./expressions.ts";
import { advance, NAME_KEYWORDS, peek } from "./types.ts";
import type { Cursor, Expr, MatchCase, Statement } from "./types.ts";

type ParsedStatements = { statements: Statement[]; closed: boolean };

export function parseStatements(c: Cursor): Result<ParsedStatements> {
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
    if (token.value === "for") {
      const parsed = parseFor(c);
      if (!parsed.ok) return parsed;
      statements.push(parsed.value);
      continue;
    }
    if (token.value === "match") {
      const parsed = parseMatch(c);
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
  if (first.value === "break" || first.value === "continue") {
    advance(c);
    if (peek(c)?.value !== ";")
      return fail({ kind: "MissingTerminator", position: first.position });
    advance(c);
    const position = first.position;
    const value =
      first.value === "break"
        ? { break: { position }, position }
        : { continue: { position }, position };
    return { ok: true, value };
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

type ParsedConditionBlock = { condition: Expr; body: Statement[] };

function expectOpenParen(c: Cursor, keyword: Token): Result<void> {
  if (peek(c)?.value !== "(")
    return fail({
      kind: "ExpectedToken",
      expected: "'('",
      found: peek(c)?.value,
      position: peek(c)?.position ?? keyword.position,
    });
  advance(c);
  return { ok: true, value: undefined };
}

function expectCloseParen(c: Cursor, keyword: Token): Result<void> {
  if (peek(c)?.value !== ")")
    return fail({
      kind: "UnbalancedParen",
      position: c.tokens[c.tokens.length - 1]?.position ?? keyword.position,
    });
  advance(c);
  return { ok: true, value: undefined };
}

function parseParenthesizedExpr(c: Cursor, keyword: Token): Result<Expr> {
  const open = expectOpenParen(c, keyword);
  if (!open.ok) return open;
  const expr = parseExpr(c);
  if (!expr.ok) return expr;
  const close = expectCloseParen(c, keyword);
  if (!close.ok) return close;
  return expr;
}

function parseBlockBody(c: Cursor, keyword: Token): Result<Statement[]> {
  const openBrace = expectOpenBrace(c, keyword);
  if (!openBrace.ok) return openBrace;
  const body = parseStatements(c);
  if (!body.ok) return body;
  if (!body.value.closed)
    return fail({
      kind: "UnbalancedBrace",
      position: c.tokens[c.tokens.length - 1]?.position ?? keyword.position,
    });
  return { ok: true, value: body.value.statements };
}

function parseConditionBlock(
  c: Cursor,
  keyword: Token,
): Result<ParsedConditionBlock> {
  const condition = parseParenthesizedExpr(c, keyword);
  if (!condition.ok) return condition;
  const body = parseBlockBody(c, keyword);
  if (!body.ok) return body;
  return {
    ok: true,
    value: { condition: condition.value, body: body.value },
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

function parseFor(c: Cursor): Result<Statement> {
  const keyword = advance(c);
  const open = expectOpenParen(c, keyword);
  if (!open.ok) return open;
  const nameToken = peek(c);
  if (!nameToken || nameToken.kind !== "identifier")
    return fail({
      kind: "ExpectedToken",
      expected: "variable name",
      found: nameToken?.value,
      position: nameToken?.position ?? keyword.position,
    });
  advance(c);
  if (peek(c)?.value !== "in")
    return fail({
      kind: "ExpectedToken",
      expected: "'in'",
      found: peek(c)?.value,
      position: peek(c)?.position ?? keyword.position,
    });
  advance(c);
  const range = parseExpr(c);
  if (!range.ok) return range;
  const close = expectCloseParen(c, keyword);
  if (!close.ok) return close;
  const body = parseBlockBody(c, keyword);
  if (!body.ok) return body;
  return {
    ok: true,
    value: {
      for: {
        variable: nameToken.value,
        range: range.value,
        body: body.value,
      },
      position: keyword.position,
    },
  };
}

function parseMatchPattern(c: Cursor): Result<MatchCase["pattern"]> {
  const token = peek(c);
  if (!token)
    return fail({
      kind: "ExpectedToken",
      expected: "pattern",
      found: undefined,
      position: c.tokens[c.tokens.length - 1]?.position ?? 0,
    });
  if (token.value === "_") {
    advance(c);
    return { ok: true, value: { kind: "wildcard" } };
  }
  if (token.kind === "number") {
    advance(c);
    return { ok: true, value: { kind: "literal", value: Number(token.value) } };
  }
  if (
    token.kind === "keyword" &&
    (token.value === "true" || token.value === "false")
  ) {
    advance(c);
    return {
      ok: true,
      value: { kind: "literal", value: token.value === "true" },
    };
  }
  return fail({
    kind: "ExpectedToken",
    expected: "pattern",
    found: token.value,
    position: token.position,
  });
}

function parseMatch(c: Cursor): Result<Statement> {
  const keyword = advance(c);
  const scrutinee = parseParenthesizedExpr(c, keyword);
  if (!scrutinee.ok) return scrutinee;
  const openBrace = expectOpenBrace(c, keyword);
  if (!openBrace.ok) return openBrace;
  const cases: MatchCase[] = [];
  while (peek(c)?.value !== "}") {
    if (peek(c)?.value !== "case")
      return fail({
        kind: "ExpectedToken",
        expected: "'case'",
        found: peek(c)?.value,
        position: peek(c)?.position ?? keyword.position,
      });
    advance(c);
    const pattern = parseMatchPattern(c);
    if (!pattern.ok) return pattern;
    if (peek(c)?.value !== "=>")
      return fail({
        kind: "ExpectedToken",
        expected: "'=>'",
        found: peek(c)?.value,
        position: peek(c)?.position ?? keyword.position,
      });
    advance(c);
    const body = parseBlockBody(c, keyword);
    if (!body.ok) return body;
    if (peek(c)?.value !== ";")
      return fail({
        kind: "MissingTerminator",
        position: c.tokens[c.tokens.length - 1]?.position ?? keyword.position,
      });
    advance(c);
    cases.push({ pattern: pattern.value, block: body.value });
  }
  advance(c);
  return {
    ok: true,
    value: {
      match: { scrutinee: scrutinee.value, cases },
      position: keyword.position,
    },
  };
}
