import type {
  AstNode,
  Token,
  Identifier,
  BinaryOp,
  MatchArm,
  MatchPattern,
} from "./types";

import type { Result, ParseError } from "./types";

import {
  isIdentifierToken,
  isNumberToken,
  BINARY_OPS,
  COMPOUND_ASSIGN_OPS,
} from "./types";

import { producesValue } from "./analyze";

// --- Parser: builds AST from tokens ---
export interface ParseResult {
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
): Result<ParseResult, ParseError> {
  const leftResult = parseFactor(tokens, pos);
  if (!leftResult.ok) return leftResult;
  const left = leftResult.value;

  while (left.pos < tokens.length) {
    const entry = getBinaryOpEntry(tokens[left.pos]!);
    if (!entry || entry.prec < minPrec) break;

    const op = entry.op;
    left.pos++;
    const rightResult = parseBinaryOp(tokens, left.pos, entry.prec + 1);
    if (!rightResult.ok) return rightResult;
    left.ast = {
      type: "binary_op",
      op,
      left: left.ast,
      right: rightResult.value.ast,
    };
    left.pos = rightResult.value.pos;
  }

  return { ok: true, value: left };
}

// parseAssignmentExpr: handles identifier assignment (lowest precedence)
function parseAssignmentExpr(
  tokens: Token[],
  pos: number,
): Result<ParseResult, ParseError> {
  const exprResultR = parseBinaryOp(tokens, pos, 1);
  if (!exprResultR.ok) return exprResultR;
  const exprResult = exprResultR.value;

  // Check if this is an assignment: "identifier = expr"
  if (
    exprResult.ast.type === "identifier" &&
    exprResult.pos < tokens.length &&
    tokens[exprResult.pos]?.type === "assign"
  ) {
    const name = (exprResult.ast as Identifier).name;
    const i = exprResult.pos + 1; // skip '='
    const valueResultR = parseAssignmentExpr(tokens, i);
    if (!valueResultR.ok) return valueResultR;
    return {
      ok: true,
      value: {
        ast: { type: "assign_expr", name, value: valueResultR.value.ast },
        pos: valueResultR.value.pos,
      },
    };
  }

  // Desugar compound assignments: "identifier += expr" → "identifier = identifier + expr"
  if (exprResult.ast.type === "identifier" && exprResult.pos < tokens.length) {
    const compoundOp = COMPOUND_ASSIGN_OPS[tokens[exprResult.pos]!.type];
    if (compoundOp) {
      const name = (exprResult.ast as Identifier).name;
      const i = exprResult.pos + 1;
      const valueResultR = parseAssignmentExpr(tokens, i);
      if (!valueResultR.ok) return valueResultR;
      const idNode: Identifier = { type: "identifier", name };
      const binaryOp: BinaryOp = {
        type: "binary_op",
        op: compoundOp,
        left: idNode,
        right: valueResultR.value.ast,
      };
      return {
        ok: true,
        value: {
          ast: { type: "assign_expr", name, value: binaryOp },
          pos: valueResultR.value.pos,
        },
      };
    }
  }

  return { ok: true, value: exprResult };
}

// parseParenCondition: parses condition wrapped in parentheses "(expr)", returns condition AST and position after ')'
function parseParenCondition(
  tokens: Token[],
  pos: number,
): Result<ParseResult, ParseError> {
  if (tokens[pos]?.type !== "lparen") {
    return {
      ok: false,
      error: { message: `Expected '(' at position ${pos}`, position: pos },
    };
  }
  const innerResultR = parseBinaryOp(tokens, pos + 1, 1);
  if (!innerResultR.ok) return innerResultR;
  if (tokens[innerResultR.value.pos]?.type !== "rparen") {
    return {
      ok: false,
      error: {
        message: `Expected ')' after condition at position ${innerResultR.value.pos}`,
        position: innerResultR.value.pos,
      },
    };
  }
  return {
    ok: true,
    value: { ast: innerResultR.value.ast, pos: innerResultR.value.pos + 1 },
  };
}

// parseFactor: handles numbers, identifiers, and grouped expressions (highest precedence)
function parseFactor(
  tokens: Token[],
  pos: number,
): Result<ParseResult, ParseError> {
  const token = tokens[pos]!;

  // Handle identifier reference (variable lookup)
  if (isIdentifierToken(token)) {
    return {
      ok: true,
      value: { ast: { type: "identifier", name: token.name }, pos: pos + 1 },
    };
  }

  // Handle boolean literals
  if (token.type === "true_keyword") {
    return {
      ok: true,
      value: { ast: { type: "bool", value: true }, pos: pos + 1 },
    };
  }
  if (token.type === "false_keyword") {
    return {
      ok: true,
      value: { ast: { type: "bool", value: false }, pos: pos + 1 },
    };
  }

  // Handle if/else expressions
  if (token.type === "if_keyword") {
    // Parse "if (condition) then_expr else else_expr"
    let i = pos + 1;

    const condResultR = parseParenCondition(tokens, i);
    if (!condResultR.ok) return condResultR;
    i = condResultR.value.pos;

    // Parse then expression
    const thenResultR = parseAssignmentExpr(tokens, i);
    if (!thenResultR.ok) return thenResultR;
    i = thenResultR.value.pos;

    // Check for optional 'else' clause
    let elseAst: AstNode | null = null;
    let elsePos = i;
    if (tokens[i]?.type === "else_keyword") {
      i++; // skip 'else'
      const elseResultR = parseAssignmentExpr(tokens, i);
      if (!elseResultR.ok) return elseResultR;
      elseAst = elseResultR.value.ast;
      elsePos = elseResultR.value.pos;
    }

    return {
      ok: true,
      value: {
        ast: {
          type: "if_expr",
          condition: condResultR.value.ast,
          then: thenResultR.value.ast,
          else_: elseAst,
        },
        pos: elseAst ? elsePos : thenResultR.value.pos,
      },
    };
  }
  // Handle match expression: match (scrutinee) { case pattern => expr; ... }
  if (token.type === "match_keyword") {
    let i = pos + 1; // skip 'match'

    // Expect scrutinee in parentheses: "(expr)"
    if (tokens[i]?.type !== "lparen") {
      return {
        ok: false,
        error: {
          message: `Expected '(' after 'match' at position ${i}`,
          position: i,
        },
      };
    }
    i++; // skip '('
    const scrutineeResultR = parseBinaryOp(tokens, i, 1);
    if (!scrutineeResultR.ok) return scrutineeResultR;
    i = scrutineeResultR.value.pos;
    if (tokens[i]?.type !== "rparen") {
      return {
        ok: false,
        error: {
          message: `Expected ')' after scrutinee at position ${i}`,
          position: i,
        },
      };
    }
    i++; // skip ')'

    // Expect opening brace
    if (tokens[i]?.type !== "lbrace") {
      return {
        ok: false,
        error: {
          message: `Expected '{' after match condition at position ${i}`,
          position: i,
        },
      };
    }
    i++; // skip '{'

    // Parse arms
    const arms: MatchArm[] = [];
    while (i < tokens.length && tokens[i]?.type !== "rbrace") {
      if (tokens[i]?.type !== "case_keyword") {
        return {
          ok: false,
          error: { message: `Expected 'case' at position ${i}`, position: i },
        };
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
        return {
          ok: false,
          error: { message: `Expected pattern at position ${i}`, position: i },
        };
      }

      // Expect '=>'
      if (tokens[i]?.type !== "arrow") {
        return {
          ok: false,
          error: {
            message: `Expected '=>' after pattern at position ${i}`,
            position: i,
          },
        };
      }
      i++; // skip '=>'

      // Parse body
      const bodyResultR = parseAssignmentExpr(tokens, i);
      if (!bodyResultR.ok) return bodyResultR;
      arms.push({ pattern, body: bodyResultR.value.ast });
      i = bodyResultR.value.pos;

      // Skip optional semicolon
      if (tokens[i]?.type === "semicolon") {
        i++;
      }
    }

    // Skip closing brace
    if (tokens[i]?.type !== "rbrace") {
      return {
        ok: false,
        error: { message: `Expected '}' at position ${i}`, position: i },
      };
    }
    i++; // skip '}'

    return {
      ok: true,
      value: {
        ast: {
          type: "match_expr",
          scrutinee: scrutineeResultR.value.ast,
          arms,
        } as AstNode,
        pos: i,
      },
    };
  }
  // Handle grouped expression: recursively parse inside parens or braces
  if (token.type === "lparen") {
    const innerResultR = parseBinaryOp(tokens, pos + 1, 1);
    if (!innerResultR.ok) return innerResultR;
    return {
      ok: true,
      value: { ast: innerResultR.value.ast, pos: innerResultR.value.pos + 1 },
    };
  }

  // Handle block with statements: let declarations and expressions separated by ;
  if (token.type === "lbrace") {
    const resultR = parseBlock(tokens, pos + 1);
    if (!resultR.ok) return resultR;
    return { ok: true, value: resultR.value };
  }

  if (!isNumberToken(token)) {
    return {
      ok: false,
      error: { message: `Unexpected token at position ${pos}`, position: pos },
    };
  }
  return {
    ok: true,
    value: { ast: { type: "number", value: token.value }, pos: pos + 1 },
  };
}

// parseStatement: parses a single statement (let declaration, assignment, or expression)
export function parseStatement(
  tokens: Token[],
  index: number,
): Result<ParseResult, ParseError> {
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
      return {
        ok: false,
        error: {
          message: `Expected identifier after 'let' at position ${i}`,
          position: i,
        },
      };
    }
    const name = nameToken.name;
    i++; // skip identifier
    const assignToken = tokens[i];
    if (!assignToken || assignToken.type !== "assign") {
      return {
        ok: false,
        error: {
          message: `Expected '=' after variable name at position ${i}`,
          position: i,
        },
      };
    }
    i++; // skip '='
    const initResultR = parseAssignmentExpr(tokens, i);
    if (!initResultR.ok) return initResultR;
    if (!producesValue(initResultR.value.ast)) {
      return {
        ok: false,
        error: {
          message: `Let declaration requires a value expression at position ${i}`,
          position: i,
        },
      };
    }
    return {
      ok: true,
      value: {
        ast: {
          type: "let",
          name,
          mutable: isMutable,
          init: initResultR.value.ast,
        },
        pos: initResultR.value.pos,
      },
    };
  }

  // Parse "while (condition) body"
  if (token.type === "while_keyword") {
    const condResultR = parseParenCondition(tokens, index + 1);
    if (!condResultR.ok) return condResultR;

    // Parse body (typically a block, but can be any expression)
    const bodyResultR = parseAssignmentExpr(tokens, condResultR.value.pos);
    if (!bodyResultR.ok) return bodyResultR;
    return {
      ok: true,
      value: {
        ast: {
          type: "while_expr",
          condition: condResultR.value.ast,
          body: bodyResultR.value.ast,
        } as AstNode,
        pos: bodyResultR.value.pos,
      },
    };
  }

  // Parse "continue;"
  if (token.type === "continue_keyword") {
    return {
      ok: true,
      value: { ast: { type: "continue" } as AstNode, pos: index + 1 },
    };
  }

  // Parse "break;"
  if (token.type === "break_keyword") {
    return {
      ok: true,
      value: { ast: { type: "break" } as AstNode, pos: index + 1 },
    };
  }

  // Parse expression statement (may include assignment): "expr;"
  const exprResultR = parseAssignmentExpr(tokens, index);
  if (!exprResultR.ok) return exprResultR;
  return { ok: true, value: exprResultR.value };
}

// skipSemicolon: consumes optional trailing semicolon
function skipSemicolon(tokens: Token[], index: number): number {
  if (index < tokens.length && tokens[index]!.type === "semicolon") {
    return index + 1;
  }
  return index;
}

// parseStatements: parses statements until end condition is met
function parseStatements(
  tokens: Token[],
  pos: number,
  endOnRbrace: boolean,
): Result<ParseResult, ParseError> {
  let index = pos;
  const statements: AstNode[] = [];

  while (
    index < tokens.length &&
    (!endOnRbrace || tokens[index]!.type !== "rbrace")
  ) {
    const stmtR = parseStatement(tokens, index);
    if (!stmtR.ok) return stmtR;
    statements.push(stmtR.value.ast);
    index = skipSemicolon(tokens, stmtR.value.pos);
  }

  return {
    ok: true,
    value: { ast: { type: "block", statements }, pos: index },
  };
}

// parseBlock: parses statements inside { ... } returning a block AST node
function parseBlock(
  tokens: Token[],
  pos: number,
): Result<ParseResult, ParseError> {
  const result = parseStatements(tokens, pos, true);
  if (!result.ok) return result;
  return {
    ok: true,
    value: { ast: result.value.ast, pos: result.value.pos + 1 },
  };
}

// parseProgram: top-level statement sequence (let decls + expressions)
export function parseProgram(
  tokens: Token[],
  pos: number,
): Result<ParseResult, ParseError> {
  const result = parseStatements(tokens, pos, false);
  if (!result.ok) return result;
  return { ok: true, value: { ast: result.value.ast, pos } };
}
