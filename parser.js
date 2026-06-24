import { TokenType } from "./tokenizer.js";

// AST Node Types
export const NodeType = {
  Program: "Program",
  LetStatement: "LetStatement",
  ExpressionStatement: "ExpressionStatement",
  CallExpression: "CallExpression",
  BinaryExpression: "BinaryExpression",
  NumberLiteral: "NumberLiteral",
  Identifier: "Identifier",
};

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
    ast.push(stmt.statement);
    pos = stmt.nextPos;
  }

  return { type: NodeType.Program, body: ast };
}

function parseStatement(tokens, pos) {
  // Let statement
  if (tokens[pos].type === TokenType.LET) {
    return parseLetStatement(tokens, pos);
  }

  // Expression statement
  const expr = parseExpression(tokens, pos);
  pos = expr.nextPos;

  // Consume trailing semicolon if present
  if (tokens[pos]?.type === TokenType.SEMICOLON) {
    pos++;
  }

  return {
    statement: { type: NodeType.ExpressionStatement, expression: expr.node },
    nextPos: pos,
  };
}

function parseLetStatement(tokens, pos) {
  // let IDENT = expr ;
  if (tokens[pos].type !== TokenType.LET) throw new Error("Expected 'let'");
  pos++;

  const name = tokens[pos].value;
  if (tokens[pos].type !== TokenType.IDENT)
    throw new Error("Expected identifier after 'let'");
  pos++;

  // Consume '=' if present
  if (tokens[pos]?.type === TokenType.EQUALS) {
    pos++;
  }

  const expr = parseExpression(tokens, pos);
  pos = expr.nextPos;

  // Consume trailing semicolon if present
  if (tokens[pos]?.type === TokenType.SEMICOLON) {
    pos++;
  }

  return {
    statement: { type: NodeType.LetStatement, name, value: expr.node },
    nextPos: pos,
  };
}

// Expression parsing with operator precedence (simple left-to-right for now)
function parseExpression(tokens, pos) {
  const primary = parsePrimary(tokens, pos);
  let result = primary.node; // unwrap to get actual AST node
  pos = primary.nextPos;

  while (
    tokens[pos]?.type === TokenType.PLUS ||
    tokens[pos]?.type === TokenType.MINUS ||
    tokens[pos]?.type === TokenType.STAR ||
    tokens[pos]?.type === TokenType.SLASH
  ) {
    const op = tokens[pos].value;
    pos++;
    const rightPrimary = parsePrimary(tokens, pos);
    pos = rightPrimary.nextPos;

    result = {
      type: NodeType.BinaryExpression,
      operator: op,
      left: result,
      right: rightPrimary.node,
    };
  }

  return { node: result, nextPos: pos };
}

function parsePrimary(tokens, pos) {
  // Number literal
  if (tokens[pos].type === TokenType.NUMBER) {
    const value = tokens[pos].value;
    pos++;
    return { node: { type: NodeType.NumberLiteral, value }, nextPos: pos };
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

  throw new Error(`Unexpected token at position ${pos}: ${tokens[pos]?.type}`);
}
