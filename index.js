const VALID_SUFFIXES = new Set(["U8", "U16", "U32", "I8", "I16", "I32", "F32", "F64"]);

const SUFFIX_RANGES = {
  U8: { min: 0, max: 255 },
  U16: { min: 0, max: 65535 },
  U32: { min: 0, max: 4294967295 },
  I8: { min: -128, max: 127 },
  I16: { min: -32768, max: 32767 },
  I32: { min: -2147483648, max: 2147483647 },
};

function validateSuffix(numStr, suffix, negative) {
  if (!suffix) return;
  const range = SUFFIX_RANGES[suffix];
  if (!range) return; // F32/F64 don't have range constraints
  const value = negative ? -parseFloat(numStr) : parseFloat(numStr);
  if (value < range.min || value > range.max) {
    throw new Error(`Value ${value} out of range for ${suffix} (${range.min} to ${range.max})`);
  }
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
    if (ch === "+" || ch === "*" || ch === "/" || ch === "%" || ch === "=") {
      tokens.push({ type: "OP", value: ch });
      i++;
      continue;
    }
    if (ch === "-") {
      // Check if this is a negative number literal (followed by digit)
      if (i + 1 < source.length && source[i + 1] >= "0" && source[i + 1] <= "9") {
        i++; // skip '-'
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
        validateSuffix(numStr, suffix, true);
        tokens.push({ type: "NUMBER", value: numStr, suffix, negative: true });
        continue;
      }
      tokens.push({ type: "OP", value: "-" });
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
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
      validateSuffix(numStr, suffix, false);
      tokens.push({ type: "NUMBER", value: numStr, suffix });
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
      } else if (ident === "return") {
        tokens.push({ type: "RETURN" });
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
    peek: function () {
      return this.tokens[this.pos];
    },
    advance: function () {
      return this.tokens[this.pos++];
    },
  };
  const variables = new Set();
  const statements = [];
  while (!parser.atEOF()) {
    if (parser.peek().type === "LET") {
      parser.advance();
      const name = parseIdentifier(parser);
      if (variables.has(name)) {
        throw new Error(`Duplicate variable: ${name}`);
      }
      variables.add(name);
      if (parser.peek().type !== "OP" || parser.peek().value !== "=") {
        throw new Error(`Expected = in let statement, got ${parser.peek().type}`);
      }
      parser.advance();
      const initExpr = parseExpression(parser, variables);
      statements.push({ type: "let", name, init: initExpr });
    } else {
      statements.push(parseExpression(parser, variables));
    }
    if (parser.peek().type === "SEMICOLON") {
      parser.advance();
    }
  }
  return { statements, variables: Array.from(variables) };
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
  return parseAddSub(parser, variables);
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
  throw new Error(`Unexpected token: ${token.type}`);
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
  if (node.type === "unary") {
    return `-${generateExpr(node.operand)}`;
  }
  if (node.type === "binary") {
    return `(${generateExpr(node.left)} ${node.op} ${generateExpr(node.right)})`;
  }
  throw new Error(`Unknown node type: ${node.type}`);
}
