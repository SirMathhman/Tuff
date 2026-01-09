/**
 * Expression parsing functions for the TokenParser.
 * Extracted to comply with max-lines ESLint rule.
 */
import type { Token } from "./tokens";
import { isLiteralToken } from "./tokens";
import type {
  ASTStatement,
  ASTExpression,
  ASTIdentifier,
  StructInstantiationExpr,
  ArrayLiteralExpr,
  MatchExpr,
  BlockExpr,
} from "./nodes";

/**
 * Interface for parser context that expression parsing needs
 */
export interface ParserContext {
  isAtEnd(): boolean;
  peek(offset?: number): Token;
  advance(): Token;
  check(kind: string, value?: string): boolean;
  checkKeyword(kw: string): boolean;
  match(kind: string, value?: string): boolean;
  matchKeyword(kw: string): boolean;
  consume(kind: string, value?: string, msg?: string): Token;
  parseExpression(): ASTExpression;
  parseStatement(): ASTStatement | undefined;
  parseFieldList<T>(parseValue: () => T): Array<{ name: string; val: T }>;
}

/**
 * Parse an expression using the provided parser context
 */
export function parseExpressionImpl(ctx: ParserContext): ASTExpression {
  return parseOr(ctx);
}

function parseOr(ctx: ParserContext): ASTExpression {
  let left = parseAnd(ctx);
  while (ctx.match("operator", "||")) {
    const right = parseAnd(ctx);
    left = {
      kind: "binary",
      operator: "||",
      left,
      right,
      position: left.position,
    };
  }
  return left;
}

function parseAnd(ctx: ParserContext): ASTExpression {
  let left = parseEquality(ctx);
  while (ctx.match("operator", "&&")) {
    const right = parseEquality(ctx);
    left = {
      kind: "binary",
      operator: "&&",
      left,
      right,
      position: left.position,
    };
  }
  return left;
}

function parseEquality(ctx: ParserContext): ASTExpression {
  let left = parseComparison(ctx);
  while (ctx.check("operator", "==") || ctx.check("operator", "!=")) {
    const op = ctx.advance().value;
    const right = parseComparison(ctx);
    left = {
      kind: "binary",
      operator: op,
      left,
      right,
      position: left.position,
    };
  }
  return left;
}

function parseComparison(ctx: ParserContext): ASTExpression {
  let left = parseTerm(ctx);
  while (isComparisonOp(ctx)) {
    const op = ctx.advance().value;
    const right = parseTerm(ctx);
    left = {
      kind: "binary",
      operator: op,
      left,
      right,
      position: left.position,
    };
  }
  return left;
}

function isComparisonOp(ctx: ParserContext): boolean {
  return (
    ctx.check("operator", "<") ||
    ctx.check("operator", ">") ||
    ctx.check("operator", "<=") ||
    ctx.check("operator", ">=")
  );
}

function parseTerm(ctx: ParserContext): ASTExpression {
  let left = parseFactor(ctx);
  while (ctx.check("operator", "+") || ctx.check("operator", "-")) {
    const op = ctx.advance().value;
    const right = parseFactor(ctx);
    left = {
      kind: "binary",
      operator: op,
      left,
      right,
      position: left.position,
    };
  }
  return left;
}

function parseFactor(ctx: ParserContext): ASTExpression {
  let left = parseUnary(ctx);
  while (isFactorOp(ctx)) {
    const op = ctx.advance().value;
    const right = parseUnary(ctx);
    left = {
      kind: "binary",
      operator: op,
      left,
      right,
      position: left.position,
    };
  }
  return left;
}

function isFactorOp(ctx: ParserContext): boolean {
  return (
    ctx.check("operator", "*") ||
    ctx.check("operator", "/") ||
    ctx.check("operator", "%")
  );
}

function parseUnary(ctx: ParserContext): ASTExpression {
  if (isUnaryOp(ctx)) {
    const op = ctx.advance();
    const operand = parseUnary(ctx);
    return {
      kind: "unary",
      operator: op.value,
      operand,
      position: op.position,
    };
  }
  return parsePostfix(ctx);
}

function isUnaryOp(ctx: ParserContext): boolean {
  return (
    ctx.check("operator", "-") ||
    ctx.check("operator", "*") ||
    ctx.check("operator", "&")
  );
}

function parsePostfix(ctx: ParserContext): ASTExpression {
  let expr = parsePrimary(ctx);

  while (true) {
    if (ctx.check("delimiter", "(")) {
      expr = parseCallExpr(ctx, expr);
    } else if (ctx.check("punctuation", ".")) {
      expr = parseMemberAccess(ctx, expr);
    } else if (ctx.check("delimiter", "[")) {
      expr = parseIndexAccess(ctx, expr);
    } else if (ctx.check("delimiter", "{") && expr.kind === "identifier") {
      expr = parseStructInstantiation(ctx, expr);
    } else {
      break;
    }
  }

  return expr;
}

function parseCallExpr(
  ctx: ParserContext,
  callee: ASTExpression
): ASTExpression {
  ctx.advance();
  const args: ASTExpression[] = [];
  while (!ctx.check("delimiter", ")")) {
    args.push(ctx.parseExpression());
    if (!ctx.check("delimiter", ")")) {
      ctx.consume("punctuation", ",", "Expected ','");
    }
  }
  ctx.advance();
  return { kind: "call", callee, args, position: callee.position };
}

function parseMemberAccess(
  ctx: ParserContext,
  object: ASTExpression
): ASTExpression {
  ctx.advance();
  const propToken = ctx.consume(
    "identifier",
    undefined,
    "Expected property name"
  );
  return {
    kind: "member",
    object,
    property: propToken.value,
    position: object.position,
  };
}

function parseIndexAccess(
  ctx: ParserContext,
  object: ASTExpression
): ASTExpression {
  ctx.advance();
  const index = ctx.parseExpression();
  ctx.consume("delimiter", "]", "Expected ']'");
  return { kind: "index", object, index, position: object.position };
}

function parseStructInstantiation(
  ctx: ParserContext,
  nameExpr: ASTIdentifier
): StructInstantiationExpr {
  ctx.advance();
  const rawFields = ctx.parseFieldList(() => ctx.parseExpression());
  const fields = rawFields.map((f) => ({ name: f.name, value: f.val }));
  ctx.advance();
  return {
    kind: "struct-instantiation",
    structName: nameExpr.name,
    fields,
    position: nameExpr.position,
  };
}

function parsePrimary(ctx: ParserContext): ASTExpression {
  const token = ctx.peek();
  const pos = token.position;

  if (isLiteralToken(token)) {
    return parseLiteralExpr(ctx, token, pos);
  }

  if (ctx.checkKeyword("true")) {
    ctx.advance();
    return { kind: "bool", value: true, position: pos };
  }
  if (ctx.checkKeyword("false")) {
    ctx.advance();
    return { kind: "bool", value: false, position: pos };
  }
  if (ctx.checkKeyword("this")) {
    ctx.advance();
    return { kind: "identifier", name: "this", position: pos };
  }
  if (token.kind === "identifier") {
    ctx.advance();
    return { kind: "identifier", name: token.value, position: pos };
  }
  if (ctx.check("delimiter", "(")) {
    return parseParenExpr(ctx, pos);
  }
  if (ctx.check("delimiter", "{")) {
    return parseBlockExpression(ctx, pos);
  }
  if (ctx.check("delimiter", "[")) {
    return parseArrayLiteral(ctx, pos);
  }
  if (ctx.checkKeyword("match")) {
    return parseMatchExpression(ctx, pos);
  }

  throw new Error(`Unexpected token: ${token.value}`);
}

function parseLiteralExpr(
  ctx: ParserContext,
  token: Token & { kind: "literal" },
  pos: number
): ASTExpression {
  ctx.advance();
  if (token.literalKind === "int") {
    const numVal = BigInt(token.value.replace(/[uUiI]\d+$/, ""));
    return { kind: "int", value: numVal, suffix: token.suffix, position: pos };
  }
  if (token.literalKind === "float") {
    return { kind: "float", value: Number(token.value), position: pos };
  }
  return { kind: "string", value: token.value, position: pos };
}

function parseParenExpr(ctx: ParserContext, pos: number): ASTExpression {
  ctx.advance();
  const expr = ctx.parseExpression();
  ctx.consume("delimiter", ")", "Expected ')'");
  return { kind: "paren", expr, position: pos };
}

function parseBlockExpression(ctx: ParserContext, pos: number): BlockExpr {
  ctx.consume("delimiter", "{", "Expected '{'");
  const statements: ASTStatement[] = [];
  let finalExpr: ASTExpression | undefined;

  while (!ctx.check("delimiter", "}") && !ctx.isAtEnd()) {
    if (ctx.match("punctuation", ";")) continue;

    const stmt = ctx.parseStatement();

    if (stmt) {
      if (ctx.check("delimiter", "}") && stmt.kind === "expression") {
        finalExpr = stmt.expr;
      } else {
        statements.push(stmt);
      }
    }
  }

  ctx.consume("delimiter", "}", "Expected '}'");
  return { kind: "block-expr", statements, finalExpr, position: pos };
}

function parseArrayLiteral(ctx: ParserContext, pos: number): ArrayLiteralExpr {
  ctx.consume("delimiter", "[", "Expected '['");
  const elements: ASTExpression[] = [];

  while (!ctx.check("delimiter", "]")) {
    elements.push(ctx.parseExpression());
    if (!ctx.check("delimiter", "]")) {
      ctx.consume("punctuation", ",", "Expected ','");
    }
  }
  ctx.advance();

  return { kind: "array", elements, position: pos };
}

function parseMatchExpression(ctx: ParserContext, pos: number): MatchExpr {
  ctx.advance();
  ctx.consume("delimiter", "(", "Expected '('");
  const expr = ctx.parseExpression();
  ctx.consume("delimiter", ")", "Expected ')'");

  ctx.consume("delimiter", "{", "Expected '{'");
  const cases: Array<{ pattern: string; body: ASTExpression }> = [];

  while (!ctx.check("delimiter", "}")) {
    const pattern = parseMatchPattern(ctx);
    ctx.consume("operator", "=>", "Expected '=>'");
    const body = ctx.parseExpression();
    cases.push({ pattern, body });
    ctx.match("punctuation", ",");
  }

  ctx.consume("delimiter", "}", "Expected '}'");
  return { kind: "match", expr, cases, position: pos };
}

function parseMatchPattern(ctx: ParserContext): string {
  if (ctx.checkKeyword("default")) {
    ctx.advance();
    return "default";
  }
  if (ctx.checkKeyword("case")) {
    ctx.advance();
  }
  const patternToken = ctx.peek();
  ctx.advance();
  return patternToken.value;
}
