import type {
  AstNode,
  Token,
  Identifier,
  BinaryOp,
  MatchArm,
  MatchPattern,
} from "./types";

import {
  isIdentifierToken,
  isNumberToken,
  BINARY_OPS,
  COMPOUND_ASSIGN_OPS,
} from "./types";

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

// Static analysis: does the AST node produce a value when evaluated?
function producesValue(node: AstNode): boolean {
  switch (node.type) {
    case "number":
    case "bool":
    case "identifier":
    case "binary_op":
      return true;
    case "block":
      return (
        node.statements.length > 0 &&
        producesValue(node.statements[node.statements.length - 1]!)
      );
    case "if_expr":
      if (node.else_ === null) return false;
      return producesValue(node.then) && producesValue(node.else_);
    case "match_expr":
      return true;
    case "let":
    case "assign_expr":
    case "while_expr":
      return false;
    case "continue":
    case "break":
      return false;
  }
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

  // Desugar compound assignments: "identifier += expr" → "identifier = identifier + expr"
  if (exprResult.ast.type === "identifier" && exprResult.pos < tokens.length) {
    const compoundOp = COMPOUND_ASSIGN_OPS[tokens[exprResult.pos]!.type];
    if (compoundOp) {
      const name = (exprResult.ast as Identifier).name;
      const i = exprResult.pos + 1;
      const valueResult = parseAssignmentExpr(tokens, i);
      const idNode: Identifier = { type: "identifier", name };
      const binaryOp: BinaryOp = {
        type: "binary_op",
        op: compoundOp,
        left: idNode,
        right: valueResult.ast,
      };
      return {
        ast: { type: "assign_expr", name, value: binaryOp },
        pos: valueResult.pos,
      };
    }
  }

  return exprResult;
}

// parseParenCondition: parses condition wrapped in parentheses "(expr)", returns condition AST and position after ')'
function parseParenCondition(tokens: Token[], pos: number): ParseResult {
  if (tokens[pos]?.type !== "lparen") {
    throw new Error(`Expected '(' at position ${pos}`);
  }
  const innerResult = parseBinaryOp(tokens, pos + 1, 1);
  if (tokens[innerResult.pos]?.type !== "rparen") {
    throw new Error(
      `Expected ')' after condition at position ${innerResult.pos}`,
    );
  }
  return { ast: innerResult.ast, pos: innerResult.pos + 1 };
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

    const condResult = parseParenCondition(tokens, i);
    i = condResult.pos;

    // Parse then expression
    const thenResult = parseAssignmentExpr(tokens, i);
    i = thenResult.pos;

    // Check for optional 'else' clause
    let elseResult: ParseResult | null = null;
    if (tokens[i]?.type === "else_keyword") {
      i++; // skip 'else'
      elseResult = parseAssignmentExpr(tokens, i);
    }

    return {
      ast: {
        type: "if_expr",
        condition: condResult.ast,
        then: thenResult.ast,
        else_: elseResult?.ast ?? null,
      },
      pos: elseResult ? elseResult.pos : thenResult.pos,
    };
  }
  // Handle match expression: match (scrutinee) { case pattern => expr; ... }
  if (token.type === "match_keyword") {
    let i = pos + 1; // skip 'match'

    // Expect scrutinee in parentheses: "(expr)"
    if (tokens[i]?.type !== "lparen") {
      throw new Error(`Expected '(' after 'match' at position ${i}`);
    }
    i++; // skip '('
    const scrutineeResult = parseBinaryOp(tokens, i, 1);
    i = scrutineeResult.pos;
    if (tokens[i]?.type !== "rparen") {
      throw new Error(`Expected ')' after scrutinee at position ${i}`);
    }
    i++; // skip ')'

    // Expect opening brace
    if (tokens[i]?.type !== "lbrace") {
      throw new Error(`Expected '{' after match condition at position ${i}`);
    }
    i++; // skip '{'

    // Parse arms
    const arms: MatchArm[] = [];
    while (i < tokens.length && tokens[i]?.type !== "rbrace") {
      if (tokens[i]?.type !== "case_keyword") {
        throw new Error(`Expected 'case' at position ${i}`);
      }
      i++; // skip 'case'

      // Parse pattern
      let pattern: MatchPattern;
      const patternToken = tokens[i]!;
      if (patternToken.type === "underscore_keyword") {
        pattern = { type: "wildcard" };
        i++;
      } else if (isNumberToken(patternToken)) {
        pattern = { type: "number", value: patternToken.value };
        i++;
      } else if (isIdentifierToken(patternToken)) {
        pattern = { type: "identifier", name: patternToken.name };
        i++;
      } else {
        throw new Error(`Expected pattern at position ${i}`);
      }

      // Expect '=>'
      if (tokens[i]?.type !== "arrow") {
        throw new Error(`Expected '=>' after pattern at position ${i}`);
      }
      i++; // skip '=>'

      // Parse body
      const bodyResult = parseAssignmentExpr(tokens, i);
      arms.push({ pattern, body: bodyResult.ast });
      i = bodyResult.pos;

      // Skip optional semicolon
      if (tokens[i]?.type === "semicolon") {
        i++;
      }
    }

    // Skip closing brace
    if (tokens[i]?.type !== "rbrace") {
      throw new Error(`Expected '}' at position ${i}`);
    }
    i++; // skip '}'

    return {
      ast: {
        type: "match_expr",
        scrutinee: scrutineeResult.ast,
        arms,
      } as AstNode,
      pos: i,
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
    if (!producesValue(initResult.ast)) {
      throw new Error(
        `Let declaration requires a value expression at position ${i}`,
      );
    }
    return {
      ast: { type: "let", name, mutable: isMutable, init: initResult.ast },
      pos: initResult.pos,
    };
  }

  // Parse "while (condition) body"
  if (token.type === "while_keyword") {
    const condResult = parseParenCondition(tokens, index + 1);

    // Parse body (typically a block, but can be any expression)
    const bodyResult = parseAssignmentExpr(tokens, condResult.pos);
    return {
      ast: {
        type: "while_expr",
        condition: condResult.ast,
        body: bodyResult.ast,
      } as AstNode,
      pos: bodyResult.pos,
    };
  }

  // Parse "continue;"
  if (token.type === "continue_keyword") {
    return { ast: { type: "continue" } as AstNode, pos: index + 1 };
  }

  // Parse "break;"
  if (token.type === "break_keyword") {
    return { ast: { type: "break" } as AstNode, pos: index + 1 };
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
