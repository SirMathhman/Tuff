import { TokenType } from "./tokenizer.js";

// AST Node Types
export const NodeType = {
  Program: "Program",
  LetStatement: "LetStatement",
  StructDeclaration: "StructDeclaration",
  TypeAlias: "TypeAlias",
  FunctionDeclaration: "FunctionDeclaration",
  ExpressionStatement: "ExpressionStatement",
  CallExpression: "CallExpression",
  DotExpression: "DotExpression",
  BinaryExpression: "BinaryExpression",
  NumberLiteral: "NumberLiteral",
  StringLiteral: "StringLiteral",
  Identifier: "Identifier",
  ObjectLiteral: "ObjectLiteral",
};

// Helper to consume an optional trailing semicolon and advance position
function maybeConsumeSemicolon(tokens, pos) {
  if (tokens[pos]?.type === TokenType.SEMICOLON) {
    return pos + 1;
  }
  return pos;
}

export function parse(tokens) {
  const ast = [];
  let pos = 0;

  while (tokens[pos].type !== TokenType.EOF) {
    // Empty statement (just semicolon or EOF with no content)
    if (
      tokens[pos].type === TokenType.SEMICOLON ||
      tokens[pos].type === TokenType.EOF
    ) {
      break;
    }

    const stmt = parseStatement(tokens, pos);
    if (stmt.variant === "err") return stmt;
    ast.push(stmt.statement);
    pos = stmt.nextPos;
  }

  return { variant: "ok", node: { type: NodeType.Program, body: ast } };
}

function parseStatement(tokens, pos) {
  // Function declaration: fn NAME() => expr ;
  if (tokens[pos].type === TokenType.FN_DECLARATION) {
    const result = parseFunctionDeclaration(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: {
        type: NodeType.FunctionDeclaration,
        name: result.name,
        body: result.body,
      },
      nextPos: result.nextPos,
    };
  }

  // Type alias: type IDENT = TYPE ;
  if (tokens[pos].type === TokenType.TYPE_ALIAS) {
    const result = parseTypeAlias(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: { type: NodeType.TypeAlias, name: result.name },
      nextPos: result.nextPos,
    };
  }

  // Struct declaration
  if (tokens[pos].type === TokenType.STRUCT) {
    const result = parseStructDeclaration(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: { type: NodeType.StructDeclaration, name: result.name },
      nextPos: result.nextPos,
    };
  }

  // Let statement
  if (tokens[pos].type === TokenType.LET) {
    const result = parseLetStatement(tokens, pos);
    if (result.variant === "err") return result;
    return {
      statement: {
        type: NodeType.LetStatement,
        name: result.name,
        value: result.value,
      },
      nextPos: result.nextPos,
    };
  }

  // Expression statement
  const expr = parseExpression(tokens, pos);
  if (expr.variant === "err") return expr;

  let p = maybeConsumeSemicolon(tokens, expr.nextPos);

  return {
    statement: { type: NodeType.ExpressionStatement, expression: expr.node },
    nextPos: p,
  };
}

// fn NAME() => expr ;
function parseFunctionDeclaration(tokens, pos) {
  if (tokens[pos].type !== TokenType.FN_DECLARATION)
    return { variant: "err", error: `Expected 'fn' at position ${pos}` };
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return {
      variant: "err",
      error: `Expected function name after 'fn' at position ${pos}`,
    };
  pos++;

  // Consume '('
  if (!tokens[pos] || tokens[pos].type !== TokenType.LPAREN)
    return { variant: "err", error: `Expected '(' for parameter list` };
  pos++;

  // Consume ')'
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.RPAREN) {
    pos++;
  }
  if (!tokens[pos])
    return { variant: "err", error: `Expected ')' to close parameter list` };
  pos++; // consume ')'

  // Optional return type annotation : Type
  if (tokens[pos]?.type === TokenType.COLON) {
    pos++; // consume ':'
    while (
      pos < tokens.length &&
      tokens[pos].type !== TokenType.FAT_ARROW &&
      tokens[pos].type !== TokenType.EOF
    ) {
      pos++;
    }
  }

  // Consume '=>'
  if (!tokens[pos] || tokens[pos].type !== TokenType.FAT_ARROW)
    return {
      variant: "err",
      error: `Expected '=>' for function body at position ${pos}`,
    };
  pos++;

  // Parse expression body
  const expr = parseExpression(tokens, pos);
  if (expr.variant === "err") return expr;

  let p = expr.nextPos;

  // Consume trailing semicolon if present
  p = maybeConsumeSemicolon(tokens, p);

  return { name, body: expr.node, nextPos: p };
}

// type IDENT = TYPE ;
function parseTypeAlias(tokens, pos) {
  if (tokens[pos].type !== TokenType.TYPE_ALIAS)
    return { variant: "err", error: `Expected 'type' at position ${pos}` };
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return {
      variant: "err",
      error: `Expected alias name after 'type' at position ${pos}`,
    };
  pos++;

  // Consume '='
  if (!tokens[pos] || tokens[pos].type !== TokenType.EQUALS) {
    const found = tokens[pos]?.value ?? "end of input";
    return {
      variant: "err",
      error: `Expected '=' for type alias '${name}', but found '${found}' at position ${pos}`,
    };
  }
  pos++;

  // Skip to semicolon (consume the RHS type expression — no validation needed)
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.SEMICOLON) {
    pos++;
  }
  if (!tokens[pos])
    return {
      variant: "err",
      error: `Expected ';' to end type alias '${name}'`,
    };
  pos++; // consume ';'

  return { name, nextPos: pos };
}

// struct IDENT <T, U> { ... }
function parseStructDeclaration(tokens, pos) {
  if (tokens[pos].type !== TokenType.STRUCT)
    return { variant: "err", error: `Expected 'struct' at position ${pos}` };
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return {
      variant: "err",
      error: `Expected struct name after 'struct' at position ${pos}`,
    };
  pos++;

  // Optional generic parameters <T, U>
  if (tokens[pos]?.type === TokenType.LT) {
    pos++; // consume '<'
    while (pos < tokens.length && tokens[pos]?.type !== TokenType.GT) {
      pos++;
    }
    if (!tokens[pos])
      return {
        variant: "err",
        error: `Expected '>' to close generic parameters for struct '${name}'`,
      };
    pos++; // consume '>'
  }

  // Consume opening brace
  if (!tokens[pos] || tokens[pos].type !== TokenType.LBRACE)
    return {
      variant: "err",
      error: `Expected '{' for struct body of '${name}'`,
    };
  pos++;

  // Skip to closing brace (empty body for now — no field parsing yet)
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.RBRACE) {
    pos++;
  }
  if (!tokens[pos])
    return { variant: "err", error: `Expected '}' to close struct '${name}'` };
  pos++; // consume '}'

  return { name, nextPos: pos };
}

function parseLetStatement(tokens, pos) {
  // let IDENT : Type? = expr ;
  if (tokens[pos].type !== TokenType.LET)
    return { variant: "err", error: `Expected 'let' at position ${pos}` };
  pos++;

  const name = tokens[pos].value;
  if (tokens[pos].type !== TokenType.IDENT)
    return {
      variant: "err",
      error: `Expected identifier after 'let' at position ${pos}`,
    };
  pos++;

  // Optional type annotation : Type
  if (tokens[pos]?.type === TokenType.COLON) {
    pos++; // consume ':'
    while (
      pos < tokens.length &&
      tokens[pos].type !== TokenType.EQUALS &&
      tokens[pos].type !== TokenType.SEMICOLON &&
      tokens[pos].type !== TokenType.EOF
    ) {
      pos++;
    }
  }

  // Consume '=' if present
  if (tokens[pos]?.type === TokenType.EQUALS) {
    pos++;
  }

  const expr = parseExpression(tokens, pos);
  if (expr.variant === "err") return expr;

  let p = maybeConsumeSemicolon(tokens, expr.nextPos);

  return { name, value: expr.node, nextPos: p };
}

// Expression parsing with operator precedence (simple left-to-right for now)
function parseExpression(tokens, pos) {
  const primary = parsePrimary(tokens, pos);
  if (primary.variant === "err") return primary;

  let result = primary.node; // unwrap to get actual AST node
  let p = primary.nextPos;

  // Dot access: expr.property
  while (
    tokens[p]?.type === TokenType.DOT &&
    tokens[p + 1]?.type === TokenType.IDENT
  ) {
    p++; // consume '.'
    const property = tokens[p].value;
    p++;
    result = { type: NodeType.DotExpression, object: result, property };
  }

  while (
    tokens[p]?.type === TokenType.PLUS ||
    tokens[p]?.type === TokenType.MINUS ||
    tokens[p]?.type === TokenType.STAR ||
    tokens[p]?.type === TokenType.SLASH
  ) {
    const op = tokens[p].value;
    p++;
    const rightPrimary = parsePrimary(tokens, p);
    if (rightPrimary.variant === "err") return rightPrimary;

    p = rightPrimary.nextPos;

    result = {
      type: NodeType.BinaryExpression,
      operator: op,
      left: result,
      right: rightPrimary.node,
    };
  }

  return { node: result, nextPos: p };
}

function parsePrimary(tokens, pos) {
  // Number literal
  if (!tokens[pos])
    return {
      variant: "err",
      error: `Unexpected end of input at position ${pos}`,
    };

  if (tokens[pos].type === TokenType.STRING_LITERAL) {
    const value = tokens[pos].value;
    pos++;
    return { node: { type: NodeType.StringLiteral, value }, nextPos: pos };
  }

  if (tokens[pos].type === TokenType.NUMBER) {
    const value = tokens[pos].value;
    pos++;
    return { node: { type: NodeType.NumberLiteral, value }, nextPos: pos };
  }

  // Object literal / struct instantiation {}
  if (tokens[pos]?.type === TokenType.LBRACE) {
    pos++; // consume '{'
    while (pos < tokens.length && tokens[pos].type !== TokenType.RBRACE) {
      pos++;
    }
    if (!tokens[pos])
      return { variant: "err", error: `Expected '}' to close object literal` };
    pos++; // consume '}'
    return { node: { type: NodeType.ObjectLiteral }, nextPos: pos };
  }

  // Identifier or function call
  if (tokens[pos].type === TokenType.IDENT) {
    const name = tokens[pos].value;
    pos++;

    // Check for function call
    if (tokens[pos]?.type === TokenType.LPAREN) {
      pos++; // consume '('
      pos++; // consume ')' — no args yet, just expect closing paren
      return {
        node: { type: NodeType.CallExpression, name, arguments: [] },
        nextPos: pos,
      };
    }

    return { node: { type: NodeType.Identifier, name }, nextPos: pos };
  }

  return {
    variant: "err",
    error: `Unexpected token at position ${pos}: ${tokens[pos]?.type}`,
  };
}
