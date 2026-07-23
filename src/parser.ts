// ---- Parser ----

import type { Token } from "./compiler";
import type { ASTNode } from "./compiler";
import type { TokenType } from "./compiler";

interface ParserCtx {
  tokens: Token[];
  pos: number;
  iterations: number;
}

function peek(ctx: ParserCtx): Token {
  return ctx.tokens[ctx.pos];
}

function advance(ctx: ParserCtx): Token {
  return ctx.tokens[ctx.pos++];
}

function eof(ctx: ParserCtx): boolean {
  return peek(ctx).type === "EOF";
}

function checkLoop(ctx: ParserCtx) {
  if (++ctx.iterations > 1024)
    throw new Error("Parser loop exceeded 1024 iterations");
}

function expect(ctx: ParserCtx, type: TokenType, value?: string): Token {
  const token = advance(ctx);
  if (token.type !== type || (value !== undefined && token.value !== value)) {
    const expected = value !== undefined ? type + " '" + value + "'" : type;
    throw new Error(
      "Expected " +
        expected +
        " at line " +
        token.line +
        ":" +
        token.col +
        ", got '" +
        token.value +
        "'",
    );
  }
  return token;
}

export function parse(tokens: Token[]): ASTNode {
  const ctx: ParserCtx = { tokens, pos: 0, iterations: 0 };
  return parseProgram(ctx);
}

// ---- Expression Parsing ----

function parseExpression(ctx: ParserCtx): ASTNode {
  return parseComparison(ctx);
}

function parseComparison(ctx: ParserCtx): ASTNode {
  let left = parseAddition(ctx);
  while (
    !eof(ctx) &&
    ["==", "!=", "<", ">", "<=", ">="].includes(peek(ctx).value)
  ) {
    checkLoop(ctx);
    const op = advance(ctx).value;
    const right = parseAddition(ctx);
    left = { kind: "Binary", op, left, right };
  }
  return left;
}

function parseAddition(ctx: ParserCtx): ASTNode {
  let left = parseMultiplication(ctx);
  while (!eof(ctx) && ["+", "-"].includes(peek(ctx).value)) {
    checkLoop(ctx);
    const op = advance(ctx).value;
    const right = parseMultiplication(ctx);
    left = { kind: "Binary", op, left, right };
  }
  return left;
}

function parseMultiplication(ctx: ParserCtx): ASTNode {
  let left = parseUnary(ctx);
  while (!eof(ctx) && ["*", "/", "%"].includes(peek(ctx).value)) {
    checkLoop(ctx);
    const op = advance(ctx).value;
    const right = parseUnary(ctx);
    left = { kind: "Binary", op, left, right };
  }
  return left;
}

function parseUnary(ctx: ParserCtx): ASTNode {
  if (peek(ctx).value === "-") {
    advance(ctx);
    const operand = parseUnary(ctx);
    return { kind: "Unary", op: "-", operand };
  }
  if (peek(ctx).value === "!") {
    advance(ctx);
    const operand = parseUnary(ctx);
    return { kind: "Unary", op: "!", operand };
  }
  return parsePrimary(ctx);
}

function parsePrimary(ctx: ParserCtx): ASTNode {
  const token = peek(ctx);

  if (token.type === "NUMBER") {
    advance(ctx);
    return { kind: "Number", value: parseFloat(token.value) };
  }

  if (token.type === "STRING") {
    advance(ctx);
    return { kind: "String", value: token.value };
  }

  if (token.type === "BOOL") {
    advance(ctx);
    return { kind: "Bool", value: token.value === "true" };
  }

  if (token.type === "LBRACKET") {
    return parseArrayLiteral(ctx);
  }

  if (token.type === "LBRACE") {
    return parseObjectLiteral(ctx);
  }

  if (token.type === "LPAREN") {
    advance(ctx);
    const expr = parseExpression(ctx);
    expect(ctx, "RPAREN", ")");
    return expr;
  }

  if (token.type === "IDENT") {
    advance(ctx);
    const node: ASTNode = { kind: "Ident", name: token.value };
    return parsePostfix(ctx, node);
  }

  throw new Error(
    "Unexpected token '" +
      token.value +
      "' at line " +
      token.line +
      ":" +
      token.col,
  );
}

function parsePostfix(ctx: ParserCtx, node: ASTNode): ASTNode {
  while (
    !eof(ctx) &&
    (peek(ctx).type === "LPAREN" ||
      peek(ctx).type === "LBRACKET" ||
      peek(ctx).type === "DOT")
  ) {
    checkLoop(ctx);
    if (peek(ctx).type === "LPAREN") {
      return parsePostfix(ctx, parseCall(ctx, node));
    }
    if (peek(ctx).type === "LBRACKET") {
      return parsePostfix(ctx, parseIndex(ctx, node));
    }
    if (peek(ctx).type === "DOT") {
      return parsePostfix(ctx, parseProperty(ctx, node));
    }
  }
  return node;
}

function parseCall(ctx: ParserCtx, callee: ASTNode): ASTNode {
  advance(ctx); // consume (
  const args: ASTNode[] = [];
  if (peek(ctx).type !== "RPAREN") {
    args.push(parseExpression(ctx));
    while (peek(ctx).type === "COMMA") {
      checkLoop(ctx);
      advance(ctx);
      if (peek(ctx).type !== "RPAREN") {
        args.push(parseExpression(ctx));
      }
    }
  }
  expect(ctx, "RPAREN", ")");
  return { kind: "Call", callee, args };
}

function parseIndex(ctx: ParserCtx, obj: ASTNode): ASTNode {
  advance(ctx); // consume [
  const index = parseExpression(ctx);
  expect(ctx, "RBRACKET", "]");
  return { kind: "Index", obj, index };
}

function parseProperty(ctx: ParserCtx, obj: ASTNode): ASTNode {
  advance(ctx); // consume .
  const propToken = expect(ctx, "IDENT");
  return { kind: "Property", obj, prop: propToken.value };
}

function parseArrayLiteral(ctx: ParserCtx): ASTNode {
  advance(ctx); // consume [
  const elements: ASTNode[] = [];
  if (peek(ctx).type !== "RBRACKET") {
    elements.push(parseExpression(ctx));
    while (peek(ctx).type === "COMMA") {
      checkLoop(ctx);
      advance(ctx);
      if (peek(ctx).type !== "RBRACKET") {
        elements.push(parseExpression(ctx));
      }
    }
  }
  expect(ctx, "RBRACKET", "]");
  return { kind: "ArrayLit", elements };
}

function parseObjectLiteral(ctx: ParserCtx): ASTNode {
  advance(ctx); // consume {
  const properties: { key: string; value: ASTNode }[] = [];

  if (peek(ctx).type !== "RBRACE") {
    const savedPos = ctx.pos;
    const keyToken = advance(ctx);
    if (keyToken.type === "IDENT" && peek(ctx).type === "COLON") {
      advance(ctx); // consume :
      const value = parseExpression(ctx);
      properties.push({ key: keyToken.value, value });

      while (peek(ctx).type === "COMMA") {
        checkLoop(ctx);
        advance(ctx);
        if (peek(ctx).type !== "RBRACE") {
          const k = expect(ctx, "IDENT");
          expect(ctx, "COLON", ":");
          const v = parseExpression(ctx);
          properties.push({ key: k.value, value: v });
        }
      }
    } else {
      ctx.pos = savedPos;
      return parseBlock(ctx);
    }
  }

  expect(ctx, "RBRACE", "}");
  return { kind: "ObjectLit", properties };
}

// ---- Statement Parsing ----

function parseStatement(ctx: ParserCtx): ASTNode | undefined {
  if (eof(ctx)) return undefined;

  const keywordResult = parseKeywordStmt(ctx);
  if (keywordResult) return keywordResult;

  const expr = parseExpression(ctx);
  if (peek(ctx).type === "SEMI") {
    advance(ctx);
  }
  return expr;
}

function parseKeywordStmt(
  ctx: ParserCtx,
): ASTNode | undefined {
  const token = peek(ctx);
  if (token.type !== "KEYWORD") return undefined;

  switch (token.value) {
    case "fn":
      return parseFnDecl(ctx);
    case "let":
      return parseLetDecl(ctx);
    case "if":
      return parseIfStmt(ctx);
    case "while":
      return parseWhileStmt(ctx);
    default:
      return undefined;
  }
}

function parseLetDecl(ctx: ParserCtx): ASTNode {
  expect(ctx, "KEYWORD", "let");
  const nameToken = expect(ctx, "IDENT");

  while (!eof(ctx) && peek(ctx).type !== "EQ") {
    checkLoop(ctx);
    advance(ctx);
  }

  if (!eof(ctx)) {
    advance(ctx); // consume =
  }

  const value = parseExpression(ctx);
  expect(ctx, "SEMI", ";");
  return { kind: "Let", name: nameToken.value, value };
}

function parseFnDecl(ctx: ParserCtx): ASTNode {
  expect(ctx, "KEYWORD", "fn");
  const nameToken = expect(ctx, "IDENT");
  expect(ctx, "LPAREN", "(");

  const params = parseFnParams(ctx);
  expect(ctx, "RPAREN", ")");

  const body = parseFnBody(ctx);
  return { kind: "Fn", name: nameToken.value, params, body };
}

function parseFnParams(ctx: ParserCtx): string[] {
  const params: string[] = [];
  if (peek(ctx).type !== "RPAREN") {
    const paramToken = expect(ctx, "IDENT");
    params.push(paramToken.value);
    skipTypeAnnotation(ctx);

    while (peek(ctx).type === "COMMA") {
      checkLoop(ctx);
      advance(ctx);
      if (peek(ctx).type !== "RPAREN") {
        const p = expect(ctx, "IDENT");
        params.push(p.value);
        skipTypeAnnotation(ctx);
      }
    }
  }
  return params;
}

function skipTypeAnnotation(ctx: ParserCtx) {
  while (
    !eof(ctx) &&
    peek(ctx).type !== "COMMA" &&
    peek(ctx).type !== "RPAREN"
  ) {
    checkLoop(ctx);
    advance(ctx);
  }
}

function parseFnBody(ctx: ParserCtx): ASTNode {
  if (peek(ctx).type === "ARROW") {
    advance(ctx);
    const body = parseExpression(ctx);
    expect(ctx, "SEMI", ";");
    return body;
  }
  if (peek(ctx).type === "LBRACE") {
    return parseBlock(ctx);
  }
  throw new Error(
    "Expected '=>' or '{' for function body at line " +
      peek(ctx).line +
      ":" +
      peek(ctx).col,
  );
}

function parseIfStmt(ctx: ParserCtx): ASTNode {
  expect(ctx, "KEYWORD", "if");
  expect(ctx, "LPAREN", "(");
  const cond = parseExpression(ctx);
  expect(ctx, "RPAREN", ")");

  expect(ctx, "LBRACE", "{");
  const thenBody = parseBlockBody(ctx);
  let elseBody: ASTNode[] = [];

  if (
    !eof(ctx) &&
    peek(ctx).type === "KEYWORD" &&
    peek(ctx).value === "else"
  ) {
    advance(ctx);
    expect(ctx, "LBRACE", "{");
    elseBody = parseBlockBody(ctx);
  }

  return { kind: "If", cond, thenBody, elseBody };
}

function parseWhileStmt(ctx: ParserCtx): ASTNode {
  expect(ctx, "KEYWORD", "while");
  expect(ctx, "LPAREN", "(");
  const cond = parseExpression(ctx);
  expect(ctx, "RPAREN", ")");

  expect(ctx, "LBRACE", "{");
  const body = parseBlockBody(ctx);
  return { kind: "While", cond, body };
}

function parseBlock(ctx: ParserCtx): ASTNode {
  expect(ctx, "LBRACE", "{");
  const body = parseBlockBody(ctx);
  return { kind: "Block", body };
}

function parseBlockBody(ctx: ParserCtx): ASTNode[] {
  const body: ASTNode[] = [];
  while (!eof(ctx) && peek(ctx).type !== "RBRACE") {
    checkLoop(ctx);
    const stmt = parseStatement(ctx);
    if (stmt) body.push(stmt);
  }
  expect(ctx, "RBRACE", "}");
  return body;
}

function parseProgram(ctx: ParserCtx): ASTNode {
  const body: ASTNode[] = [];
  while (!eof(ctx)) {
    checkLoop(ctx);
    const stmt = parseStatement(ctx);
    if (stmt) body.push(stmt);
  }
  return { kind: "Program", body };
}
