// Token types
const TokenType = {
  IDENTIFIER: "IDENTIFIER",
  KEYWORD: "KEYWORD",
  SEMICOLON: "SEMICOLON",
  DOT: "DOT",
  ASSIGN: "ASSIGN",
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
    };
    if (singleCharTokens[ch]) {
      tokens.push({ type: singleCharTokens[ch], value: ch });
      i++;
      continue;
    }
    if (isIdentStart(ch)) {
      let ident = "";
      while (i < source.length && isIdentChar(source[i])) {
        ident += source[i];
        i++;
      }
      const type = isKeyword(ident) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
      tokens.push({ type, value: ident });
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
};

// Parser
function parse(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function consume(expectedType) {
    const token = tokens[pos];
    if (token.type !== expectedType) {
      return {
        ok: false,
        error: "Expected " + expectedType + " but got " + token.type,
      };
    }
    pos++;
    return { ok: true, value: token };
  }

  function parseIdentifier() {
    const result = consume(TokenType.IDENTIFIER);
    if (!result.ok) return result;
    return {
      ok: true,
      value: { type: NodeType.Identifier, name: result.value.value },
    };
  }

  function parsePrimaryExpression() {
    return parseIdentifier();
  }

  function parseMemberExpression() {
    let result = parsePrimaryExpression();
    if (!result.ok) return result;
    let node = result.value;
    while (peek().type === TokenType.DOT) {
      pos++; // consume dot
      const identResult = parseIdentifier();
      if (!identResult.ok) return identResult;
      node = {
        type: NodeType.MemberExpression,
        object: node,
        property: identResult.value.name,
      };
    }
    return { ok: true, value: node };
  }

  function parseExpression() {
    return parseMemberExpression();
  }

  function parseLetDeclaration() {
    const keywordResult = consume(TokenType.KEYWORD);
    if (!keywordResult.ok) return keywordResult;
    if (keywordResult.value.value !== "let") {
      return { ok: false, error: "Expected 'let' keyword" };
    }
    const identResult = parseIdentifier();
    if (!identResult.ok) return identResult;
    const name = identResult.value.name;
    const eqResult = consume(TokenType.ASSIGN);
    if (!eqResult.ok) return eqResult;
    const exprResult = parseExpression();
    if (!exprResult.ok) return exprResult;
    return {
      ok: true,
      value: { type: NodeType.LetDeclaration, name, init: exprResult.value },
    };
  }

  function parseStatement() {
    const token = peek();
    if (token.type === TokenType.KEYWORD && token.value === "let") {
      return parseLetDeclaration();
    }
    return parseExpression();
  }

  // Parse program
  const statements = [];
  while (peek().type !== TokenType.EOF) {
    const stmtResult = parseStatement();
    if (!stmtResult.ok) return stmtResult;
    statements.push(stmtResult.value);
    if (peek().type === TokenType.SEMICOLON) {
      pos++; // consume semicolon
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
