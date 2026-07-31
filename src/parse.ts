import type { AstNode, Token, Identifier, BinaryOp } from "./types";

import { isIdentifierToken, isNumberToken, BINARY_OPS } from "./types";

// --- Parser: builds AST from tokens ---
export interface ParseResult {
  ast: AstNode;
  pos: number;
}

export interface StatementParseResult {
  ast: AstNode;
  pos: number;
}

export interface BlockParseResult {
  ast: AstNode;
  pos: number;
}

export interface ProgramParseResult {
  ast: AstNode;
  pos: number;
}

// Maps token type → operator string for binary operators
const TOKEN_TYPE_TO_OP: Record<string, BinaryOp["op"]> = {
  or: "||",
  and: "&&",
  less_equal: "<=",
  less: "<",
  greater_equal: ">=",
  greater: ">",
  plus: "+",
  minus: "-",
  multiply: "*",
  divide: "/",
};

interface OpEntry {
  op: BinaryOp["op"];
  prec: number;
}

function getBinaryOpEntry(token: Token): OpEntry | undefined {
  const op = TOKEN_TYPE_TO_OP[token.type];
  if (!op) return undefined;
  return { op, prec: BINARY_OPS[op].prec };
}

// parseBinaryOp: generic precedence-climbing parser for all binary operators
function parseBinaryOp(
  tokens: Token[],
  pos: number,
  minPrec: number,
): ParseResult {
  const left = parseFactor(tokens, pos);

  while (left.pos < tokens.length) {
    const entry = getBinaryOpEntry(tokens[left.pos]!);
    if (!entry || entry.prec < minPrec) break;

    const op = entry.op;
    left.pos++;
    const right = parseBinaryOp(tokens, left.pos, entry.prec + 1);
    left.ast = { type: "binary_op", op, left: left.ast, right: right.ast };
    left.pos = right.pos;
  }

  return left;
}

// parseAssignmentExpr: handles identifier assignment (lowest precedence)
function parseAssignmentExpr(tokens: Token[], pos: number): ParseResult {
  const exprResult = parseBinaryOp(tokens, pos, 1);

  // Check if this is an assignment: "identifier = expr"
  if (
    exprResult.ast.type === "identifier" &&
    exprResult.pos < tokens.length &&
    tokens[exprResult.pos]?.type === "assign"
  ) {
    const name = (exprResult.ast as Identifier).name;
    const i = exprResult.pos + 1; // skip '='
    const valueResult = parseAssignmentExpr(tokens, i); // right-recursive for chained assignments
    return {
      ast: { type: "assign_expr", name, value: valueResult.ast },
      pos: valueResult.pos,
    };
  }

  return exprResult;
}

// parseFactor: handles numbers, identifiers, and grouped expressions (highest precedence)
function parseFactor(tokens: Token[], pos: number): ParseResult {
  const token = tokens[pos]!;

  // Handle identifier reference (variable lookup)
  if (isIdentifierToken(token)) {
    return { ast: { type: "identifier", name: token.name }, pos: pos + 1 };
  }

  // Handle boolean literals
  if (token.type === "true_keyword") {
    return { ast: { type: "bool", value: true }, pos: pos + 1 };
  }
  if (token.type === "false_keyword") {
    return { ast: { type: "bool", value: false }, pos: pos + 1 };
  }

  // Handle if/else expressions
  if (token.type === "if_keyword") {
    // Parse "if (condition) then_expr else else_expr"
    let i = pos + 1;

    // Expect and parse condition inside parentheses: "(cond)"
    if (tokens[i]?.type !== "lparen") {
      throw new Error(`Expected '(' after 'if' at position ${i}`);
    }
    i++; // skip '('
    const condResult = parseBinaryOp(tokens, i, 1);
    i = condResult.pos;
    if (tokens[i]?.type !== "rparen") {
      throw new Error(`Expected ')' after condition at position ${i}`);
    }
    i++; // skip ')'

    // Parse then expression
    const thenResult = parseAssignmentExpr(tokens, i);
    i = thenResult.pos;

    // Expect 'else'
    if (tokens[i]?.type !== "else_keyword") {
      throw new Error(
        `Expected 'else' after if-then expression at position ${i}`,
      );
    }
    i++; // skip 'else'

    // Parse else expression
    const elseResult = parseAssignmentExpr(tokens, i);

    return {
      ast: {
        type: "if_expr",
        condition: condResult.ast,
        then: thenResult.ast,
        else_: elseResult.ast,
      },
      pos: elseResult.pos,
    };
  }

  // Handle grouped expression: recursively parse inside parens or braces
  if (token.type === "lparen") {
    const innerResult = parseBinaryOp(tokens, pos + 1, 1);
    return { ast: innerResult.ast, pos: innerResult.pos + 1 };
  }

  // Handle block with statements: let declarations and expressions separated by ;
  if (token.type === "lbrace") {
    const result = parseBlock(tokens, pos + 1);
    return { ast: result.ast, pos: result.pos };
  }

  if (!isNumberToken(token)) {
    throw new Error(`Unexpected token at position ${pos}`);
  }
  return { ast: { type: "number", value: token.value }, pos: pos + 1 };
}

// parseStatement: parses a single statement (let declaration, assignment, or expression)
export function parseStatement(
  tokens: Token[],
  index: number,
): StatementParseResult {
  const token = tokens[index]!;

  // Parse "let [mut] x = expr;"
  if (token.type === "let_keyword") {
    let i = index + 1; // skip 'let'

    // Check for optional 'mut' keyword
    const isMutable = tokens[i]?.type === "mut_keyword";
    if (isMutable) {
      i++; // skip 'mut'
    }

    const nameToken = tokens[i];
    if (!nameToken || !isIdentifierToken(nameToken)) {
      throw new Error(`Expected identifier after 'let' at position ${i}`);
    }
    const name = nameToken.name;
    i++; // skip identifier
    const assignToken = tokens[i];
    if (!assignToken || assignToken.type !== "assign") {
      throw new Error(`Expected '=' after variable name at position ${i}`);
    }
    i++; // skip '='
    const initResult = parseAssignmentExpr(tokens, i);
    return {
      ast: { type: "let", name, mutable: isMutable, init: initResult.ast },
      pos: initResult.pos,
    };
  }

  // Parse expression statement (may include assignment): "expr;"
  const exprResult = parseAssignmentExpr(tokens, index);
  return { ast: exprResult.ast, pos: exprResult.pos };
}

// skipSemicolon: consumes optional trailing semicolon
function skipSemicolon(tokens: Token[], index: number): number {
  if (index < tokens.length && tokens[index]!.type === "semicolon") {
    return index + 1;
  }
  return index;
}

// parseBlock: parses statements inside { ... } returning a block AST node
function parseBlock(tokens: Token[], pos: number): BlockParseResult {
  let index = pos;
  const statements: AstNode[] = [];

  while (index < tokens.length && tokens[index]!.type !== "rbrace") {
    const stmt = parseStatement(tokens, index);
    statements.push(stmt.ast);
    index = skipSemicolon(tokens, stmt.pos);
  }

  // Skip closing brace
  return { ast: { type: "block", statements }, pos: index + 1 };
}

// parseProgram: top-level statement sequence (let decls + expressions)
export function parseProgram(tokens: Token[], pos: number): ProgramParseResult {
  let index = pos;
  const statements: AstNode[] = [];

  while (index < tokens.length) {
    const stmt = parseStatement(tokens, index);
    statements.push(stmt.ast);
    index = skipSemicolon(tokens, stmt.pos);
  }

  return { ast: { type: "block", statements }, pos };
}
