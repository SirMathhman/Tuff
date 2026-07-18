import { inferType } from "./types.js";

export function parseExpression(parser, variables, functions, structs) {
  return parseOr(parser, variables, functions, structs);
}

export function parseBinaryContinuation(parser, variables, functions, structs, left) {
  return parseOr(parser, variables, functions, structs, left);
}

export function isBoolType(expr, variables, functions) {
  if (expr.type === "boolean") return true;
  if (expr.type === "binary" && (expr.op === "&&" || expr.op === "||" || expr.op === "==" || expr.op === "!=" || expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=")) return true;
  if (expr.type === "unary" && expr.op === "!") return true;
  if (expr.type === "identifier") {
    const varInfo = variables.get(expr.name);
    if (typeof varInfo === "object" && varInfo.type === "Bool") return true;
  }
  if (expr.type === "fnCall" && functions && functions.has(expr.name)) {
    const fn = functions.get(expr.name);
    if (fn.retType === "Bool") return true;
  }
  return false;
}

export function parseOr(parser, variables, functions, structs, left) {
  left = parseAnd(parser, variables, functions, structs, left);
  while (parser.peek().type === "OR") {
    parser.advance();
    const right = parseAnd(parser, variables, functions, structs);
    if (!isBoolType(left, variables, functions)) {
      throw new Error(`Expected Bool for ||, got ${inferType(left)}`);
    }
    if (!isBoolType(right, variables, functions)) {
      throw new Error(`Expected Bool for ||, got ${inferType(right)}`);
    }
    left = { type: "binary", op: "||", left, right };
  }
  return left;
}

export function parseAnd(parser, variables, functions, structs, left) {
  left = parseComparison(parser, variables, functions, structs, left);
  while (parser.peek().type === "AND") {
    parser.advance();
    const right = parseComparison(parser, variables, functions, structs);
    if (!isBoolType(left, variables, functions)) {
      throw new Error(`Expected Bool for &&, got ${inferType(left)}`);
    }
    if (!isBoolType(right, variables, functions)) {
      throw new Error(`Expected Bool for &&, got ${inferType(right)}`);
    }
    left = { type: "binary", op: "&&", left, right };
  }
  return left;
}

export function parseComparison(parser, variables, functions, structs, left) {
  left = parseAddSub(parser, variables, functions, structs, left);
  while (parser.peek().type === "CMP") {
    const op = parser.advance().value;
    const right = parseAddSub(parser, variables, functions, structs);
    // Type checking: ordering ops require numeric, == and != allow bool
    const isOrdering = op === "<" || op === ">" || op === "<=" || op === ">=";
    const leftType = inferType(left);
    const rightType = inferType(right);
    if (isOrdering) {
      if (leftType === "Bool" || rightType === "Bool") {
        throw new Error(`Ordering operator ${op} requires numeric operands`);
      }
    } else {
      // == and !=: allow numeric or bool, but both sides must match
      if (leftType === "Bool" && rightType !== "Bool") {
        throw new Error(`Type mismatch in ==: Bool and ${rightType}`);
      }
      if (leftType !== "Bool" && rightType === "Bool") {
        throw new Error(`Type mismatch in ==: ${leftType} and Bool`);
      }
    }
    left = { type: "binary", op, left, right };
  }
  return left;
}

export function parseAddSub(parser, variables, functions, structs, left) {
  left = parseMulDivMod(parser, variables, functions, structs, left);
  while (parser.peek().type === "OP" && (parser.peek().value === "+" || parser.peek().value === "-")) {
    const op = parser.advance().value;
    const right = parseMulDivMod(parser, variables, functions, structs);
    left = { type: "binary", op, left, right };
  }
  return left;
}

export function parseMulDivMod(parser, variables, functions, structs, left) {
  if (left === undefined) left = parseUnary(parser, variables, functions, structs);
  while (parser.peek().type === "OP" && (parser.peek().value === "*" || parser.peek().value === "/" || parser.peek().value === "%")) {
    const op = parser.advance().value;
    const right = parseUnary(parser, variables, functions);
    left = { type: "binary", op, left, right };
  }
  return left;
}

export function parseUnary(parser, variables, functions, structs) {
  if (parser.peek().type === "OP" && parser.peek().value === "-") {
    parser.advance();
    const operand = parseUnary(parser, variables, functions, structs);
    return { type: "unary", op: "-", operand };
  }
  if (parser.peek().type === "NOT") {
    parser.advance();
    const operand = parseUnary(parser, variables, functions, structs);
    if (!isBoolType(operand, variables, functions)) {
      throw new Error(`Expected Bool for !, got ${inferType(operand)}`);
    }
    return { type: "unary", op: "!", operand };
  }
  return parsePrimary(parser, variables, functions, structs);
}

export function hasTopLevelComma(parser) {
  // Check if content between ( and ) has a comma at the top level
  const start = parser.pos;
  parser.advance(); // skip '('
  let depth = 0;
  while (parser.peek().type !== "EOF") {
    const t = parser.peek();
    if (t.type === "LPAREN" || t.type === "LBRACE" || t.type === "LBRACKET") {
      depth++;
      parser.advance();
    } else if (t.type === "RPAREN" || t.type === "RBRACE" || t.type === "RBRACKET") {
      depth--;
      parser.advance();
    } else if (t.type === "COMMA" && depth === 0) {
      parser.pos = start;
      return true;
    } else if (t.type === "RPAREN") {
      parser.pos = start;
      return false;
    } else {
      parser.advance();
    }
  }
  parser.pos = start;
  return false;
}

export function parseTupleLiteral(parser, variables, functions, structs) {
  parser.advance(); // consume '('
  const elements = [];
  if (parser.peek().type === "RPAREN") {
    throw new Error("Empty tuple is not allowed");
  }
  elements.push(parseExpression(parser, variables, functions, structs));
  while (parser.peek().type === "COMMA") {
    parser.advance(); // consume ','
    elements.push(parseExpression(parser, variables, functions, structs));
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after tuple literal, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  return { type: "tupleLiteral", elements };
}

export function parsePrimary(parser, variables, functions, structs) {
  let result;
  const token = parser.peek();
  if (token.type === "NUMBER") {
    parser.advance();
    result = { type: "number", value: token.value, suffix: token.suffix, negative: token.negative };
  } else if (token.type === "IDENTIFIER") {
    // Check if this is a function call
    if (parser.peek(1)?.type === "LPAREN") {
      result = parseFnCall(parser, token.value, variables, functions, structs);
    }
    // Check if this is an array index
    else if (parser.peek(1)?.type === "LBRACKET") {
      result = parseArrayIndex(parser, token.value, variables, functions, structs);
    }
    // Check if this is a struct instantiation: StructName { field: value, ... }
    else if (parser.peek(1)?.type === "LBRACE" && structs.has(token.value)) {
      result = parseStructInstantiation(parser, token.value, variables, functions, structs);
    } else {
      parser.advance();
      if (!variables.has(token.value) && !functions.has(token.value)) {
        throw new Error(`Undeclared variable: ${token.value}`);
      }
      result = { type: "identifier", name: token.value };
    }
  } else if (token.type === "LPAREN") {
    // Distinguish tuple literal `(1, 2)` from parenthesized expression `(expr)`
    // A tuple literal has a comma at the top level inside the parentheses
    if (hasTopLevelComma(parser)) {
      result = parseTupleLiteral(parser, variables, functions, structs);
    } else {
      parser.advance();
      result = parseExpression(parser, variables, functions, structs);
      if (parser.peek().type !== "RPAREN") {
        throw new Error(`Expected ), got ${parser.peek().type}`);
      }
      parser.advance();
    }
  } else if (token.type === "BOOL") {
    parser.advance();
    result = { type: "boolean", value: token.value };
  } else if (token.type === "LBRACE") {
    result = parseBlock(parser, variables, functions, structs, false);
  } else if (token.type === "IF") {
    result = parseIfExpression(parser, variables, functions, structs);
  } else if (token.type === "LBRACKET") {
    result = parseArrayLiteral(parser, variables, functions, structs);
  } else {
    throw new Error(`Unexpected token: ${token.type}`);
  }
  // Handle field access and array index chaining on any primary expression
  while (parser.peek().type === "DOT" || parser.peek().type === "LBRACKET") {
    if (parser.peek().type === "DOT") {
      const obj = result;
      parser.advance(); // consume DOT
      const fieldToken = parser.peek();
      if (fieldToken.type === "NUMBER") {
        // Tuple index access: x.0, x.1, etc.
        result = parseTupleIndexToken(parser, obj, variables, structs);
      } else if (fieldToken.type === "IDENTIFIER") {
        parser.advance();
        result = buildFieldAccess(obj, fieldToken.value, variables, structs);
      } else {
        throw new Error(`Expected field name or tuple index, got ${fieldToken.type}`);
      }
    } else {
      result = parseArrayIndexChain(parser, result, variables, functions, structs);
    }
  }
  return result;
}

// Forward declarations for cross-module dependencies
// These are imported from their respective modules
let parseFnCall, parseArrayIndex, parseStructInstantiation, parseTupleIndexToken, buildFieldAccess;
let parseBlock, parseIfExpression, parseArrayLiteral;

export function setExpressionDeps(deps) {
  parseFnCall = deps.parseFnCall;
  parseArrayIndex = deps.parseArrayIndex;
  parseStructInstantiation = deps.parseStructInstantiation;
  parseTupleIndexToken = deps.parseTupleIndexToken;
  buildFieldAccess = deps.buildFieldAccess;
  parseBlock = deps.parseBlock;
  parseIfExpression = deps.parseIfExpression;
  parseArrayLiteral = deps.parseArrayLiteral;
}
