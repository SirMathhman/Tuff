// Token types
const TokenType = {
  IDENTIFIER: "IDENTIFIER",
  KEYWORD: "KEYWORD",
  NUMBER: "NUMBER",
  SEMICOLON: "SEMICOLON",
  DOT: "DOT",
  ASSIGN: "ASSIGN",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  COLON: "COLON",
  COMMA: "COMMA",
  STRING: "STRING",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  ARROW: "ARROW",
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  BOOLEAN: "BOOLEAN",
  EQ: "EQ",
  NEQ: "NEQ",
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  UNDERSCORE: "UNDERSCORE",
  EOF: "EOF",
};

// Tokenizer
function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isIdentStart(ch) {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_" ||
    ch === "$"
  );
}

function isIdentChar(ch) {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_" ||
    ch === "$"
  );
}

function isKeyword(ident) {
  return [
    "let",
    "fn",
    "match",
    "case",
    "true",
    "false",
    "loop",
    "break",
    "continue",
  ].includes(ident);
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

function readIdentifier(source, start) {
  let ident = "";
  let i = start;
  while (i < source.length && isIdentChar(source[i])) {
    ident += source[i];
    i++;
  }
  if (ident === "_") {
    return { value: "_", type: TokenType.UNDERSCORE };
  }
  return ident.length > 0 ? { value: ident, type: TokenType.IDENTIFIER } : null;
}

function readNumber(source, start) {
  let num = "";
  let i = start;
  while (i < source.length && isDigit(source[i])) {
    num += source[i];
    i++;
  }
  return num.length > 0 ? num : null;
}

function readString(source, start) {
  let result = "";
  let i = start + 1; // skip opening quote
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"') {
      return { value: result, length: i - start + 1 };
    }
    if (ch === "\\" && i + 1 < source.length) {
      const next = source[i + 1];
      const escapes = { '"': '"', "\\": "\\", n: "\n", t: "\t" };
      if (escapes[next]) {
        result += escapes[next];
        i += 2;
        continue;
      }
    }
    result += ch;
    i++;
  }
  return null; // unterminated string
}

function readMultiCharToken(source, i) {
  const ch = source[i];
  if (isIdentStart(ch)) {
    return readIdentifierToken(source, i);
  }
  if (isDigit(ch)) {
    return readNumberToken(source, i);
  }
  if (ch === '"') {
    return readStringToken(source, i);
  }
  return null;
}

function readIdentifierToken(source, i) {
  const identResult = readIdentifier(source, i);
  if (!identResult) return null;
  if (identResult.type === TokenType.UNDERSCORE) {
    return {
      token: { type: TokenType.UNDERSCORE, value: "_" },
      length: 1,
    };
  }
  const type = classifyIdentifier(identResult.value);
  return {
    token: { type, value: identResult.value },
    length: identResult.value.length,
  };
}

function classifyIdentifier(value) {
  if (value === "true" || value === "false") return TokenType.BOOLEAN;
  if (isKeyword(value)) return TokenType.KEYWORD;
  return TokenType.IDENTIFIER;
}

function readNumberToken(source, i) {
  const numResult = readNumber(source, i);
  if (!numResult) return null;
  return {
    token: { type: TokenType.NUMBER, value: numResult },
    length: numResult.length,
  };
}

function readStringToken(source, i) {
  const stringResult = readString(source, i);
  if (!stringResult) return null;
  return {
    token: { type: TokenType.STRING, value: stringResult.value },
    length: stringResult.length,
  };
}

function tryTwoCharToken(source, i, tokens) {
  const ch = source[i];
  const nextCh = source[i + 1];
  const twoCharMap = {
    "==": TokenType.EQ,
    "!=": TokenType.NEQ,
    "<=": TokenType.LTE,
    ">=": TokenType.GTE,
    "&&": TokenType.AND,
    "||": TokenType.OR,
  };
  const twoChar = ch + nextCh;
  if (twoCharMap[twoChar]) {
    tokens.push({ type: twoCharMap[twoChar], value: twoChar });
    return 2;
  }
  if (
    ch === ">" &&
    tokens.length > 0 &&
    tokens[tokens.length - 1].value === "="
  ) {
    tokens.pop();
    tokens.push({ type: TokenType.ARROW, value: "=>" });
    return 1;
  }
  return 0;
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      i++;
      continue;
    }
    const twoLen = tryTwoCharToken(source, i, tokens);
    if (twoLen > 0) {
      i += twoLen;
      continue;
    }
    const singleResult = trySingleCharToken(ch);
    if (singleResult) {
      tokens.push(singleResult);
      i++;
      continue;
    }
    const multiResult = readMultiCharToken(source, i);
    if (multiResult) {
      tokens.push(multiResult.token);
      i += multiResult.length;
      continue;
    }
    return { ok: false, error: "Unknown source code: " + source };
  }
  tokens.push({ type: TokenType.EOF, value: "" });
  return { ok: true, tokens };
}

function trySingleCharToken(ch) {
  const map = {
    ";": TokenType.SEMICOLON,
    ".": TokenType.DOT,
    "=": TokenType.ASSIGN,
    "{": TokenType.LBRACE,
    "}": TokenType.RBRACE,
    ":": TokenType.COLON,
    ",": TokenType.COMMA,
    "(": TokenType.LPAREN,
    ")": TokenType.RPAREN,
    "+": TokenType.PLUS,
    "-": TokenType.MINUS,
    "*": TokenType.STAR,
    "/": TokenType.SLASH,
    "<": TokenType.LT,
    ">": TokenType.GT,
    "!": TokenType.NOT,
  };
  const type = map[ch];
  return type ? { type, value: ch } : null;
}

// AST Node Types
const NodeType = {
  Program: "Program",
  LetDeclaration: "LetDeclaration",
  Identifier: "Identifier",
  MemberExpression: "MemberExpression",
  NumberLiteral: "NumberLiteral",
  StringLiteral: "StringLiteral",
  BooleanLiteral: "BooleanLiteral",
  ObjectLiteral: "ObjectLiteral",
  ObjectProperty: "ObjectProperty",
  FunctionDeclaration: "FunctionDeclaration",
  FunctionCall: "FunctionCall",
  BinaryExpression: "BinaryExpression",
  UnaryExpression: "UnaryExpression",
  BlockExpression: "BlockExpression",
  MatchExpression: "MatchExpression",
  MatchCase: "MatchCase",
  LoopExpression: "LoopExpression",
  BreakStatement: "BreakStatement",
  ContinueStatement: "ContinueStatement",
};

// Parser helpers
function peek(ctx) {
  return ctx.tokens[ctx.pos];
}

function advance(ctx) {
  ctx.pos++;
}

function consume(ctx, expectedType) {
  const token = peek(ctx);
  if (token.type !== expectedType) {
    return {
      ok: false,
      error: "Expected " + expectedType + " but got " + token.type,
    };
  }
  advance(ctx);
  return { ok: true, value: token };
}

function parseIdentifier(ctx) {
  const result = consume(ctx, TokenType.IDENTIFIER);
  if (!result.ok) return result;
  return {
    ok: true,
    value: { type: NodeType.Identifier, name: result.value.value },
  };
}

function isBlockExpression(ctx) {
  if (peek(ctx).type !== TokenType.LBRACE) return false;
  const nextPos = ctx.pos + 1;
  const nextToken = ctx.tokens[nextPos];
  if (!nextToken) return true;
  if (nextToken.type === TokenType.RBRACE) return true;
  if (nextToken.type === TokenType.KEYWORD) return true;
  if (nextToken.type === TokenType.IDENTIFIER) {
    const afterNext = ctx.tokens[nextPos + 1];
    if (afterNext && afterNext.type === TokenType.COLON) return false;
    return true;
  }
  return true;
}

function parsePrimaryExpression(ctx) {
  const token = peek(ctx);
  if (token.type === TokenType.NUMBER) {
    advance(ctx);
    return {
      ok: true,
      value: { type: NodeType.NumberLiteral, value: token.value },
    };
  }
  if (token.type === TokenType.STRING) {
    advance(ctx);
    return {
      ok: true,
      value: { type: NodeType.StringLiteral, value: token.value },
    };
  }
  if (token.type === TokenType.BOOLEAN) {
    advance(ctx);
    return {
      ok: true,
      value: { type: NodeType.BooleanLiteral, value: token.value === "true" },
    };
  }
  if (token.type === TokenType.LBRACE) {
    if (isBlockExpression(ctx)) {
      return parseBlockExpression(ctx);
    }
    return parseObjectLiteral(ctx);
  }
  if (token.type === TokenType.NOT) {
    return parseUnaryNot(ctx);
  }
  return parseKeywordOrIdentifier(ctx);
}

function parseKeywordOrIdentifier(ctx) {
  const token = peek(ctx);
  if (token.type === TokenType.KEYWORD && token.value === "match") {
    return parseMatchExpression(ctx);
  }
  if (token.type === TokenType.KEYWORD && token.value === "loop") {
    return parseLoopExpression(ctx);
  }
  return parseIdentifierOrCall(ctx);
}

function parseUnaryNot(ctx) {
  advance(ctx);
  const operand = parsePrimaryExpression(ctx);
  if (!operand.ok) return operand;
  return {
    ok: true,
    value: {
      type: NodeType.UnaryExpression,
      operator: "!",
      operand: operand.value,
    },
  };
}

function parseIdentifierOrCall(ctx) {
  const identResult = parseIdentifier(ctx);
  if (!identResult.ok) return identResult;
  if (peek(ctx).type === TokenType.LPAREN) {
    return parseFunctionCall(ctx, identResult.value.name);
  }
  return identResult;
}

function parseFunctionCall(ctx, name) {
  advance(ctx); // consume '('
  const args = [];
  while (
    peek(ctx).type !== TokenType.RPAREN &&
    peek(ctx).type !== TokenType.EOF
  ) {
    const argResult = parseExpression(ctx);
    if (!argResult.ok) return argResult;
    args.push(argResult.value);
    if (peek(ctx).type === TokenType.COMMA) {
      advance(ctx);
    }
  }
  consume(ctx, TokenType.RPAREN);
  return {
    ok: true,
    value: { type: NodeType.FunctionCall, name, arguments: args },
  };
}

function parseObjectLiteral(ctx) {
  consume(ctx, TokenType.LBRACE);
  const properties = [];
  while (
    peek(ctx).type !== TokenType.RBRACE &&
    peek(ctx).type !== TokenType.EOF
  ) {
    const keyResult = parseIdentifier(ctx);
    if (!keyResult.ok) return keyResult;
    consume(ctx, TokenType.COLON);
    const valueResult = parseExpression(ctx);
    if (!valueResult.ok) return valueResult;
    properties.push({
      type: NodeType.ObjectProperty,
      key: keyResult.value.name,
      value: valueResult.value,
    });
    if (peek(ctx).type === TokenType.COMMA) {
      advance(ctx);
    }
  }
  consume(ctx, TokenType.RBRACE);
  return { ok: true, value: { type: NodeType.ObjectLiteral, properties } };
}

function parseBlockExpression(ctx) {
  consume(ctx, TokenType.LBRACE);
  const statements = parseStatementsUntil(ctx, TokenType.RBRACE);
  if (!statements.ok) return statements;
  consume(ctx, TokenType.RBRACE);
  return {
    ok: true,
    value: { type: NodeType.BlockExpression, statements: statements.value },
  };
}

function parseMatchExpression(ctx) {
  advance(ctx); // consume "match"
  const lparenResult = consume(ctx, TokenType.LPAREN);
  if (!lparenResult.ok) return lparenResult;
  const discriminantResult = parseExpression(ctx);
  if (!discriminantResult.ok) return discriminantResult;
  const rparenResult = consume(ctx, TokenType.RPAREN);
  if (!rparenResult.ok) return rparenResult;
  const lbraceResult = consume(ctx, TokenType.LBRACE);
  if (!lbraceResult.ok) return lbraceResult;
  const casesResult = parseMatchCases(ctx);
  if (!casesResult.ok) return casesResult;
  const rbraceResult = consume(ctx, TokenType.RBRACE);
  if (!rbraceResult.ok) return rbraceResult;
  if (!casesResult.hasWildcard) {
    return { ok: false, error: "Missing wildcard case" };
  }
  return {
    ok: true,
    value: {
      type: NodeType.MatchExpression,
      discriminant: discriminantResult.value,
      cases: casesResult.cases,
    },
  };
}

function parseMatchCases(ctx) {
  const cases = [];
  let hasWildcard = false;
  while (
    peek(ctx).type !== TokenType.RBRACE &&
    peek(ctx).type !== TokenType.EOF
  ) {
    const caseResult = consume(ctx, TokenType.KEYWORD);
    if (!caseResult.ok) return caseResult;
    if (caseResult.value.value !== "case") {
      return { ok: false, error: "Expected 'case' keyword" };
    }
    const patternResult = parseMatchPattern(ctx);
    if (!patternResult.ok) return patternResult;
    if (patternResult.isWildcard) hasWildcard = true;
    const arrowResult = consume(ctx, TokenType.ARROW);
    if (!arrowResult.ok) return arrowResult;
    const valueResult = parseExpression(ctx);
    if (!valueResult.ok) return valueResult;
    cases.push({
      type: NodeType.MatchCase,
      pattern: patternResult.pattern,
      value: valueResult.value,
    });
    if (peek(ctx).type === TokenType.SEMICOLON) {
      advance(ctx);
    }
  }
  return { ok: true, cases, hasWildcard };
}

function parseMatchPattern(ctx) {
  if (peek(ctx).type === TokenType.UNDERSCORE) {
    advance(ctx);
    return {
      ok: true,
      isWildcard: true,
      pattern: { type: NodeType.BooleanLiteral, value: true },
    };
  }
  const result = parsePrimaryExpression(ctx);
  if (!result.ok) return result;
  return { ok: true, isWildcard: false, pattern: result.value };
}

function parseLoopExpression(ctx) {
  advance(ctx); // consume "loop"
  const lbraceResult = consume(ctx, TokenType.LBRACE);
  if (!lbraceResult.ok) return lbraceResult;
  const bodyResult = parseLoopBody(ctx);
  if (!bodyResult.ok) return bodyResult;
  const rbraceResult = consume(ctx, TokenType.RBRACE);
  if (!rbraceResult.ok) return rbraceResult;
  if (!bodyResult.hasBreak) {
    return { ok: false, error: "Loop must contain at least one break" };
  }
  return {
    ok: true,
    value: {
      type: NodeType.LoopExpression,
      body: bodyResult.body,
    },
  };
}

function parseLoopBody(ctx) {
  const statements = [];
  let hasBreak = false;
  while (
    peek(ctx).type !== TokenType.RBRACE &&
    peek(ctx).type !== TokenType.EOF
  ) {
    const stmtResult = parseLoopStatement(ctx);
    if (!stmtResult.ok) return stmtResult;
    statements.push(stmtResult.value);
    if (stmtResult.isBreak) hasBreak = true;
    if (peek(ctx).type === TokenType.SEMICOLON) {
      advance(ctx);
    }
  }
  return { ok: true, body: statements, hasBreak };
}

function parseLoopStatement(ctx) {
  const token = peek(ctx);
  if (token.type === TokenType.KEYWORD && token.value === "break") {
    return parseBreakStatement(ctx);
  }
  if (token.type === TokenType.KEYWORD && token.value === "continue") {
    return parseContinueStatement(ctx);
  }
  return parseStatement(ctx);
}

function parseBreakStatement(ctx) {
  advance(ctx); // consume "break"
  const exprResult = parseExpression(ctx);
  if (!exprResult.ok) return exprResult;
  return {
    ok: true,
    isBreak: true,
    value: {
      type: NodeType.BreakStatement,
      value: exprResult.value,
    },
  };
}

function parseContinueStatement(ctx) {
  advance(ctx); // consume "continue"
  return {
    ok: true,
    isBreak: false,
    value: { type: NodeType.ContinueStatement },
  };
}

function parseStatementsUntil(ctx, stopType) {
  const statements = [];
  while (peek(ctx).type !== stopType && peek(ctx).type !== TokenType.EOF) {
    const stmtResult = parseStatement(ctx);
    if (!stmtResult.ok) return stmtResult;
    statements.push(stmtResult.value);
    if (peek(ctx).type === TokenType.SEMICOLON) {
      advance(ctx);
    }
  }
  return { ok: true, value: statements };
}

function parseMemberExpression(ctx) {
  let result = parsePrimaryExpression(ctx);
  if (!result.ok) return result;
  let node = result.value;
  while (peek(ctx).type === TokenType.DOT) {
    advance(ctx);
    const identResult = parseIdentifier(ctx);
    if (!identResult.ok) return identResult;
    node = {
      type: NodeType.MemberExpression,
      object: node,
      property: identResult.value.name,
    };
  }
  return { ok: true, value: node };
}

function parseExpression(ctx) {
  return parseOrExpression(ctx);
}

function parseOrExpression(ctx) {
  return parseBinaryExpression(ctx, parseAndExpression, [TokenType.OR]);
}

function parseAndExpression(ctx) {
  return parseBinaryExpression(ctx, parseComparisonExpression, [TokenType.AND]);
}

function parseComparisonExpression(ctx) {
  return parseBinaryExpression(ctx, parseAdditiveExpression, [
    TokenType.EQ,
    TokenType.NEQ,
    TokenType.LT,
    TokenType.GT,
    TokenType.LTE,
    TokenType.GTE,
  ]);
}

function parseBinaryExpression(ctx, parseLower, operators) {
  let left = parseLower(ctx);
  if (!left.ok) return left;
  while (operators.includes(peek(ctx).type)) {
    const op = tokenToOperator(peek(ctx).type);
    advance(ctx);
    const right = parseLower(ctx);
    if (!right.ok) return right;
    left = {
      ok: true,
      value: {
        type: NodeType.BinaryExpression,
        operator: op,
        left: left.value,
        right: right.value,
      },
    };
  }
  return left;
}

const operatorMap = {
  [TokenType.PLUS]: "+",
  [TokenType.MINUS]: "-",
  [TokenType.STAR]: "*",
  [TokenType.SLASH]: "/",
  [TokenType.EQ]: "==",
  [TokenType.NEQ]: "!=",
  [TokenType.LT]: "<",
  [TokenType.GT]: ">",
  [TokenType.LTE]: "<=",
  [TokenType.GTE]: ">=",
  [TokenType.AND]: "&&",
  [TokenType.OR]: "||",
};

function tokenToOperator(type) {
  return operatorMap[type] || "";
}

function parseAdditiveExpression(ctx) {
  return parseBinaryExpression(ctx, parseMultiplicativeExpression, [
    TokenType.PLUS,
    TokenType.MINUS,
  ]);
}

function parseMultiplicativeExpression(ctx) {
  return parseBinaryExpression(ctx, parseMemberExpression, [
    TokenType.STAR,
    TokenType.SLASH,
  ]);
}

function parseLetDeclaration(ctx) {
  const keywordResult = consume(ctx, TokenType.KEYWORD);
  if (!keywordResult.ok) return keywordResult;
  if (keywordResult.value.value !== "let") {
    return { ok: false, error: "Expected 'let' keyword" };
  }
  const identResult = parseIdentifier(ctx);
  if (!identResult.ok) return identResult;
  const name = identResult.value.name;
  const eqResult = consume(ctx, TokenType.ASSIGN);
  if (!eqResult.ok) return eqResult;
  const exprResult = parseExpression(ctx);
  if (!exprResult.ok) return exprResult;
  return {
    ok: true,
    value: { type: NodeType.LetDeclaration, name, init: exprResult.value },
  };
}

function parseFunctionDeclaration(ctx) {
  consume(ctx, TokenType.KEYWORD); // consume 'fn'
  const nameResult = parseIdentifier(ctx);
  if (!nameResult.ok) return nameResult;
  const name = nameResult.value.name;
  consume(ctx, TokenType.LPAREN);
  const params = [];
  while (
    peek(ctx).type !== TokenType.RPAREN &&
    peek(ctx).type !== TokenType.EOF
  ) {
    const paramResult = parseIdentifier(ctx);
    if (!paramResult.ok) return paramResult;
    params.push(paramResult.value.name);
    if (peek(ctx).type === TokenType.COMMA) {
      advance(ctx);
    }
  }
  consume(ctx, TokenType.RPAREN);
  consume(ctx, TokenType.ARROW);
  const bodyResult = parseExpression(ctx);
  if (!bodyResult.ok) return bodyResult;
  return {
    ok: true,
    value: {
      type: NodeType.FunctionDeclaration,
      name,
      params,
      body: bodyResult.value,
    },
  };
}

function parseStatement(ctx) {
  const token = peek(ctx);
  if (token.type === TokenType.KEYWORD && token.value === "let") {
    return parseLetDeclaration(ctx);
  }
  if (token.type === TokenType.KEYWORD && token.value === "fn") {
    return parseFunctionDeclaration(ctx);
  }
  return parseExpression(ctx);
}

// Parser entry point
function parse(tokens) {
  const ctx = { tokens, pos: 0 };
  const result = parseStatementsUntil(ctx, TokenType.EOF);
  if (!result.ok) return result;
  return {
    ok: true,
    value: { type: NodeType.Program, statements: result.value },
  };
}

const booleanOps = new Set(["==", "!=", "<", ">", "<=", ">=", "&&", "||"]);

function expressionMayBeBoolean(node) {
  if (node.type === NodeType.BooleanLiteral) return true;
  if (node.type === NodeType.UnaryExpression) return true;
  if (node.type === NodeType.BinaryExpression)
    return booleanOps.has(node.operator);
  return false;
}

// Code Generator
function generateCode(ast) {
  let code = "";
  const statements = ast.statements;
  for (let i = 0; i < statements.length - 1; i++) {
    code += generateStatement(statements[i]) + "; ";
  }
  if (statements.length > 0) {
    const lastStmt = statements[statements.length - 1];
    if (
      lastStmt.type === NodeType.LetDeclaration ||
      lastStmt.type === NodeType.FunctionDeclaration
    ) {
      code += generateStatement(lastStmt) + "; ";
    }
    const exprCode = generateExpression(lastStmt);
    const needsBoolWrap = expressionMayBeBoolean(lastStmt);
    code += "return " + (needsBoolWrap ? "+" + exprCode : exprCode) + ";";
  } else {
    code = "return 0;";
  }
  return code;
}

function generateStatement(node) {
  if (node.type === NodeType.LetDeclaration) {
    return generateDeclaration(node, "let");
  }
  if (node.type === NodeType.FunctionDeclaration) {
    return generateFunctionDeclaration(node);
  }
  return generateExpression(node);
}

function generateDeclaration(node, keyword) {
  const initCode = generateExpression(node.init);
  const needsCoerce = expressionMayBeBoolean(node.init);
  return (
    keyword +
    " " +
    node.name +
    " = " +
    (needsCoerce ? "+" + initCode : initCode)
  );
}

function generateFunctionDeclaration(node) {
  const params = node.params.join(", ");
  const body = generateExpression(node.body);
  return "function " + node.name + "(" + params + ") { return " + body + " }";
}

function generateCompoundExpression(node) {
  switch (node.type) {
    case NodeType.BlockExpression:
      return generateBlockExpression(node);
    case NodeType.LetDeclaration:
      return node.name;
    case NodeType.FunctionCall:
      return generateFunctionCall(node);
    case NodeType.MatchExpression:
      return generateMatchExpression(node);
    case NodeType.LoopExpression:
      return generateLoopExpression(node);
    default:
      return null;
  }
}

function generateExpression(node) {
  const compound = generateCompoundExpression(node);
  if (compound !== null) return compound;
  switch (node.type) {
    case NodeType.Identifier:
      return node.name;
    case NodeType.MemberExpression:
      return generateExpression(node.object) + "." + node.property;
    case NodeType.NumberLiteral:
      return node.value;
    case NodeType.StringLiteral:
      return generateStringLiteral(node);
    case NodeType.BooleanLiteral:
      return generateBooleanLiteral(node);
    case NodeType.UnaryExpression:
      return generateUnaryExpression(node);
    case NodeType.BinaryExpression:
      return generateBinaryExpression(node);
    case NodeType.ObjectLiteral:
      return generateObjectLiteral(node);
    default:
      return generateDefaultExpression();
  }
}

function generateDefaultExpression() {
  return "";
}

function generateBlockExpression(node) {
  const statements = node.statements;
  if (statements.length === 0) {
    return "(function() { return 0; })()";
  }
  let code = "(function() { ";
  for (let i = 0; i < statements.length - 1; i++) {
    code += generateStatement(statements[i]) + "; ";
  }
  const lastStmt = statements[statements.length - 1];
  const exprCode = generateExpression(lastStmt);
  const needsBoolWrap = expressionMayBeBoolean(lastStmt);
  code += "return " + (needsBoolWrap ? "+" + exprCode : exprCode) + "; })()";
  return code;
}

function generateMatchExpression(node) {
  const discriminant = generateExpression(node.discriminant);
  let code = "(function(v) { switch(v) { ";
  for (let i = 0; i < node.cases.length; i++) {
    const c = node.cases[i];
    const isWildcard =
      c.pattern.type === NodeType.BooleanLiteral &&
      c.pattern.value === true &&
      i === node.cases.length - 1;
    if (isWildcard) {
      code += "default: ";
    } else {
      code += "case " + generateExpression(c.pattern) + ": ";
    }
    const valueCode = generateExpression(c.value);
    const needsBoolWrap = expressionMayBeBoolean(c.value);
    code += "return " + (needsBoolWrap ? "+" + valueCode : valueCode) + "; ";
  }
  code += "}})(";
  code += discriminant + ")";
  return code;
}

let __loopCounter = 0;

function generateLoopExpression(node) {
  const resultVar = "__r" + __loopCounter++;
  let code = "(function() { var " + resultVar + "; while(true) { ";
  for (let i = 0; i < node.body.length; i++) {
    const stmt = node.body[i];
    code += generateLoopStatement(stmt, resultVar) + "; ";
  }
  code += "} return " + resultVar + "; })()";
  return code;
}

function generateLoopStatement(node, resultVar) {
  if (node.type === NodeType.BreakStatement) {
    const valueCode = generateExpression(node.value);
    const needsBoolWrap = expressionMayBeBoolean(node.value);
    return (
      resultVar +
      " = " +
      (needsBoolWrap ? "+" + valueCode : valueCode) +
      "; break;"
    );
  }
  if (node.type === NodeType.ContinueStatement) {
    return "continue;";
  }
  if (node.type === NodeType.LetDeclaration) {
    return generateDeclaration(node, "var");
  }
  if (node.type === NodeType.FunctionDeclaration) {
    return generateFunctionDeclaration(node);
  }
  return generateExpression(node);
}

function generateBooleanLiteral(node) {
  return node.value ? "1" : "0";
}

function generateUnaryExpression(node) {
  return node.operator + generateExpression(node.operand);
}

function generateStringLiteral(node) {
  return '"' + replaceChars(node.value) + '"';
}

function generateBinaryExpression(node) {
  return (
    "(" +
    generateExpression(node.left) +
    " " +
    node.operator +
    " " +
    generateExpression(node.right) +
    ")"
  );
}

function generateObjectLiteral(node) {
  const props = node.properties
    .map((p) => p.key + ": " + generateExpression(p.value))
    .join(", ");
  return "{" + props + "}";
}

function generateFunctionCall(node) {
  const args = node.arguments.map((a) => generateExpression(a)).join(", ");
  return node.name + "(" + args + ")";
}

function replaceChars(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "\\") {
      out += "\\\\";
    } else if (ch === '"') {
      out += '\\"';
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
  }
  return out;
}

function compile(source) {
  if (source === "") {
    return { ok: true, value: "return 0;" };
  }
  const tokenResult = tokenize(source);
  if (!tokenResult.ok) return tokenResult;
  const parseResult = parse(tokenResult.tokens);
  if (!parseResult.ok) return parseResult;
  const code = generateCode(parseResult.value);
  return { ok: true, value: code };
}

module.exports = { compile };
