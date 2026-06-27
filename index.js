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
    // Parse top-level as a sequence of let statements followed by an expression (implicit block)
    const result = this.parseStatementsAndExpr(
      () => this.pos < this.tokens.length,
    );
    return { type: "block", ...result };
  }

  /** Parse `name = expr;` and return { name, value }. */
  parseAssignmentRhs() {
    const name = this.consume("ident").value;
    this.consume("op", "=");
    const value = this.parseExpression();

    if (this.peek().value === ";") {
      this.consume("op", ";");
    }

    return { name, value };
  }

  parseStatementsAndExpr(shouldContinue) {
    const statements = [];
    let lastExpr;
    const intermediateExprs = [];

    while (shouldContinue()) {
      // Check for `let` declaration (with optional `mut`)
      if (this.peek()?.type === "ident" && this.peek()?.value === "let") {
        this.consume("ident", "let");

        let mutable = false;
        if (this.peek()?.type === "ident" && this.peek()?.value === "mut") {
          mutable = true;
          this.consume("ident", "mut");
        }

        const { name, value } = this.parseAssignmentRhs();
        statements.push({ type: "let", name, mutable, value });
      } else {
        // Check for assignment statement (`ident = expr`)
        const tok = this.peek();
        if (
          tok &&
          tok.type === "ident" &&
          this.tokens[this.pos + 1]?.value === "="
        ) {
          const name = tok.value;
          this.consume("ident");
          this.consume("op", "=");
          const value = this.parseExpression();

          if (this.peek().value === ";") {
            this.consume("op", ";");
          }

          statements.push({ type: "assign", name, value });
        } else {
          // Parse expression — check if there's a semicolon after it.
          const expr = this.parseExpression();

          if (this.peek()?.value === ";") {
            // Semicolon means intermediate expression for side effects only
            this.consume("op", ";");
            intermediateExprs.push(expr);
          } else {
            // No semicolon — this is the final expression whose value matters.
            // If we already had a lastExpr, it becomes an intermediate one now.
            if (lastExpr !== undefined) {
              intermediateExprs.push(lastExpr);
            }
            lastExpr = expr;
          }
        }
      }
    }

    return { statements, intermediateExprs, lastExpr };
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

    const result = this.parseStatementsAndExpr(() => this.peek().value !== "}");

    this.consume("op", "}");

    return { type: "block", ...result };
  }
}

class Scope {
  constructor(parent) {
    this.parent = parent || null;
    this.bindings = {}; // name -> value
    this.mutableFlags = {}; // name -> boolean
  }

  lookup(name) {
    if (name in this.bindings) return this.bindings[name];
    if (this.parent) return this.parent.lookup(name);
    throw new Error(`Undefined variable: ${name}`);
  }

  isMutable(name) {
    if (name in this.mutableFlags) return this.mutableFlags[name] === true;
    if (this.parent) return this.parent.isMutable(name);
    return false;
  }

  define(name, value, mutable = false) {
    this.bindings[name] = value;
    this.mutableFlags[name] = mutable;
  }

  assign(name, newValue) {
    // Check variable exists somewhere in the chain
    if (!this.hasBinding(name)) {
      throw new Error(`Undefined variable: ${name}`);
    }
    // Check mutability
    if (!this.isMutable(name)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    // Find the scope where it was defined and update there
    this.findAndAssign(name, newValue);
  }

  hasBinding(name) {
    if (name in this.bindings) return true;
    if (this.parent) return this.parent.hasBinding(name);
    return false;
  }

  findAndAssign(name, value) {
    // Walk up to the outermost scope that defines it, then assign there
    let current = null;
    let scope = this;
    while (scope && name in scope.bindings) {
      current = scope;
      scope = scope.parent;
    }
    if (!current) throw new Error(`Cannot find binding for: ${name}`);
    current.bindings[name] = value;
  }
}

class Evaluator {
  constructor(scope) {
    this.scope = scope || new Scope();
  }

  evaluate(node) {
    switch (node.type) {
      case "literal":
        return node.value;
      case "variable":
        return this.scope.lookup(node.name);
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
    const childScope = new Scope(this.scope);
    const blockEvaluator = new Evaluator(childScope);

    for (const stmt of node.statements) {
      if (stmt.type === "let") {
        const value = this.evaluate(stmt.value);
        childScope.define(stmt.name, value, stmt.mutable || false);
      } else if (stmt.type === "assign") {
        const newValue = blockEvaluator.evaluate(stmt.value);
        childScope.assign(stmt.name, newValue);
      }
    }

    // Execute intermediate expressions for side effects.
    // If an intermediate expression is itself a block, evaluate it in the same scope
    // (not a nested one) so mutations propagate correctly to outer scopes.
    for (const expr of node.intermediateExprs || []) {
      if (expr.type === "block") {
        this.evaluateBlockInScope(expr, childScope);
      } else {
        blockEvaluator.evaluate(expr);
      }
    }

    // Evaluate the last expression (if any) in a scope with let bindings
    if (node.lastExpr !== undefined && node.lastExpr !== null) {
      return blockEvaluator.evaluate(node.lastExpr);
    }
  }

  evaluateBlockInScope(node, scope) {
    const evaluator = new Evaluator(scope);

    for (const stmt of node.statements) {
      if (stmt.type === "let") {
        const value = evaluator.evaluate(stmt.value);
        scope.define(stmt.name, value, stmt.mutable || false);
      } else if (stmt.type === "assign") {
        const newValue = evaluator.evaluate(stmt.value);
        scope.assign(stmt.name, newValue);
      }
    }

    for (const expr of node.intermediateExprs || []) {
      if (expr.type === "block") {
        this.evaluateBlockInScope(expr, scope);
      } else {
        evaluator.evaluate(expr);
      }
    }

    if (node.lastExpr !== undefined && node.lastExpr !== null) {
      return evaluator.evaluate(node.lastExpr);
    }
  }
}

export function executeTuff(source) {
  if (source.trim() === "") return 0;

  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  const ast = parser.parse();

  const evaluator = new Evaluator(new Scope());
  const result = evaluator.evaluate(ast);

  return typeof result === "number" ? result : Number(result);
}
