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
  EOF: "EOF",
};

// Tokenizer
function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isIdentStart(ch) {
  return /[a-zA-Z_$]/.test(ch);
}

function isIdentChar(ch) {
  return /[a-zA-Z0-9_$]/.test(ch);
}

function isKeyword(ident) {
  return ["let"].includes(ident);
}

function isDigit(ch) {
  return /[0-9]/.test(ch);
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
      const type = isKeyword(identResult)
        ? TokenType.KEYWORD
        : TokenType.IDENTIFIER;
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

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      i++;
      continue;
    }
    const singleCharTokens = {
      ";": TokenType.SEMICOLON,
      ".": TokenType.DOT,
      "=": TokenType.ASSIGN,
      "{": TokenType.LBRACE,
      "}": TokenType.RBRACE,
      ":": TokenType.COLON,
      ",": TokenType.COMMA,
    };
    if (singleCharTokens[ch]) {
      tokens.push({ type: singleCharTokens[ch], value: ch });
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

// AST Node Types
const NodeType = {
  Program: "Program",
  LetDeclaration: "LetDeclaration",
  Identifier: "Identifier",
  MemberExpression: "MemberExpression",
  NumberLiteral: "NumberLiteral",
  StringLiteral: "StringLiteral",
  ObjectLiteral: "ObjectLiteral",
  ObjectProperty: "ObjectProperty",
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
  if (token.type === TokenType.LBRACE) {
    return parseObjectLiteral(ctx);
  }
  return parseIdentifier(ctx);
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
  return parseMemberExpression(ctx);
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

function parseStatement(ctx) {
  const token = peek(ctx);
  if (token.type === TokenType.KEYWORD && token.value === "let") {
    return parseLetDeclaration(ctx);
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

// Code Generator
function generateCode(ast) {
  let code = "";
  const statements = ast.statements;
  for (let i = 0; i < statements.length - 1; i++) {
    code += generateStatement(statements[i]) + "; ";
  }
  if (statements.length > 0) {
    const lastStmt = statements[statements.length - 1];
    code += "return " + generateExpression(lastStmt) + ";";
  } else {
    code = "return 0;";
  }
  return code;
}

function generateStatement(node) {
  if (node.type === NodeType.LetDeclaration) {
    return "let " + node.name + " = " + generateExpression(node.init);
  }
  return generateExpression(node);
}

function generateExpression(node) {
  if (node.type === NodeType.Identifier) {
    return node.name;
  }
  if (node.type === NodeType.MemberExpression) {
    return generateExpression(node.object) + "." + node.property;
  }
  if (node.type === NodeType.NumberLiteral) {
    return node.value;
  }
  if (node.type === NodeType.StringLiteral) {
    const escaped = node.value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
    return '"' + escaped + '"';
  }
  if (node.type === NodeType.ObjectLiteral) {
    const props = node.properties
      .map((p) => p.key + ": " + generateExpression(p.value))
      .join(", ");
    return "{" + props + "}";
  }
  return "";
}

export function compile(source) {
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
