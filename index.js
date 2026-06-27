function tokenize(source) {
  const tokens = [];
  let i = 0;

  while (i < source.length) {
    // Skip whitespace
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }

    // Numbers
    if (/[\d.]/.test(source[i])) {
      let num = "";
      while (i < source.length && /[\d.]/.test(source[i])) {
        num += source[i++];
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // Identifiers and keywords
    if (/^[a-zA-Z_]$/.test(source[i])) {
      let ident = "";
      while (i < source.length && /[\w]/.test(source[i])) {
        ident += source[i++];
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    // Single-char operators and delimiters
    const single = "+-*/=(){};,<>!";
    if (single.includes(source[i])) {
      let op = source[i++];

      tokens.push({ type: "op", value: op });
      continue;
    }

    throw new Error(`Unexpected character: ${source[i]}`);
  }

  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume(expectedType, expectedValue) {
    const token = this.peek();
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType}, got ${token.type}`);
    }
    if (expectedValue && token.value !== expectedValue) {
      throw new Error(`Expected "${expectedValue}", got "${token.value}"`);
    }
    this.pos++;
    return token;
  }

  parse() {
    const expr = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token: ${this.peek().value}`);
    }
    return expr;
  }

  parseExpression() {
    let left = this.parseAdditive();
    while (true) {
      const tok = this.peek();
      if (tok && tok.type === "op" && "<>!=".includes(tok.value)) {
        this.consume("op");
        const right = this.parseAdditive();
        left = { type: "binary", op: tok.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (true) {
      const tok = this.peek();
      if (
        tok &&
        tok.type === "op" &&
        (tok.value === "+" || tok.value === "-")
      ) {
        this.consume("op");
        const right = this.parseMultiplicative();
        left = { type: "binary", op: tok.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parsePrimary();
    while (true) {
      const tok = this.peek();
      if (
        tok &&
        tok.type === "op" &&
        (tok.value === "*" || tok.value === "/")
      ) {
        this.consume("op");
        const right = this.parsePrimary();
        left = { type: "binary", op: tok.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  parsePrimary() {
    const tok = this.peek();

    // Number literal
    if (tok && tok.type === "number") {
      this.consume("number");
      return { type: "literal", value: tok.value };
    }

    // Parenthesized expression
    if (tok && tok.type === "op" && tok.value === "(") {
      this.consume("op", "(");
      const expr = this.parseExpression();
      this.consume("op", ")");
      return expr;
    }

    // Block expression
    if (tok && tok.type === "op" && tok.value === "{") {
      return this.parseBlock();
    }

    // Identifier / variable reference
    if (tok && tok.type === "ident") {
      this.consume("ident");
      return { type: "variable", name: tok.value };
    }

    throw new Error(`Unexpected token: ${tok?.value}`);
  }

  parseBlock() {
    this.consume("op", "{");

    const statements = [];
    let lastExpr;

    while (this.peek().value !== "}") {
      // Check for `let` declaration
      if (this.peek()?.type === "ident" && this.peek()?.value === "let") {
        this.consume("ident", "let");
        const name = this.consume("ident").value;
        this.consume("op", "=");
        const value = this.parseExpression();

        // Expect semicolon after let statement
        if (this.peek().value === ";") {
          this.consume("op", ";");
        }

        statements.push({ type: "let", name, value });
      } else {
        lastExpr = this.parseExpression();

        // Optional semicolon between expressions
        if (this.peek()?.value === ";") {
          this.consume("op", ";");
        }
      }
    }

    this.consume("op", "}");

    return { type: "block", statements, lastExpr };
  }
}

class Evaluator {
  constructor(scope) {
    this.scope = scope || {};
  }

  evaluate(node) {
    switch (node.type) {
      case "literal":
        return node.value;
      case "variable":
        if (!(node.name in this.scope)) {
          throw new Error(`Undefined variable: ${node.name}`);
        }
        return this.scope[node.name];
      case "binary":
        return this.evaluateBinary(node);
      case "block":
        return this.evaluateBlock(node);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  evaluateBinary(node) {
    const left = this.evaluate(node.left);
    const right = this.evaluate(node.right);

    switch (node.op) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        return left / right;
      default:
        throw new Error(`Unknown operator: ${node.op}`);
    }
  }

  evaluateBlock(node) {
    const childScope = Object.create(this.scope);

    for (const stmt of node.statements) {
      if (stmt.type === "let") {
        childScope[stmt.name] = this.evaluate(stmt.value);
      }
    }

    // Evaluate the last expression in a new scope with let bindings
    const evaluator = new Evaluator(childScope);
    return evaluator.evaluate(node.lastExpr);
  }
}

export function executeTuff(source) {
  if (source.trim() === "") return 0;

  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const ast = parser.parse();

  const evaluator = new Evaluator({});
  const result = evaluator.evaluate(ast);

  return typeof result === "number" ? result : Number(result);
}
