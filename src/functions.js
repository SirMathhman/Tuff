import { VALID_SUFFIXES, inferType, validateTypeAnnotation, isTupleType, splitTupleType, isClosureType, parseClosureType } from "./types.js";
import { parseTypeAnnotation, parseType, parseReturnType } from "./types_parser.js";

export function parseFnSignature(parser, functions, structs) {
  parser.advance(); // consume 'fn'
  const name = parseIdentifier(parser);
  if (functions.has(name)) {
    throw new Error(`Duplicate function: ${name}`);
  }
  const { params, paramTypes, retType } = parseFnSignatureParts(parser, structs);
  functions.set(name, { params, paramTypes, retType });
  return name;
}

export function parseFnSignatureParts(parser, structs) {
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after function name, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const params = [];
  const paramTypes = {};
  while (parser.peek().type !== "RPAREN") {
    if (params.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    const paramName = parseIdentifier(parser);
    if (params.includes(paramName)) {
      throw new Error(`Duplicate parameter: ${paramName}`);
    }
    paramTypes[paramName] = parseTypeAnnotation(parser, structs);
    params.push(paramName);
  }
  parser.advance(); // consume ')'
  const retType = parseReturnType(parser, structs);
  return { params, paramTypes, retType };
}

export function skipFunctionBody(parser) {
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for function body, got ${parser.peek().type}`);
  }
  let braceDepth = 0;
  let bracketDepth = 0;
  while (!parser.atEOF()) {
    const t = parser.peek().type;
    if (t === "LBRACE") braceDepth++;
    else if (t === "RBRACE") braceDepth--;
    else if (t === "LBRACKET") bracketDepth++;
    else if (t === "RBRACKET") bracketDepth--;
    if (braceDepth === 0 && bracketDepth === 0) {
      parser.advance(); // consume RBRACE
      return;
    }
    parser.advance();
  }
  throw new Error("Unclosed function body");
}

export function parseCompoundOrAssign(parser, variables, functions, structs, target, validateFn, assignFn) {
  if (parser.peek().type === "COMPOUND") {
    const op = parser.peek().value;
    parser.advance();
    validateFn();
    const rhs = parseExpression(parser, variables, functions, structs);
    return { type: "compoundAssign", target, op, value: rhs };
  }
  if (parser.peek().type === "OP" && parser.peek().value === "=") {
    parser.advance();
    validateFn();
    return assignFn();
  }
  return null;
}

export function validateMutable(name, variables) {
  if (!variables.has(name)) {
    throw new Error(`Undeclared variable: ${name}`);
  }
  const varInfo = variables.get(name);
  const isMutable = typeof varInfo === "boolean" ? varInfo : varInfo.mutable;
  if (!isMutable) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
}

export function parseAssignmentRhs(parser, name, variables, functions, structs) {
  validateMutable(name, variables);
  const varInfo = variables.get(name);
  const rhs = parseExpression(parser, variables, functions, structs);
  const declaredType = typeof varInfo === "object" ? varInfo.type : null;
  if (declaredType) {
    validateTypeAnnotation(rhs, declaredType, structs, functions);
  }
  return rhs;
}

export function parseFn(parser, variables, functions, structs) {
  parser.advance(); // consume 'fn'
  const name = parseIdentifier(parser);
  // Check for variable shadowing before parsing signature parts
  const sigParts = parseFnSignatureParts(parser, structs);
  for (const p of sigParts.params) {
    if (variables.has(p)) {
      throw new Error(`Parameter ${p} shadows a top-level variable`);
    }
  }
  // Parse body block
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for function body, got ${parser.peek().type}`);
  }
  // Create scoped variables for function body (only params, no outer scope)
  const fnVars = new Map();
  for (const p of sigParts.params) {
    fnVars.set(p, { mutable: true, type: sigParts.paramTypes[p] });
  }
  const body = parseBlockStatements(parser, fnVars, functions, structs);
  if (isTupleType(sigParts.retType)) {
    const lastStmt = body[body.length - 1];
    const isStmtType = (s) => s && (s.type === "let" || s.type === "assign" || s.type === "ifStmt" || s.type === "whileStmt" || s.type === "blockStmt" || s.type === "compoundAssign");
    if (lastStmt && !isStmtType(lastStmt)) {
      validateTypeAnnotation(lastStmt, sigParts.retType, structs, functions);
    }
  }
  return { type: "fn", name, params: sigParts.params, paramTypes: sigParts.paramTypes, retType: sigParts.retType, body };
}

export function parseFnCall(parser, name, variables, functions, structs) {
  parser.advance(); // consume identifier
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( for function call, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const args = [];
  while (parser.peek().type !== "RPAREN") {
    if (args.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    args.push(parseExpression(parser, variables, functions, structs));
  }
  parser.advance(); // consume ')'
  // Validate function exists (either in functions map or as a closure-typed variable)
  let fn = functions.get(name);
  let isClosureCall = false;
  if (!fn) {
    // Check if this is a closure-typed variable
    if (variables.has(name)) {
      const varInfo = variables.get(name);
      if (varInfo && isClosureType(varInfo.type)) {
        isClosureCall = true;
        fn = { params: [], paramTypes: {}, retType: varInfo.type };
        const closureInfo = parseClosureType(varInfo.type);
        // Create synthetic function info for validation
        fn.params = closureInfo.paramTypes.map((_, i) => `arg${i}`);
        fn.paramTypes = {};
        closureInfo.paramTypes.forEach((t, i) => { fn.paramTypes[`arg${i}`] = t; });
      } else {
        throw new Error(`Undeclared function: ${name}`);
      }
    } else {
      throw new Error(`Undeclared function: ${name}`);
    }
  }
  if (args.length !== fn.params.length) {
    throw new Error(`Function ${name} expects ${fn.params.length} arguments, got ${args.length}`);
  }
  for (let i = 0; i < args.length; i++) {
    const paramType = fn.paramTypes[fn.params[i]];
    if (isTupleType(paramType)) {
      validateTypeAnnotation(args[i], paramType, structs, functions);
    }
  }
  return { type: "fnCall", name, args };
}

export function parseArrayIndex(parser, name, variables, functions, structs) {
  parser.advance(); // consume identifier
  if (parser.peek().type !== "LBRACKET") {
    throw new Error(`Expected [ for array index, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '['
  const index = parseExpression(parser, variables, functions, structs);
  if (parser.peek().type !== "RBRACKET") {
    throw new Error(`Expected ] for array index, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ']'
  // Validate array access
  if (!variables.has(name)) {
    throw new Error(`Undeclared variable: ${name}`);
  }
  const varInfo = variables.get(name);
  const arrType = typeof varInfo === "object" ? varInfo.type : null;
  if (arrType && arrType.startsWith("[")) {
    const length = parseInt(arrType.match(/\[(\w+; (\d+))\]/)[2]);
    // Validate index at compile time if it's a constant
    if (index.type === "number") {
      const idxVal = index.negative ? -parseFloat(index.value) : parseFloat(index.value);
      if (idxVal < 0 || idxVal >= length) {
        throw new Error(`Array index ${idxVal} out of bounds (length ${length})`);
      }
    }
  }
  return { type: "arrayIndex", name, index };
}

export function parseArrayLiteral(parser, variables, functions, structs) {
  parser.advance(); // consume '['
  const elements = [];
  while (parser.peek().type !== "RBRACKET") {
    if (elements.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    // Reject nested array literals
    if (parser.peek().type === "LBRACKET") {
      throw new Error("Nested arrays are not supported");
    }
    elements.push(parseExpression(parser, variables, functions, structs));
  }
  parser.advance(); // consume ']'
  return { type: "arrayLiteral", elements };
}

export function parseIdentifier(parser) {
  const token = parser.peek();
  if (token.type !== "IDENTIFIER") {
    throw new Error(`Expected identifier, got ${token.type}`);
  }
  parser.advance();
  return token.value;
}

// Forward declarations for cross-module dependencies
let parseExpression, parseBlockStatements;

export function setFunctionsDeps(deps) {
  parseExpression = deps.parseExpression;
  parseBlockStatements = deps.parseBlockStatements;
}
