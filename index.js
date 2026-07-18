const VALID_SUFFIXES = new Set(["U8", "U16", "U32", "I8", "I16", "I32", "F32", "F64", "Bool"]);

const SUFFIX_RANGES = {
  U8: { min: 0, max: 255 },
  U16: { min: 0, max: 65535 },
  U32: { min: 0, max: 4294967295 },
  I8: { min: -128, max: 127 },
  I16: { min: -32768, max: 32767 },
  I32: { min: -2147483648, max: 2147483647 },
};

function parseNumberLiteral(source, i, negative) {
  let numStr = "";
  while (i < source.length && ((source[i] >= "0" && source[i] <= "9") || source[i] === ".")) {
    numStr += source[i];
    i++;
  }
  let suffix = "";
  if (i < source.length && "UIF".includes(source[i])) {
    while (i < source.length && ((source[i] >= "A" && source[i] <= "Z") || (source[i] >= "0" && source[i] <= "9"))) {
      suffix += source[i];
      i++;
    }
  }
  if (suffix && !VALID_SUFFIXES.has(suffix)) {
    throw new Error(`Invalid suffix: ${suffix}`);
  }
  validateSuffix(numStr, suffix, negative);
  const token = { type: "NUMBER", value: numStr, suffix, _end: i };
  if (negative) token.negative = true;
  return token;
}

function validateSuffix(numStr, suffix, negative) {
  if (!suffix) return;
  const range = SUFFIX_RANGES[suffix];
  if (!range) return; // F32/F64 don't have range constraints
  const value = negative ? -parseFloat(numStr) : parseFloat(numStr);
  if (value < range.min || value > range.max) {
    throw new Error(`Value ${value} out of range for ${suffix} (${range.min} to ${range.max})`);
  }
}

function validateTypeAnnotation(expr, declaredType) {
  const exprType = inferType(expr);
  // Validate Bool type
  if (declaredType === "Bool") {
    if (exprType !== "Bool") {
      throw new Error(`Type mismatch: expected Bool, got ${exprType}`);
    }
    return;
  }
  // Reject boolean values for non-Bool types
  if (exprType === "Bool") {
    throw new Error(`Type mismatch: expected ${declaredType}, got Bool`);
  }
  // Only validate literal numbers at compile time
  if (expr.type !== "number") return;
  // If literal has a suffix, it must match the declared type
  if (expr.suffix && expr.suffix !== declaredType) {
    throw new Error(`Type mismatch: expected ${declaredType}, got ${expr.suffix}`);
  }
  // Validate value against declared type range
  const range = SUFFIX_RANGES[declaredType];
  if (!range) return; // F32/F64 don't have range constraints
  const value = expr.negative ? -parseFloat(expr.value) : parseFloat(expr.value);
  if (value < range.min || value > range.max) {
    throw new Error(`Value ${value} out of range for ${declaredType} (${range.min} to ${range.max})`);
  }
}

function inferType(expr) {
  if (expr.type === "boolean") return "Bool";
  if (expr.type === "number") return expr.suffix || "number";
  if (expr.type === "identifier") return "unknown";
  if (expr.type === "binary") {
    if (expr.op === "&&" || expr.op === "||" || expr.op === "==" || expr.op === "!=" || expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=") return "Bool";
    return inferType(expr.left);
  }
  if (expr.type === "unary") {
    if (expr.op === "!") return "Bool";
    return inferType(expr.operand);
  }
  if (expr.type === "block") return inferType(expr.finalExpr);
  if (expr.type === "if") return inferType(expr.thenBranch);
  return "unknown";
}

export function compile(source) {
  const tokens = tokenize(source);
  const { statements, variables } = parse(tokens);
  return generate(statements, variables);
}

function tokenize(source) {
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "SEMICOLON" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "LBRACE" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "RBRACE" });
      i++;
      continue;
    }
    if (ch === "+" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "+=" });
      i += 2;
      continue;
    }
    if (ch === "*" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "*=" });
      i += 2;
      continue;
    }
    if (ch === "/" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "/=" });
      i += 2;
      continue;
    }
    if (ch === "%" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "COMPOUND", value: "%=" });
      i += 2;
      continue;
    }
    if (ch === "+" || ch === "*" || ch === "/" || ch === "%") {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }
    if (ch === "&" && i + 1 < source.length && source[i + 1] === "&") {
      tokens.push({ type: "AND" });
      i += 2;
      continue;
    }
    if (ch === "|" && i + 1 < source.length && source[i + 1] === "|") {
      tokens.push({ type: "OR" });
      i += 2;
      continue;
    }
    if (ch === "<" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "CMP", value: "<=" });
      i += 2;
      continue;
    }
    if (ch === ">" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "CMP", value: ">=" });
      i += 2;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: "CMP", value: "<" });
      i++;
      continue;
    }
    if (ch === ">") {
      tokens.push({ type: "CMP", value: ">" });
      i++;
      continue;
    }
    if (ch === "=" && i + 1 < source.length && source[i + 1] === "=") {
      tokens.push({ type: "CMP", value: "==" });
      i += 2;
      continue;
    }
    if (ch === "!") {
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "CMP", value: "!=" });
        i += 2;
      } else {
        tokens.push({ type: "NOT" });
        i++;
      }
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }
    if (ch === ":") {
      tokens.push({ type: "COLON" });
      i++;
      continue;
    }
    if (ch === "-") {
      // Check if this is -= compound assignment
      if (i + 1 < source.length && source[i + 1] === "=") {
        tokens.push({ type: "COMPOUND", value: "-=" });
        i += 2;
        continue;
      }
      // Check if this is a negative number literal (followed by digit)
      if (i + 1 < source.length && source[i + 1] >= "0" && source[i + 1] <= "9") {
        i++; // skip '-'
        tokens.push(parseNumberLiteral(source, i, true));
        i = tokens[tokens.length - 1]._end;
        continue;
      }
      tokens.push({ type: "OP", value: "-" });
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      tokens.push(parseNumberLiteral(source, i, false));
      i = tokens[tokens.length - 1]._end;
      continue;
    }
    // Handle identifiers and keywords
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let ident = "";
      while (i < source.length && ((source[i] >= "a" && source[i] <= "z") || (source[i] >= "A" && source[i] <= "Z") || (source[i] >= "0" && source[i] <= "9") || source[i] === "_")) {
        ident += source[i];
        i++;
      }
      if (ident === "let") {
        tokens.push({ type: "LET" });
      } else if (ident === "mut") {
        tokens.push({ type: "MUT" });
      } else if (ident === "return") {
        tokens.push({ type: "RETURN" });
      } else if (ident === "if") {
        tokens.push({ type: "IF" });
      } else if (ident === "else") {
        tokens.push({ type: "ELSE" });
      } else if (ident === "while") {
        tokens.push({ type: "WHILE" });
      } else if (ident === "true") {
        tokens.push({ type: "BOOL", value: true });
      } else if (ident === "false") {
        tokens.push({ type: "BOOL", value: false });
      } else {
        tokens.push({ type: "IDENTIFIER", value: ident });
      }
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  tokens.push({ type: "EOF" });
  return tokens;
}

function parse(tokens) {
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
  const statements = [];
  while (!parser.atEOF()) {
    statements.push(parseStatement(parser, variables));
    if (parser.peek().type === "SEMICOLON") {
      parser.advance();
    }
  }
  return { statements, variables: Array.from(variables.entries()).map(([name, info]) => {
    const isMutable = typeof info === "boolean" ? info : info.mutable;
    return { name, mutable: isMutable };
  }) };
}

function parseStatement(parser, variables) {
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
      const typeToken = parser.peek();
      if (typeToken.type !== "IDENTIFIER") {
        throw new Error(`Expected type after :, got ${typeToken.type}`);
      }
      declaredType = typeToken.value;
      if (!VALID_SUFFIXES.has(declaredType)) {
        throw new Error(`Invalid type annotation: ${declaredType}`);
      }
      parser.advance();
    }
    if (parser.peek().type !== "OP" || parser.peek().value !== "=") {
      throw new Error(`Expected = in let statement, got ${parser.peek().type}`);
    }
    parser.advance();
    const initExpr = parseExpression(parser, variables);
    if (declaredType) {
      validateTypeAnnotation(initExpr, declaredType);
    }
    variables.set(name, { mutable: isMut, type: declaredType });
    return { type: "let", name, mutable: isMut, init: initExpr };
  }
  if (parser.peek().type === "IDENTIFIER") {
    const name = parser.peek().value;
    if (parser.peek(1)?.type === "COMPOUND") {
      const op = parser.peek(1).value;
      parser.advance();
      parser.advance();
      const rhs = parseAssignmentRhs(parser, name, variables);
      return { type: "compoundAssign", name, op, value: rhs };
    }
    if (parser.peek(1)?.type === "OP" && parser.peek(1)?.value === "=") {
      parser.advance();
      parser.advance();
      const rhs = parseAssignmentRhs(parser, name, variables);
      return { type: "assign", name, value: rhs };
    }
  }
  if (parser.peek().type === "IF") {
    // Parse condition first
    const condition = parseIfCondition(parser, variables);

    // Check if branch starts with LBRACE
    if (parser.peek().type === "LBRACE") {
      // Try parsing block to determine if it's a statement or expression
      const savedPos = parser.pos;
      const block = parseBlock(parser, variables, true);
      if (block.type === "blockStmt") {
        return parseIfStatementBranch(parser, variables, condition, block.statements);
      }
      // Block expression - use it as thenBranch for if-expression
      if (parser.peek().type !== "ELSE") {
        throw new Error(`Expected else, got ${parser.peek().type}`);
      }
      parser.advance(); // consume 'else'
      return parseIfExpressionBranch(parser, variables, condition, block);
    }
    // Parse as if-expression (non-block branch)
    const thenBranch = parseExpression(parser, variables);
    if (parser.peek().type !== "ELSE") {
      throw new Error(`Expected else, got ${parser.peek().type}`);
    }
    parser.advance(); // consume 'else'
    return parseIfExpressionBranch(parser, variables, condition, thenBranch);
  }
  if (parser.peek().type === "WHILE") {
    return parseWhile(parser, variables);
  }
  if (parser.peek().type === "LBRACE") {
    const block = parseBlock(parser, variables, true);
    if (block.type === "blockStmt") {
      return block;
    }
    /* block expression - continue parsing binary ops */
    return parseBinaryContinuation(parser, variables, block);
  }
  return parseExpression(parser, variables);
}

function parseAssignmentRhs(parser, name, variables) {
  if (!variables.has(name)) {
    throw new Error(`Undeclared variable: ${name}`);
  }
  const varInfo = variables.get(name);
  const isMutable = typeof varInfo === "boolean" ? varInfo : varInfo.mutable;
  if (!isMutable) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
  const rhs = parseExpression(parser, variables);
  const declaredType = typeof varInfo === "object" ? varInfo.type : null;
  if (declaredType) {
    validateTypeAnnotation(rhs, declaredType);
  }
  return rhs;
}

function parseIfCondition(parser, variables) {
  parser.advance(); // consume 'if'
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after if, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const condition = parseExpression(parser, variables);
  if (!isBoolType(condition, variables)) {
    throw new Error(`Expected Bool for if condition, got ${inferType(condition)}`);
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after if condition, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  return condition;
}

function parseIfExpressionBranch(parser, variables, condition, thenBranch) {
  const elseBranch = parseExpression(parser, variables);
  const thenType = inferType(thenBranch);
  const elseType = inferType(elseBranch);
  if (thenType !== elseType && thenType !== "unknown" && elseType !== "unknown") {
    throw new Error(`Type mismatch in if-else: then branch is ${thenType}, else branch is ${elseType}`);
  }
  return { type: "if", condition, thenBranch, elseBranch };
}

function parseIfStatementBranch(parser, variables, condition, thenBranch) {
  let elseBranch = null;
  if (parser.peek().type === "ELSE") {
    parser.advance(); // consume 'else'
    if (parser.peek().type === "IF") {
      const elseIfStmt = parseIfStatement(parser, variables);
      elseBranch = [elseIfStmt];
    } else {
      elseBranch = parseBlockStatements(parser, variables);
    }
  }
  return { type: "ifStmt", condition, thenBranch, elseBranch };
}

function parseIfStatement(parser, variables) {
  const condition = parseIfCondition(parser, variables);
  const thenBranch = parseBlockStatements(parser, variables);
  return parseIfStatementBranch(parser, variables, condition, thenBranch);
}

function parseWhile(parser, variables) {
  parser.advance(); // consume 'while'
  if (parser.peek().type !== "LPAREN") {
    throw new Error(`Expected ( after while, got ${parser.peek().type}`);
  }
  parser.advance(); // consume '('
  const condition = parseExpression(parser, variables);
  if (!isBoolType(condition, variables)) {
    throw new Error(`Expected Bool for while condition, got ${inferType(condition)}`);
  }
  if (parser.peek().type !== "RPAREN") {
    throw new Error(`Expected ) after while condition, got ${parser.peek().type}`);
  }
  parser.advance(); // consume ')'
  const body = parseBlockStatements(parser, variables);
  return { type: "whileStmt", condition, body };
}

function parseBlockStatements(parser, variables) {
  if (parser.peek().type !== "LBRACE") {
    throw new Error(`Expected { for if branch, got ${parser.peek().type}`);
  }
  parser.advance(); // consume LBRACE
  const statements = [];
  while (parser.peek().type !== "RBRACE" && parser.peek().type !== "EOF") {
    statements.push(parseStatement(parser, variables));
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

function parseBlock(parser, parentVariables, allowStatement) {
  parser.advance(); // consume LBRACE
  const blockVars = new Map(parentVariables);
  const statements = [];
  let lastHadSemicolon = false;
  while (parser.peek().type !== "RBRACE" && parser.peek().type !== "EOF") {
    statements.push(parseStatement(parser, blockVars));
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
  const isStatementType = (s) => s.type === "let" || s.type === "assign" || s.type === "ifStmt" || s.type === "whileStmt" || s.type === "blockStmt";
  if (lastHadSemicolon || statements.length === 0 || isStatementType(statements[statements.length - 1])) {
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

function parseExpression(parser, variables) {
  return parseOr(parser, variables);
}

function parseBinaryContinuation(parser, variables, left) {
  let current = left;
  while (parser.peek().type === "OP" && parser.peek().value === "+") {
    parser.advance();
    const right = parsePrimary(parser, variables);
    current = { type: "binary", op: "+", left: current, right };
  }
  return current;
}

function isBoolType(expr, variables) {
  if (expr.type === "boolean") return true;
  if (expr.type === "binary" && (expr.op === "&&" || expr.op === "||" || expr.op === "==" || expr.op === "!=" || expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=")) return true;
  if (expr.type === "unary" && expr.op === "!") return true;
  if (expr.type === "identifier") {
    const varInfo = variables.get(expr.name);
    if (typeof varInfo === "object" && varInfo.type === "Bool") return true;
  }
  return false;
}

function parseOr(parser, variables) {
  let left = parseAnd(parser, variables);
  while (parser.peek().type === "OR") {
    parser.advance();
    const right = parseAnd(parser, variables);
    if (!isBoolType(left, variables)) {
      throw new Error(`Expected Bool for ||, got ${inferType(left)}`);
    }
    if (!isBoolType(right, variables)) {
      throw new Error(`Expected Bool for ||, got ${inferType(right)}`);
    }
    left = { type: "binary", op: "||", left, right };
  }
  return left;
}

function parseAnd(parser, variables) {
  let left = parseComparison(parser, variables);
  while (parser.peek().type === "AND") {
    parser.advance();
    const right = parseComparison(parser, variables);
    if (!isBoolType(left, variables)) {
      throw new Error(`Expected Bool for &&, got ${inferType(left)}`);
    }
    if (!isBoolType(right, variables)) {
      throw new Error(`Expected Bool for &&, got ${inferType(right)}`);
    }
    left = { type: "binary", op: "&&", left, right };
  }
  return left;
}

function parseComparison(parser, variables) {
  let left = parseAddSub(parser, variables);
  while (parser.peek().type === "CMP") {
    const op = parser.advance().value;
    const right = parseAddSub(parser, variables);
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

function parseAddSub(parser, variables) {
  let left = parseMulDivMod(parser, variables);
  while (parser.peek().type === "OP" && (parser.peek().value === "+" || parser.peek().value === "-")) {
    const op = parser.advance().value;
    const right = parseMulDivMod(parser, variables);
    left = { type: "binary", op, left, right };
  }
  return left;
}

function parseMulDivMod(parser, variables) {
  let left = parseUnary(parser, variables);
  while (parser.peek().type === "OP" && (parser.peek().value === "*" || parser.peek().value === "/" || parser.peek().value === "%")) {
    const op = parser.advance().value;
    const right = parseUnary(parser, variables);
    left = { type: "binary", op, left, right };
  }
  return left;
}

function parseUnary(parser, variables) {
  if (parser.peek().type === "OP" && parser.peek().value === "-") {
    parser.advance();
    const operand = parseUnary(parser, variables);
    return { type: "unary", op: "-", operand };
  }
  if (parser.peek().type === "NOT") {
    parser.advance();
    const operand = parseUnary(parser, variables);
    if (!isBoolType(operand, variables)) {
      throw new Error(`Expected Bool for !, got ${inferType(operand)}`);
    }
    return { type: "unary", op: "!", operand };
  }
  return parsePrimary(parser, variables);
}

function parsePrimary(parser, variables) {
  const token = parser.peek();
  if (token.type === "NUMBER") {
    parser.advance();
    return { type: "number", value: token.value, suffix: token.suffix, negative: token.negative };
  }
  if (token.type === "IDENTIFIER") {
    parser.advance();
    if (!variables.has(token.value)) {
      throw new Error(`Undeclared variable: ${token.value}`);
    }
    return { type: "identifier", name: token.value };
  }
  if (token.type === "LPAREN") {
    parser.advance();
    const expr = parseExpression(parser, variables);
    if (parser.peek().type !== "RPAREN") {
      throw new Error(`Expected ), got ${parser.peek().type}`);
    }
    parser.advance();
    return expr;
  }
  if (token.type === "BOOL") {
    parser.advance();
    return { type: "boolean", value: token.value };
  }
  if (token.type === "LBRACE") {
    return parseBlock(parser, variables, false);
  }
  if (token.type === "IF") {
    return parseIfExpression(parser, variables);
  }
  throw new Error(`Unexpected token: ${token.type}`);
}

function parseIfExpression(parser, variables) {
  const condition = parseIfCondition(parser, variables);
  const thenBranch = parseExpression(parser, variables);
  if (parser.peek().type !== "ELSE") {
    throw new Error(`Expected else, got ${parser.peek().type}`);
  }
  parser.advance(); // consume 'else'
  // Check if else branch is another if-expression (else-if chain)
  if (parser.peek().type === "IF") {
    const elseIfExpr = parseIfExpression(parser, variables);
    return { type: "if", condition, thenBranch, elseBranch: elseIfExpr };
  }
  return parseIfExpressionBranch(parser, variables, condition, thenBranch);
}

function generateStatements(statements) {
  let code = "";
  for (const stmt of statements) {
    if (stmt.type === "let") {
      code += `let ${stmt.name} = ${generateExpr(stmt.init)};\n`;
    } else if (stmt.type === "assign") {
      code += `${stmt.name} = ${generateExpr(stmt.value)};\n`;
    } else if (stmt.type === "compoundAssign") {
      const op = stmt.op.replace("=", "");
      code += `${stmt.name} = ${stmt.name} ${op} ${generateExpr(stmt.value)};\n`;
    } else if (stmt.type === "ifStmt") {
      code += generateIfStmt(stmt);
    } else if (stmt.type === "whileStmt") {
      code += `while (${generateExpr(stmt.condition)}) { ${generateStatements(stmt.body)} };
`;
    } else {
      code += `${generateExpr(stmt)};\n`;
    }
  }
  return code;
}

function generateIfStmt(node) {
  let code = `if (${generateExpr(node.condition)}) { ${generateStatements(node.thenBranch)} }`;
  if (node.elseBranch) {
    code += ` else { ${generateStatements(node.elseBranch)} }`;
  }
  return code;
}

function clampExpr(value, suffix) {
  switch (suffix) {
    case "F32":
      return `parseFloat(${value}.toPrecision(6))`;
    case "F64":
      return value;
    case "":
      return value;
    default:
      // Integer types validated at compile time, no runtime clamping needed
      return value;
  }
}

function generate(statements, variables) {
  if (statements.length === 0) return "return 0;";
  let code = "";
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.type === "let") {
      const initValue = generateExpr(stmt.init);
      code += `let ${stmt.name} = ${initValue};\n`;
    } else if (stmt.type === "assign") {
      const rhsValue = generateExpr(stmt.value);
      code += `${stmt.name} = ${rhsValue};\n`;
    } else if (stmt.type === "compoundAssign") {
      const op = stmt.op.replace("=", "");
      const rhsValue = generateExpr(stmt.value);
      code += `${stmt.name} = ${stmt.name} ${op} ${rhsValue};\n`;
    } else if (stmt.type === "blockStmt") {
      code += generateStatements(stmt.statements);
      if (i === statements.length - 1) {
        code += `return 0;`;
      }
    } else if (stmt.type === "ifStmt") {
      code += generateIfStmt(stmt);
      if (i === statements.length - 1) {
        code += `return 0;`;
      }
    } else if (stmt.type === "whileStmt") {
      code += `while (${generateExpr(stmt.condition)}) { ${generateStatements(stmt.body)} };
`;
      if (i === statements.length - 1) {
        code += `return 0;`;
      }
    } else {
      const value = generateExpr(stmt);
      if (i === statements.length - 1) {
        code += `return ${value};`;
      } else {
        code += `${value};`;
      }
    }
  }
  return code;
}

function generateExpr(node) {
  if (node.type === "number") {
    let value = node.value;
    if (node.negative) {
      value = `-${value}`;
    }
    return clampExpr(value, node.suffix);
  }
  if (node.type === "identifier") {
    return node.name;
  }
  if (node.type === "boolean") {
    return node.value ? "1" : "0";
  }
  if (node.type === "unary") {
    if (node.op === "!") return `!${generateExpr(node.operand)}`;
    return `-${generateExpr(node.operand)}`;
  }
  if (node.type === "binary") {
    if (node.op === "&&" || node.op === "||") {
      return `(${generateExpr(node.left)} ${node.op} ${generateExpr(node.right)})`;
    }
    return `(${generateExpr(node.left)} ${node.op} ${generateExpr(node.right)})`;
  }
  if (node.type === "block") {
    return `(() => { ${generateStatements(node.statements)}return ${generateExpr(node.finalExpr)}; })()`;
  }
  if (node.type === "if") {
    return `(${generateExpr(node.condition)} ? ${generateExpr(node.thenBranch)} : ${generateExpr(node.elseBranch)})`;
  }
  if (node.type === "blockStmt") {
    return `(() => { ${generateStatements(node.statements)} })()`;
  }
  throw new Error(`Unknown node type: ${node.type}`);
}
