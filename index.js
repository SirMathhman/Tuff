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
  const statements = parse(tokens);
  return generate(statements);
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
    if (ch === "+" || ch === "*" || ch === "/" || ch === "%") {
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
  const statements = [];
  while (!parser.atEOF()) {
    statements.push(parseExpression(parser));
    if (parser.peek().type === "SEMICOLON") {
      parser.advance();
    }
  }
  return statements;
}

function parseExpression(parser) {
  return parseAddSub(parser);
}

function parseAddSub(parser) {
  let left = parseMulDivMod(parser);
  while (parser.peek().type === "OP" && (parser.peek().value === "+" || parser.peek().value === "-")) {
    const op = parser.advance().value;
    const right = parseMulDivMod(parser);
    left = { type: "binary", op, left, right };
  }
  return left;
}

function parseMulDivMod(parser) {
  let left = parseUnary(parser);
  while (parser.peek().type === "OP" && (parser.peek().value === "*" || parser.peek().value === "/" || parser.peek().value === "%")) {
    const op = parser.advance().value;
    const right = parseUnary(parser);
    left = { type: "binary", op, left, right };
  }
  return left;
}

function parseUnary(parser) {
  if (parser.peek().type === "OP" && parser.peek().value === "-") {
    parser.advance();
    const operand = parseUnary(parser);
    return { type: "unary", op: "-", operand };
  }
  return parsePrimary(parser);
}

function parsePrimary(parser) {
  const token = parser.peek();
  if (token.type === "NUMBER") {
    parser.advance();
    return { type: "number", value: token.value, suffix: token.suffix, negative: token.negative };
  }
  if (token.type === "LPAREN") {
    parser.advance();
    const expr = parseExpression(parser);
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

function generate(statements) {
  if (statements.length === 0) return "return 0;";
  let code = "";
  for (let i = 0; i < statements.length; i++) {
    const expr = statements[i];
    const value = generateExpr(expr);
    if (i === statements.length - 1) {
      code += `return ${value};`;
    } else {
      code += `${value};`;
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
  if (node.type === "unary") {
    return `-${generateExpr(node.operand)}`;
  }
  if (node.type === "binary") {
    return `(${generateExpr(node.left)} ${node.op} ${generateExpr(node.right)})`;
  }
  throw new Error(`Unknown node type: ${node.type}`);
}
