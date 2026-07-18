import { VALID_SUFFIXES, inferType, validateTypeAnnotation } from "./types.js";

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

function parseFnSignature(parser, functions, structs) {
  parser.advance(); // consume 'fn'
  const name = parseIdentifier(parser);
  if (functions.has(name)) {
    throw new Error(`Duplicate function: ${name}`);
  }
  const { params, paramTypes, retType } = parseFnSignatureParts(parser, structs);
  functions.set(name, { params, paramTypes, retType });
  return name;
}

function parseFnSignatureParts(parser, structs) {
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

function parseTypeAnnotation(parser, structs) {
  if (parser.peek().type !== "COLON") {
    throw new Error(`Expected : for type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ':'
  return parseType(parser, structs);
}

function parseType(parser, structs) {
  // Check for array type [Type; Length]
  if (parser.peek().type === "LBRACKET") {
    return parseArrayType(parser, structs);
  }
  const typeToken = parser.peek();
  if (typeToken.type !== "IDENTIFIER") {
    throw new Error(`Expected type, got ${typeToken.type}`);
  }
  const typeVal = typeToken.value;
  if (!VALID_SUFFIXES.has(typeVal) && !structs.has(typeVal)) {
    throw new Error(`Invalid type annotation: ${typeVal}`);
  }
  parser.advance();
  return typeVal;
}

function parseArrayType(parser, structs) {
  parser.advance(); // consume '['
  const elementType = parseType(parser, structs);
  if (parser.peek().type !== "SEMICOLON") {
    throw new Error(`Expected ; in array type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ';'
  const lengthToken = parser.peek();
  if (lengthToken.type !== "NUMBER") {
    throw new Error(`Expected constant length in array type, got ${lengthToken.type}`);
  }
  const length = parseInt(lengthToken.value);
  parser.advance();
  if (parser.peek().type !== "RBRACKET") {
    throw new Error(`Expected ] in array type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ']'
  return `[${elementType}; ${length}]`;
}

function parseStructDefinition(parser, structs) {
  parser.advance(); // consume 'struct'
  const nameToken = parser.peek();
  if (nameToken.type !== "IDENTIFIER") {
    throw new Error(`Expected struct name, got ${nameToken.type}`);
  }
  const name = nameToken.value;
  if (structs.has(name)) {
    throw new Error(`Duplicate struct: ${name}`);
  }
  parser.advance(); // consume name
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for struct body, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '{'
  const fields = [];
  while (parser.peek().type !== "RBRACE") {
    if (fields.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    const isMut = parser.peek().type === "MUT";
    if (isMut) parser.advance();
    const fieldName = parseIdentifier(parser);
    if (fields.some(f => f.name === fieldName)) {
      throw new Error(`Duplicate struct field: ${fieldName}`);
    }
    const fieldType = parseTypeAnnotation(parser, structs);
    fields.push({ name: fieldName, type: fieldType, mutable: isMut });
  }
  parser.advance(); // consume '}'
  structs.set(name, { fields });
  return { type: "structDef", name, fields };
}

function parseStructInstantiation(parser, structName, variables, functions, structs) {
  parser.advance(); // consume struct name
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for struct instantiation, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '{'
  const structDef = structs.get(structName);
  const fields = [];
  const seenFields = new Set();
  while (parser.peek().type !== "RBRACE") {
    if (fields.length > 0 && parser.peek().type === "COMMA") {
      parser.advance(); // consume ','
    }
    const fieldName = parseIdentifier(parser);
    if (!structDef.fields.some(f => f.name === fieldName)) {
      throw new Error(`Unknown field: ${fieldName} in struct ${structName}`);
    }
    if (seenFields.has(fieldName)) {
      throw new Error(`Duplicate field: ${fieldName} in struct instantiation`);
    }
    seenFields.add(fieldName);
    if (parser.peek().type !== "COLON") {
      throw new Error(`Expected : after field name, got ${parser.peek().type}`);
    }
    parser.advance(); // consume ':'
    const value = parseExpression(parser, variables, functions, structs);
    const fieldDef = structDef.fields.find(f => f.name === fieldName);
    validateStructFieldValue(value, fieldDef.type, structs);
    fields.push({ name: fieldName, value });
  }
  // Check all fields are present
  for (const field of structDef.fields) {
    if (!seenFields.has(field.name)) {
      throw new Error(`Missing field: ${field.name} in struct instantiation`);
    }
  }
  parser.advance(); // consume '}'
  const varName = `__${structName}_${Math.random().toString(36).slice(2)}`;
  return { type: "structInstantiation", structName, fields, varName };
}

function parseReturnType(parser, structs) {
  if (parser.peek().type !== "COLON") {
    throw new Error(`Expected : for return type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ':'
  const retTypeToken = parser.peek();
  if (retTypeToken.type !== "IDENTIFIER") {
    throw new Error(`Expected return type after :, got ${retTypeToken.type}`);
  }
  const retType = retTypeToken.value;
  if (!VALID_SUFFIXES.has(retType) && !structs.has(retType)) {
    throw new Error(`Invalid return type annotation: ${retType}`);
  }
  parser.advance();
  // Expect =>
  if (parser.peek().type !== "ARROW") {
    throw new Error(`Expected => after return type, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '=>'
  return retType;
}

function skipFunctionBody(parser) {
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

function parseFieldAccess(parser, name, variables, functions, structs) {
  parser.advance(); // consume name
  parser.advance(); // consume DOT
  const fieldToken = parser.peek();
  if (fieldToken.type !== "IDENTIFIER") {
    throw new Error(`Expected field name, got ${fieldToken.type}`);
  }
  const field = fieldToken.value;
  parser.advance();
  // Check for chained field access: obj.field.subfield or obj.field[index]
  let current = { type: "fieldAccess", object: { type: "identifier", name }, field };
  while (parser.peek().type === "DOT" || parser.peek().type === "LBRACKET") {
    if (parser.peek().type === "DOT") {
      parser.advance(); // consume DOT
      const nextField = parseIdentifier(parser);
      current = { type: "fieldAccess", object: current, field: nextField };
    } else {
      current = parseArrayIndexChain(parser, current, variables, functions, structs);
    }
  }
  return current;
}

function parseArrayIndexChain(parser, base, variables, functions, structs) {
  parser.advance(); // consume '['
  const index = parseExpression(parser, variables, functions, structs);
  if (parser.peek().type !== "RBRACKET") {
    throw new Error(`Expected ], got ${parser.peek().type}`);
  }
  parser.advance(); // consume ']'
  return { type: "arrayIndex", name: base, index };
}

function validateFieldMutable(fieldExpr, variables, structs) {
  // Extract base variable name and field chain from fieldExpr
  let base = fieldExpr;
  while (base.object) {
    base = base.object;
  }
  const varName = base.name;
  const varInfo = variables.get(varName);
  if (!varInfo || !varInfo.mutable) {
    throw new Error(`Variable ${varName} is not mutable`);
  }
  // Find struct type and check field mutability
  const structName = varInfo.type;
  const structDef = structs.get(structName);
  if (!structDef) {
    throw new Error(`Unknown struct type: ${structName}`);
  }
  // Walk field chain to find the target field
  let current = fieldExpr;
  let currentStruct = structDef;
  while (current.object && current.object.type === "fieldAccess") {
    const fieldName = current.object.field;
    const fieldDef = currentStruct.fields.find(f => f.name === fieldName);
    if (!fieldDef) throw new Error(`Unknown field: ${fieldName}`);
    current = current.object;
    // Navigate to nested struct if needed
    if (structs.has(fieldDef.type)) {
      currentStruct = structs.get(fieldDef.type);
    }
  }
  const targetField = current.field;
  const fieldDef = currentStruct.fields.find(f => f.name === targetField);
  if (!fieldDef || !fieldDef.mutable) {
    throw new Error(`Field ${targetField} is not mutable`);
  }
}

function validateStructFieldValue(value, expectedType, structs) {
  const valueType = inferType(value);
  // Handle struct type matching
  if (structs.has(expectedType)) {
    if (valueType !== expectedType && value.type !== "structInstantiation") {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${valueType}`);
    }
    return;
  }
  // Handle array type matching
  if (expectedType.startsWith("[")) {
    if (value.type !== "arrayLiteral") {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${valueType}`);
    }
    return;
  }
  // Handle Bool vs numeric mismatch
  if (expectedType === "Bool") {
    if (valueType !== "Bool") {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${valueType}`);
    }
    return;
  }
  if (valueType === "Bool") {
    throw new Error(`Type mismatch: expected ${expectedType}, got Bool`);
  }
  // For primitive numeric types, only flag if value is a typed literal with wrong suffix
  if (value.type === "number" && value.suffix && value.suffix !== expectedType) {
    throw new Error(`Type mismatch: expected ${expectedType}, got ${value.suffix}`);
  }
}

function parseCompoundOrAssign(parser, variables, functions, structs, target, assignFn) {
  if (parser.peek().type === "COMPOUND") {
    const op = parser.peek().value;
    parser.advance();
    const rhs = parseExpression(parser, variables, functions, structs);
    return { type: "compoundAssign", target, op, value: rhs };
  }
  if (parser.peek().type === "OP" && parser.peek().value === "=") {
    parser.advance();
    return assignFn();
  }
  return null;
}

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
    const initExpr = parseExpression(parser, variables, functions, structs);
    if (declaredType) {
      validateTypeAnnotation(initExpr, declaredType, structs);
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
      const assignResult = parseCompoundOrAssign(parser, variables, functions, structs, fieldExpr, () => {
        validateFieldMutable(fieldExpr, variables, structs);
        return { type: "fieldAssign", target: fieldExpr, value: parseExpression(parser, variables, functions, structs) };
      });
      if (assignResult) return assignResult;
      return parseBinaryContinuation(parser, variables, functions, structs, fieldExpr);
    }
    // Check for array index assignment: arr[index] = value or arr[index] op= value
    if (parser.peek(1)?.type === "LBRACKET") {
      const idxExpr = parseArrayIndex(parser, name, variables, functions, structs);
      const assignResult = parseCompoundOrAssign(parser, variables, functions, structs, idxExpr, () => {
        validateMutable(name, variables);
        return { type: "arrayAssign", name, index: idxExpr.index, value: parseExpression(parser, variables, functions, structs) };
      });
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

function validateMutable(name, variables) {
  if (!variables.has(name)) {
    throw new Error(`Undeclared variable: ${name}`);
  }
  const varInfo = variables.get(name);
  const isMutable = typeof varInfo === "boolean" ? varInfo : varInfo.mutable;
  if (!isMutable) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
}

function parseAssignmentRhs(parser, name, variables, functions, structs) {
  validateMutable(name, variables);
  const varInfo = variables.get(name);
  const rhs = parseExpression(parser, variables, functions, structs);
  const declaredType = typeof varInfo === "object" ? varInfo.type : null;
  if (declaredType) {
    validateTypeAnnotation(rhs, declaredType, structs);
  }
  return rhs;
}

function parseFn(parser, variables, functions, structs) {
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
  return { type: "fn", name, params: sigParts.params, paramTypes: sigParts.paramTypes, retType: sigParts.retType, body };
}

function parseFnCall(parser, name, variables, functions, structs) {
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
  // Validate function exists
  if (!functions.has(name)) {
    throw new Error(`Undeclared function: ${name}`);
  }
  const fn = functions.get(name);
  if (args.length !== fn.params.length) {
    throw new Error(`Function ${name} expects ${fn.params.length} arguments, got ${args.length}`);
  }
  return { type: "fnCall", name, args };
}

function parseArrayIndex(parser, name, variables, functions, structs) {
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

function parseArrayLiteral(parser, variables, functions, structs) {
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

function parseIfCondition(parser, variables, functions, structs) {
  parser.advance(); // consume 'if'
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after if, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const condition = parseExpression(parser, variables, functions, structs);
  if (!isBoolType(condition, variables, functions, structs)) {
    throw new Error(`Expected Bool for if condition, got ${inferType(condition)}`);
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after if condition, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  return condition;
}

function parseIfExpressionBranch(parser, variables, functions, structs, condition, thenBranch) {
  const elseBranch = parseExpression(parser, variables, functions, structs);
  const thenType = inferType(thenBranch);
  const elseType = inferType(elseBranch);
  if (thenType !== elseType && thenType !== "unknown" && elseType !== "unknown") {
    throw new Error(`Type mismatch in if-else: then branch is ${thenType}, else branch is ${elseType}`);
  }
  return { type: "if", condition, thenBranch, elseBranch };
}

function parseIfStatementBranch(parser, variables, functions, structs, condition, thenBranch) {
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

function parseIfStatement(parser, variables, functions, structs) {
  const condition = parseIfCondition(parser, variables, functions, structs);
  const thenBranch = parseBlockStatements(parser, variables, functions, structs);
  return parseIfStatementBranch(parser, variables, functions, structs, condition, thenBranch);
}

function parseWhile(parser, variables, functions, structs) {
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

function parseBlockStatements(parser, variables, functions, structs) {
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

function parseBlock(parser, parentVariables, functions, structs, allowStatement) {
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
  const isStatementType = (s) => s && (s.type === "let" || s.type === "assign" || s.type === "ifStmt" || s.type === "whileStmt" || s.type === "blockStmt");
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

function parseIdentifier(parser) {
  const token = parser.peek();
  if (token.type !== "IDENTIFIER") {
    throw new Error(`Expected identifier, got ${token.type}`);
  }
  parser.advance();
  return token.value;
}

function parseExpression(parser, variables, functions, structs) {
  return parseOr(parser, variables, functions, structs);
}

function parseBinaryContinuation(parser, variables, functions, structs, left) {
  let current = left;
  while (parser.peek().type === "OP" && parser.peek().value === "+") {
    parser.advance();
    const right = parsePrimary(parser, variables, functions, structs);
    current = { type: "binary", op: "+", left: current, right };
  }
  return current;
}

function isBoolType(expr, variables, functions) {
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

function parseOr(parser, variables, functions, structs) {
  let left = parseAnd(parser, variables, functions, structs);
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

function parseAnd(parser, variables, functions, structs) {
  let left = parseComparison(parser, variables, functions, structs);
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

function parseComparison(parser, variables, functions, structs) {
  let left = parseAddSub(parser, variables, functions, structs);
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

function parseAddSub(parser, variables, functions, structs) {
  let left = parseMulDivMod(parser, variables, functions, structs);
  while (parser.peek().type === "OP" && (parser.peek().value === "+" || parser.peek().value === "-")) {
    const op = parser.advance().value;
    const right = parseMulDivMod(parser, variables, functions, structs);
    left = { type: "binary", op, left, right };
  }
  return left;
}

function parseMulDivMod(parser, variables, functions, structs) {
  let left = parseUnary(parser, variables, functions, structs);
  while (parser.peek().type === "OP" && (parser.peek().value === "*" || parser.peek().value === "/" || parser.peek().value === "%")) {
    const op = parser.advance().value;
    const right = parseUnary(parser, variables, functions);
    left = { type: "binary", op, left, right };
  }
  return left;
}

function parseUnary(parser, variables, functions, structs) {
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

function parsePrimary(parser, variables, functions, structs) {
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
      if (!variables.has(token.value)) {
        throw new Error(`Undeclared variable: ${token.value}`);
      }
      result = { type: "identifier", name: token.value };
    }
  } else if (token.type === "LPAREN") {
    parser.advance();
    result = parseExpression(parser, variables, functions, structs);
    if (parser.peek().type !== "RPAREN") {
      throw new Error(`Expected ), got ${parser.peek().type}`);
    }
    parser.advance();
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
      if (fieldToken.type !== "IDENTIFIER") {
        throw new Error(`Expected field name, got ${fieldToken.type}`);
      }
      const field = fieldToken.value;
      parser.advance();
      result = { type: "fieldAccess", object: obj, field };
    } else {
      result = parseArrayIndexChain(parser, result, variables, functions, structs);
    }
  }
  return result;
}

function parseIfExpression(parser, variables, functions, structs) {
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
