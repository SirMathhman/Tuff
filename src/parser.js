import { inferType, validateTypeAnnotation, isTupleType, splitTupleType } from "./types.js";
import { parseType, parseTypeAnnotation } from "./types_parser.js";
import { parseExpression, parseBinaryContinuation, setExpressionDeps } from "./expressions.js";
import { parseIfCondition, parseIfExpressionBranch, parseIfStatementBranch, parseWhile, parseBlockStatements, parseBlock, parseIfExpression, setControlDeps } from "./control.js";
import { parseStructDefinition, parseStructInstantiation, parseFieldAccess, parseTupleIndexToken, buildFieldAccess, validateFieldMutable, setStructsDeps } from "./structs.js";
import { parseFnSignature, skipFunctionBody, parseCompoundOrAssign, validateMutable, parseAssignmentRhs, parseFn, parseFnCall, parseArrayIndex, parseArrayLiteral, parseIdentifier, setFunctionsDeps } from "./functions.js";

export function parse(tokens) {
  const parser = {
    tokens,
    pos: 0,
    atEOF: function () {
      return this.peek().type === "EOF";
    },
    peek: function (offset) {
      return this.tokens[this.pos + (offset || 0)];
    },
    advance: function () {
      return this.tokens[this.pos++];
    },
  };
  const variables = new Map();
  const functions = new Map();
  const structs = new Map();
  // First pass: register all function signatures and struct definitions
  registerStructDefinitions(parser, structs);
  registerFunctionSignatures(parser, functions, structs);
  const statements = [];
  while (!parser.atEOF()) {
    if (parser.peek().type === "STRUCT") {
      skipStructDefinition(parser);
      if (parser.peek().type === "SEMICOLON") parser.advance();
      continue;
    }
    statements.push(parseStatement(parser, variables, functions, structs));
    if (parser.peek().type === "SEMICOLON") {
      parser.advance();
    }
  }
  return { statements, variables: Array.from(variables.entries()).map(([name, info]) => {
    const isMutable = typeof info === "boolean" ? info : info.mutable;
    return { name, mutable: isMutable };
  }), functions: functions, structs: structs };
}

function registerFunctionSignatures(parser, functions, structs) {
  const savedPos = parser.pos;
  while (!parser.atEOF()) {
    if (parser.peek().type === "FN") {
      const fnName = parseFnSignature(parser, functions, structs);
      // Skip the body
      skipFunctionBody(parser);
    } else if (parser.peek().type === "STRUCT") {
      skipStructDefinition(parser);
    } else {
      parser.advance();
    }
  }
  parser.pos = savedPos;
}

function registerStructDefinitions(parser, structs) {
  const savedPos = parser.pos;
  while (!parser.atEOF()) {
    if (parser.peek().type === "STRUCT") {
      parseStructDefinition(parser, structs);
    } else {
      parser.advance();
    }
  }
  parser.pos = savedPos;
}

function skipStructDefinition(parser) {
  parser.advance(); // consume 'struct'
  parser.advance(); // consume name
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for struct body, got ${parser.peek().type}`);
  }
  let depth = 0;
  while (!parser.atEOF()) {
    const t = parser.peek().type;
    if (t === "LBRACE") depth++;
    else if (t === "RBRACE") {
      depth--;
      if (depth === 0) {
        parser.advance(); // consume RBRACE
        return;
      }
    }
    parser.advance();
  }
  throw new Error("Unclosed struct body");
}

// parseStatement — dispatcher for top-level and block-level statements

function parseStatement(parser, variables, functions, structs) {
  if (parser.peek().type === "FN") {
    return parseFn(parser, variables, functions, structs);
  }
  if (parser.peek().type === "LET") {
    parser.advance();
    const isMut = parser.peek().type === "MUT";
    if (isMut) {
      parser.advance();
    }
    const name = parseIdentifier(parser);
    if (variables.has(name)) {
      throw new Error(`Duplicate variable: ${name}`);
    }
    let declaredType = null;
    if (parser.peek().type === "COLON") {
      parser.advance();
      declaredType = parseType(parser, structs);
    }
    if (parser.peek().type !== "OP" || parser.peek().value !== "=") {
      throw new Error(`Expected = in let statement, got ${parser.peek().type}`);
    }
    parser.advance();
    let initExpr = parseExpression(parser, variables, functions, structs);
    // A parenthesized single expression like `(42)` parses as a plain group,
    // not a tupleLiteral; coerce it when the declared type is a 1-tuple.
    if (declaredType && isTupleType(declaredType) && initExpr.type !== "tupleLiteral" && splitTupleType(declaredType).length === 1) {
      initExpr = { type: "tupleLiteral", elements: [initExpr] };
    }
    if (declaredType) {
      validateTypeAnnotation(initExpr, declaredType, structs, functions);
    }
    const inferred = declaredType || inferType(initExpr);
    variables.set(name, { mutable: isMut, type: inferred });
    return { type: "let", name, mutable: isMut, init: initExpr };
  }
  if (parser.peek().type === "IDENTIFIER") {
    const name = parser.peek().value;
    // Check for struct field access: obj.field or obj.field = value
    if (parser.peek(1)?.type === "DOT") {
      const fieldExpr = parseFieldAccess(parser, name, variables, functions, structs);
      const assignResult = parseCompoundOrAssign(
        parser, variables, functions, structs, fieldExpr,
        () => validateFieldMutable(fieldExpr, variables, structs),
        () => ({ type: "fieldAssign", target: fieldExpr, value: parseExpression(parser, variables, functions, structs) }),
      );
      if (assignResult) return assignResult;
      return parseBinaryContinuation(parser, variables, functions, structs, fieldExpr);
    }
    // Check for array index assignment: arr[index] = value or arr[index] op= value
    if (parser.peek(1)?.type === "LBRACKET") {
      const idxExpr = parseArrayIndex(parser, name, variables, functions, structs);
      const assignResult = parseCompoundOrAssign(
        parser, variables, functions, structs, idxExpr,
        () => validateMutable(name, variables),
        () => ({ type: "arrayAssign", name, index: idxExpr.index, value: parseExpression(parser, variables, functions, structs) }),
      );
      if (assignResult) return assignResult;
      return parseBinaryContinuation(parser, variables, functions, structs, idxExpr);
    }
    if (parser.peek(1)?.type === "COMPOUND") {
      const op = parser.peek(1).value;
      parser.advance();
      parser.advance();
      const rhs = parseAssignmentRhs(parser, name, variables, functions, structs);
      return { type: "compoundAssign", name, op, value: rhs };
    }
    if (parser.peek(1)?.type === "OP" && parser.peek(1)?.value === "=") {
      parser.advance();
      parser.advance();
      const rhs = parseAssignmentRhs(parser, name, variables, functions, structs);
      return { type: "assign", name, value: rhs };
    }
  }
  if (parser.peek().type === "IF") {
    // Parse condition first
    const condition = parseIfCondition(parser, variables, functions, structs);

    // Check if branch starts with LBRACE
    if (parser.peek().type === "LBRACE") {
      // Try parsing block to determine if it's a statement or expression
      const savedPos = parser.pos;
      const block = parseBlock(parser, variables, functions, structs, true);
      if (block.type === "blockStmt") {
        return parseIfStatementBranch(parser, variables, functions, structs, condition, block.statements);
      }
      // Block expression - use it as thenBranch for if-expression
      if (parser.peek().type !== "ELSE") {
        throw new Error(`Expected else, got ${parser.peek().type}`);
      }
      parser.advance(); // consume 'else'
      return parseIfExpressionBranch(parser, variables, functions, structs, condition, block);
    }
    // Parse as if-expression (non-block branch)
    const thenBranch = parseExpression(parser, variables, functions, structs);
    if (parser.peek().type !== "ELSE") {
      throw new Error(`Expected else, got ${parser.peek().type}`);
    }
    parser.advance(); // consume 'else'
    return parseIfExpressionBranch(parser, variables, functions, structs, condition, thenBranch);
  }
  if (parser.peek().type === "WHILE") {
    return parseWhile(parser, variables, functions, structs);
  }
  if (parser.peek().type === "LBRACE") {
    const block = parseBlock(parser, variables, functions, structs, true);
    if (block.type === "blockStmt") {
      return block;
    }
    /* block expression - continue parsing binary ops */
    return parseBinaryContinuation(parser, variables, functions, structs, block);
  }
  return parseExpression(parser, variables, functions, structs);
}

// Wire up cross-module dependencies
setExpressionDeps({
  parseFnCall,
  parseArrayIndex,
  parseStructInstantiation,
  parseTupleIndexToken,
  buildFieldAccess,
  parseBlock,
  parseIfExpression,
  parseArrayLiteral
});

setControlDeps({
  parseStatement,
  parseExpression
});

setStructsDeps({
  parseIdentifier,
  parseExpression
});

setFunctionsDeps({
  parseExpression,
  parseBlockStatements
});
