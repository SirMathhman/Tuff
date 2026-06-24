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
  BlockStatement: "BlockStatement",
  ReturnStatement: "ReturnStatement",
};

// Helper to produce a parser error with line:col and surrounding token context
function err(message, tokens, pos) {
  const token = tokens[pos];
  const loc =
    token?.line && token?.col !== undefined
      ? `${token.line}:${token.col}`
      : `pos ${pos}`;
  return { variant: "err", error: `${message} at ${loc}` };
}

// Helper to consume an optional trailing semicolon and advance position
function maybeConsumeSemicolon(tokens, pos) {
  if (tokens[pos]?.type === TokenType.SEMICOLON) {
    return pos + 1;
  }
  return pos;
}

// Skip optional generic parameters <T, U> and return new position
function skipGenerics(tokens, pos) {
  if (tokens[pos]?.type !== TokenType.LT) return pos;
  pos++; // consume '<'
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.GT) {
    pos++;
  }
  return pos + 1; // consume '>'
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
        params: result.params,
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
    return err(`Expected 'fn'`, tokens, pos);
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err(`Expected function name after 'fn'`, tokens, pos);
  pos++;

  // Consume '(' and parse parameters
  if (!tokens[pos] || tokens[pos].type !== TokenType.LPAREN)
    return err("Expected '(' for parameter list", tokens, pos);
  pos++;

  const params = [];
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.RPAREN) {
    if (tokens[pos]?.type === TokenType.IDENT) {
      params.push(tokens[pos].value);
      pos++;
    } else {
      return err(`Expected parameter name in function '${name}'`, tokens, pos);
    }

    // Optional type annotation : Type
    if (tokens[pos]?.type === TokenType.COLON) {
      pos++; // consume ':'
      while (
        pos < tokens.length &&
        tokens[pos].type !== TokenType.COMMA &&
        tokens[pos].type !== TokenType.RPAREN &&
        tokens[pos].type !== TokenType.EOF
      ) {
        pos++;
      }
    }

    // Optional comma separator
    if (tokens[pos]?.type === TokenType.COMMA) {
      pos++;
    }
  }

  if (!tokens[pos])
    return err(
      `Expected ')' to close parameter list for function '${name}'`,
      tokens,
      pos,
    );
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
    return err(`Expected '=>' for function body of '${name}'`, tokens, pos);
  pos++;

  // Function body: either { ... } block or a single expression
  let body;
  let p;
  if (tokens[pos]?.type === TokenType.LBRACE) {
    const result = parseBlock(tokens, pos);
    if (result.variant === "err") return result;
    body = result.node;
    p = result.nextPos;
  } else {
    const expr = parseExpression(tokens, pos);
    if (expr.variant === "err") return expr;
    body = { type: NodeType.ExpressionStatement, expression: expr.node };
    p = expr.nextPos;
  }

  // Consume trailing semicolon if present

  // Consume trailing semicolon if present
  p = maybeConsumeSemicolon(tokens, p);

  return { name, params, body, nextPos: p };
}

// Parse a block statement: { stmt; stmt; ... }
function parseBlock(tokens, pos) {
  const statements = [];
  if (tokens[pos]?.type !== TokenType.LBRACE)
    return err("Expected '{'", tokens, pos);
  pos++;

  while (
    pos < tokens.length &&
    tokens[pos].type !== TokenType.RBRACE &&
    tokens[pos].type !== TokenType.EOF
  ) {
    // Return statement inside block: return expr ;
    if (
      tokens[pos]?.value === "return" &&
      tokens[pos]?.type === TokenType.IDENT
    ) {
      pos++; // consume 'return'
      const expr = parseExpression(tokens, pos);
      if (expr.variant === "err") return expr;
      statements.push({
        type: NodeType.ReturnStatement,
        expression: expr.node,
      });
      pos = expr.nextPos;
      pos = maybeConsumeSemicolon(tokens, pos);
    } else {
      const stmt = parseStatement(tokens, pos);
      if (stmt.variant === "err") return stmt;
      statements.push(stmt.statement);
      pos = stmt.nextPos;
    }
  }

  if (!tokens[pos]) return err("Expected '}' to close block", tokens, pos);
  pos++;

  return {
    node: { type: NodeType.BlockStatement, body: statements },
    nextPos: pos,
  };
}

// type IDENT <T, U>? = TYPE ;
function parseTypeAlias(tokens, pos) {
  if (tokens[pos].type !== TokenType.TYPE_ALIAS)
    return err(`Expected 'type'`, tokens, pos);
  pos++;

  const name = tokens[pos]?.value;
  if (tokens[pos]?.type !== TokenType.IDENT)
    return err("Expected alias name after 'type'", tokens, pos);
  pos++;

  // Optional generic parameters <T, U>
  if (tokens[pos]?.type === TokenType.LT) {
    pos = skipGenerics(tokens, pos);
    if (!tokens[pos])
      return err(
        `Expected '>' to close generic parameters for type alias '${name}'`,
        tokens,
        pos,
      );
  }

  // Consume '='
  if (!tokens[pos] || tokens[pos].type !== TokenType.EQUALS) {
    const found = tokens[pos]?.value ?? "end of input";
    return err(
      `Expected '=' for type alias '${name}', but found '${found}'`,
      tokens,
      pos,
    );
  }
  pos++;

  // Skip to semicolon (consume the RHS type expression — no validation needed)
  while (pos < tokens.length && tokens[pos]?.type !== TokenType.SEMICOLON) {
    pos++;
  }
  if (!tokens[pos])
    return err(`Expected ';' to end type alias '${name}'`, tokens, pos);
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
    pos = skipGenerics(tokens, pos);
    if (!tokens[pos])
      return {
        variant: "err",
        error: `Expected '>' to close generic parameters for struct '${name}'`,
      };
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
  if (!tokens[pos]) return err("Unexpected end of input", tokens, pos);

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
      return err("Expected '}' to close object literal", tokens, pos);
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
      const args = [];

      while (pos < tokens.length && tokens[pos].type !== TokenType.RPAREN) {
        const argResult = parseExpression(tokens, pos);
        if (argResult.variant === "err") return argResult;
        args.push(argResult.node);
        pos = argResult.nextPos;

        // Optional comma separator
        if (tokens[pos]?.type === TokenType.COMMA) {
          pos++;
        }
      }

      if (!tokens[pos])
        return err(
          `Expected ')' to close call expression for '${name}'`,
          tokens,
          pos,
        );
      pos++; // consume ')'

      return {
        node: { type: NodeType.CallExpression, name, arguments: args },
        nextPos: pos,
      };
    }

    return { node: { type: NodeType.Identifier, name }, nextPos: pos };
  }

  // Build context snippet from surrounding tokens for better diagnostics
  const start = Math.max(0, pos - 3);
  const end = Math.min(tokens.length, pos + 4);
  const snippet = [];
  for (let i = start; i < end; i++) {
    const marker = i === pos ? " <--" : "";
    snippet.push(`${tokens[i].value ?? tokens[i].type}${marker}`);
  }

  return err(
    `Unexpected token '${tokens[pos]?.value}' (${tokens[pos]?.type}). Context: [${snippet.join(", ")}]`,
    tokens,
    pos,
  );
}
