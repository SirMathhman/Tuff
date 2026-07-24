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
  return ["let", "fn", "true", "false"].includes(ident);
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
  return ident.length > 0 ? ident : null;
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
    const identResult = readIdentifier(source, i);
    if (identResult) {
      let type;
      if (identResult === "true" || identResult === "false") {
        type = TokenType.BOOLEAN;
      } else if (isKeyword(identResult)) {
        type = TokenType.KEYWORD;
      } else {
        type = TokenType.IDENTIFIER;
      }
      return {
        token: { type, value: identResult },
        length: identResult.length,
      };
    }
  }
  if (isDigit(ch)) {
    const numResult = readNumber(source, i);
    if (numResult) {
      return {
        token: { type: TokenType.NUMBER, value: numResult },
        length: numResult.length,
      };
    }
  }
  if (ch === '"') {
    const stringResult = readString(source, i);
    if (stringResult) {
      return {
        token: { type: TokenType.STRING, value: stringResult.value },
        length: stringResult.length,
      };
    }
  }
  return null;
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
    return parseObjectLiteral(ctx);
  }
  if (token.type === TokenType.NOT) {
    return parseUnaryNot(ctx);
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
  const statements = [];
  while (peek(ctx).type !== TokenType.EOF) {
    const stmtResult = parseStatement(ctx);
    if (!stmtResult.ok) return stmtResult;
    statements.push(stmtResult.value);
    if (peek(ctx).type === TokenType.SEMICOLON) {
      advance(ctx);
    }
  }
  return { ok: true, value: { type: NodeType.Program, statements } };
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
    const initCode = generateExpression(node.init);
    const needsCoerce = expressionMayBeBoolean(node.init);
    return (
      "let " + node.name + " = " + (needsCoerce ? "+" + initCode : initCode)
    );
  }
  if (node.type === NodeType.FunctionDeclaration) {
    const params = node.params.join(", ");
    const body = generateExpression(node.body);
    return "function " + node.name + "(" + params + ") { return " + body + " }";
  }
  return generateExpression(node);
}

function generateExpression(node) {
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
    case NodeType.FunctionCall:
      return generateFunctionCall(node);
    default:
      return "";
  }
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
