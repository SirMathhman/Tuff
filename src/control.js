import { inferType } from "./types.js";
import { isBoolType } from "./expressions.js";

export function parseIfCondition(parser, variables, functions, structs) {
  parser.advance(); // consume 'if'
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after if, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const condition = parseExpression(parser, variables, functions, structs);
  if (!isBoolType(condition, variables, functions)) {
    throw new Error(`Expected Bool for if condition, got ${inferType(condition)}`);
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after if condition, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  return condition;
}

export function parseIfExpressionBranch(parser, variables, functions, structs, condition, thenBranch) {
  const elseBranch = parseExpression(parser, variables, functions, structs);
  const thenType = inferType(thenBranch);
  const elseType = inferType(elseBranch);
  if (thenType !== elseType && thenType !== "unknown" && elseType !== "unknown") {
    throw new Error(`Type mismatch in if-else: then branch is ${thenType}, else branch is ${elseType}`);
  }
  return { type: "if", condition, thenBranch, elseBranch };
}

export function parseIfStatementBranch(parser, variables, functions, structs, condition, thenBranch) {
  let elseBranch = null;
  if (parser.peek().type === "ELSE") {
    parser.advance(); // consume 'else'
    if (parser.peek().type === "IF") {
      const elseIfStmt = parseIfStatement(parser, variables, functions, structs);
      elseBranch = [elseIfStmt];
    } else {
      elseBranch = parseBlockStatements(parser, variables, functions, structs);
    }
  }
  return { type: "ifStmt", condition, thenBranch, elseBranch };
}

export function parseIfStatement(parser, variables, functions, structs) {
  const condition = parseIfCondition(parser, variables, functions, structs);
  const thenBranch = parseBlockStatements(parser, variables, functions, structs);
  return parseIfStatementBranch(parser, variables, functions, structs, condition, thenBranch);
}

export function parseWhile(parser, variables, functions, structs) {
  parser.advance(); // consume 'while'
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after while, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const condition = parseExpression(parser, variables, functions, structs);
  if (!isBoolType(condition, variables, functions)) {
    throw new Error(`Expected Bool for while condition, got ${inferType(condition)}`);
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after while condition, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  const body = parseBlockStatements(parser, variables, functions, structs);
  return { type: "whileStmt", condition, body };
}

export function parseFor(parser, variables, functions, structs) {
  parser.advance(); // consume 'for'
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after for, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const variable = parser.advance();
  if (variable.type !== "IDENTIFIER") {
    throw new Error(`Expected identifier in for loop, got ${variable.type}`);
  }
  if (parser.peek().type !== "IN") {
    throw new Error(`Expected in in for loop, got ${parser.peek().type}`);
  }
  parser.advance(); // consume 'in'
  const start = parseExpression(parser, variables, functions, structs);
  if (parser.peek().type !== "RANGE") {
    throw new Error(`Expected .. in for loop range, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '..'
  const end = parseExpression(parser, variables, functions, structs);
  // Validate that range bounds are numeric, not boolean
  const startType = inferType(start);
  const endType = inferType(end);
  if (startType === "Bool" || endType === "Bool") {
    throw new Error("For loop range must be numeric, not boolean");
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after for loop range, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  // Create scoped variables for the for loop body with the loop variable
  const loopVariables = new Map(variables);
  loopVariables.set(variable.value, { mutable: true, type: "I32" });
  const body = parseBlockStatements(parser, loopVariables, functions, structs);
  return { type: "forStmt", variable: variable.value, start, end, body };
}

export function parseBlockStatements(parser, variables, functions, structs) {
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for if branch, got ${parser.peek().type}`);
  }
  parser.advance(); // consume LBRACE
  const statements = [];
  while (parser.peek().type !== "RBRACE" && parser.peek().type !== "EOF") {
    statements.push(parseStatement(parser, variables, functions, structs));
    if (parser.peek().type === "SEMICOLON") {
      parser.advance();
    }
  }
  if (parser.peek().type === "EOF") {
    throw new Error("Unclosed block");
  }
  parser.advance(); // consume RBRACE
  return statements;
}

export function parseBlock(parser, parentVariables, functions, structs, allowStatement) {
  parser.advance(); // consume LBRACE
  const blockVars = new Map(parentVariables);
  const statements = [];
  let lastHadSemicolon = false;
  while (parser.peek().type !== "RBRACE" && parser.peek().type !== "EOF") {
    statements.push(parseStatement(parser, blockVars, functions, structs));
    lastHadSemicolon = false;
    if (parser.peek().type === "SEMICOLON") {
      parser.advance();
      lastHadSemicolon = true;
    }
  }
  if (parser.peek().type === "EOF") {
    throw new Error("Unclosed block");
  }
  parser.advance(); // consume RBRACE
  // Block statement: ends with semicolon, is empty, or last stmt is a statement type
  const lastStmt = statements[statements.length - 1];
  const isStatementType = (s) => s && (s.type === "let" || s.type === "assign" || s.type === "ifStmt" || s.type === "whileStmt" || s.type === "forStmt" || s.type === "blockStmt");
  if (lastHadSemicolon || statements.length === 0 || isStatementType(lastStmt)) {
    if (!allowStatement) {
      throw new Error("Block statement cannot be used in expression context");
    }
    return { type: "blockStmt", statements };
  }
  // Block expression: ends with expression
  const finalExpr = statements.pop();
  return { type: "block", statements, finalExpr };
}

export function parseIfExpression(parser, variables, functions, structs) {
  const condition = parseIfCondition(parser, variables, functions, structs);
  const thenBranch = parseExpression(parser, variables, functions, structs);
  if (parser.peek().type !== "ELSE") {
    throw new Error(`Expected else, got ${parser.peek().type}`);
  }
  parser.advance(); // consume 'else'
  // Check if else branch is another if-expression (else-if chain)
  if (parser.peek().type === "IF") {
    const elseIfExpr = parseIfExpression(parser, variables, functions, structs);
    return { type: "if", condition, thenBranch, elseBranch: elseIfExpr };
  }
  return parseIfExpressionBranch(parser, variables, functions, structs, condition, thenBranch);
}

// Forward declaration for parseStatement (defined in parser.js)
let parseStatement, parseExpression;

export function setControlDeps(deps) {
  parseStatement = deps.parseStatement;
  parseExpression = deps.parseExpression;
}
