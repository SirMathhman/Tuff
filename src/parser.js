// Module-level state shared with emitter via compileTuffToJS
let tokens, pos;

module.exports = {
  get tokens() {
    return tokens;
  },
  set tokens(v) {
    tokens = v;
  },
  get pos() {
    return pos;
  },
  set pos(v) {
    pos = v;
  },

  validateRefs(node, declaredVars, mutableVars) {
    if (!node || typeof node !== "object") return;
    // Function definition body references are validated against parent scope
    if (node.type === "fn_def") {
      this.validateRefs(node.body, declaredVars, mutableVars);
      return;
    }
    if (node.type === "varref" && !declaredVars.has(node.name)) {
      throw new Error(`Undefined variable: ${node.name}`);
    } // Assignment statement: target must be a declared mutable var
    if (node.type === "assign_stmt") {
      if (!mutableVars.has(node.name)) {
        throw new Error(
          `Cannot reassign immutable or undeclared variable: ${node.name}`,
        );
      }
      this.validateRefs(node.value, declaredVars, mutableVars);
    }
    // Compound assignment statement (x += expr): target must be a declared mutable var
    if (node.type === "compound_assign_stmt") {
      if (node.name) {
        if (!mutableVars.has(node.name)) {
          throw new Error(
            `Cannot reassign immutable or undeclared variable: ${node.name}`,
          );
        }
      } else if (node.target) {
        this.validateRefs(node.target, declaredVars, mutableVars);
      }
      this.validateRefs(node.value, declaredVars, mutableVars);
    }
    // Deref assignment statement (*expr = value)
    if (node.type === "deref_assign_stmt") {
      this.validateRefs(node.target, declaredVars, mutableVars);
      this.validateRefs(node.value, declaredVars, mutableVars);
    }
    // Index assignment statement (array[idx] = expr)
    if (node.type === "index_assign_stmt") {
      this.validateRefs(node.target, declaredVars, mutableVars);
      this.validateRefs(node.value, declaredVars, mutableVars);
    }
    // Array literal: validate each element
    if (node.type === "array") {
      for (const elem of node.elements) {
        this.validateRefs(elem, declaredVars, mutableVars);
      }
    }
    // Index access: validate target and index expressions
    if (node.type === "index") {
      this.validateRefs(node.target, declaredVars, mutableVars);
      this.validateRefs(node.index, declaredVars, mutableVars);
    }
    if (node.left) this.validateRefs(node.left, declaredVars, mutableVars);
    if (node.right) this.validateRefs(node.right, declaredVars, mutableVars);
    if (node.init) this.validateRefs(node.init, declaredVars, mutableVars);
  },

  parseStatement() {
    if (pos >= tokens.length) throw new Error("Unexpected end");
    const token = tokens[pos];

    // fn name() => expr ; (function definition)
    if (token.type === "keyword" && token.value === "fn") {
      pos++; // skip 'fn'

      // Function name is in a call token since tokenizer greedily matches identifier()
      if (pos >= tokens.length || tokens[pos].type !== "call") {
        throw new Error("Expected function name after 'fn'");
      }
      const name = tokens[pos++].name;

      // Expect fat arrow '=>'
      if (pos >= tokens.length || tokens[pos].type !== "fat_arrow") {
        throw new Error("Expected '=>' after function name");
      }
      pos++; // skip '=>'

      const body = this.parseExpr();
      return { type: "fn_def", name, body };
    }

    // for (i in start..end) stmt;
    if (token.type === "keyword" && token.value === "for") {
      pos++; // skip 'for'
      if (pos >= tokens.length || tokens[pos].type !== "paren_open")
        throw new Error("Expected '(' after 'for'");
      pos++; // skip '('

      // Expect identifier for loop variable
      if (pos >= tokens.length || tokens[pos].type !== "identifier") {
        throw new Error("Expected identifier in for loop");
      }
      const variable = tokens[pos++].value;

      // Expect 'in' keyword
      if (
        pos >= tokens.length ||
        tokens[pos].type !== "keyword" ||
        tokens[pos].value !== "in"
      ) {
        throw new Error("Expected 'in' in for loop");
      }
      pos++; // skip 'in'

      // Parse range: expr .. expr
      const from = this.parseExpr();
      if (pos >= tokens.length || tokens[pos].type !== "range") {
        throw new Error("Expected '..' in for loop range");
      }
      pos++; // skip '..'
      const to = this.parseExpr();

      if (pos >= tokens.length || tokens[pos].type !== "paren_close")
        throw new Error("Expected ')' after for loop range");
      pos++; // skip ')'

      const body = [this.parseStatement()];
      return { type: "for_stmt", variable, from, to, body };
    }

    // while (cond) stmt;
    if (token.type === "keyword" && token.value === "while") {
      pos++; // skip 'while'
      if (pos >= tokens.length || tokens[pos].type !== "paren_open")
        throw new Error("Expected '(' after 'while'");
      pos++; // skip '('
      const cond = this.parseExpr();
      if (pos >= tokens.length || tokens[pos].type !== "paren_close")
        throw new Error("Expected ')' after while condition");
      pos++; // skip ')'

      const body = [this.parseStatement()];
      return { type: "while_stmt", cond, body };
    }

    // if (expr) stmt; else stmt;
    if (token.type === "keyword" && token.value === "if") {
      pos++; // skip 'if'
      if (pos >= tokens.length || tokens[pos].type !== "paren_open")
        throw new Error("Expected '(' after 'if'");
      pos++; // skip '('
      const cond = this.parseExpr();
      if (pos >= tokens.length || tokens[pos].type !== "paren_close")
        throw new Error("Expected ')' after condition");
      pos++; // skip ')'

      const thenBranch = [this.parseStatement()];

      let elseBranch;
      if (
        pos < tokens.length &&
        tokens[pos].type === "keyword" &&
        tokens[pos].value === "else"
      ) {
        pos++; // skip 'else'
        elseBranch = [this.parseStatement()];
      }

      return { type: "if_stmt", cond, thenBranch, elseBranch };
    }

    // let x = expr ; or let mut x = expr ;
    if (token.type === "keyword" && token.value === "let") {
      pos++; // skip 'let'

      // Optionally consume 'mut' keyword
      const mutable =
        pos < tokens.length &&
        tokens[pos].type === "keyword" &&
        tokens[pos].value === "mut";
      if (mutable) pos++;

      if (pos >= tokens.length || tokens[pos].type !== "identifier")
        throw new Error("Expected identifier after 'let'");
      const name = tokens[pos++].value;

      if (pos >= tokens.length || tokens[pos].type !== "assign")
        throw new Error("Expected '=' after variable name");
      pos++; // skip '='

      const exprAst = this.parseExpr();
      return { type: "let", name, mutable, init: exprAst };
    }

    // array[idx] += expr ; (compound index assignment statement) or bare array access expression
    if (
      token.type === "identifier" &&
      pos + 1 < tokens.length &&
      tokens[pos + 1].type === "bracket_open"
    ) {
      const name = tokens[pos++].value;
      // Parse index access chain
      let target = this.parseIndexAccess({ type: "varref", name });
      if (pos < tokens.length && tokens[pos].type === "assign_add") {
        pos++; // skip '+='
        const exprAst = this.parseExpr();
        return {
          type: "compound_assign_stmt",
          target,
          op: "+=",
          value: exprAst,
        };
      }
      if (pos < tokens.length && tokens[pos].type === "assign") {
        pos++; // skip '='
        const exprAst = this.parseExpr();
        return { type: "index_assign_stmt", target, value: exprAst };
      }
      // Bare array access expression (e.g., array[0])
      return target;
    }

    // x += expr ; (compound assignment statement)
    if (
      token.type === "identifier" &&
      pos + 1 < tokens.length &&
      tokens[pos + 1].type === "assign_add"
    ) {
      const name = tokens[pos++].value;
      pos++; // skip '+='
      const exprAst = this.parseExpr();
      return { type: "compound_assign_stmt", name, op: "+=", value: exprAst };
    }

    // x = expr ; (assignment statement)
    if (
      token.type === "identifier" &&
      pos + 1 < tokens.length &&
      tokens[pos + 1].type === "assign"
    ) {
      const name = tokens[pos++].value;
      pos++; // skip '='
      const exprAst = this.parseExpr();
      return { type: "assign_stmt", name, value: exprAst };
    }

    // *expr = value ; (deref assignment statement) or bare *expr expression
    if (token.type === "op" && token.value === "*") {
      pos++; // skip '*'
      const target = this.parsePrimary();
      if (pos < tokens.length && tokens[pos].type === "assign") {
        pos++; // skip '='
        const exprAst = this.parseExpr();
        return { type: "deref_assign_stmt", target, value: exprAst };
      }
      // Bare deref expression (e.g., *y)
      return { type: "deref", expr: target };
    }

    // { stmt; stmt; ... } (block statement)
    if (token.type === "brace_open") {
      pos++; // skip '{'
      const blockStmts = [];
      while (pos < tokens.length && tokens[pos].type !== "brace_close") {
        blockStmts.push(this.parseStatement());
      }
      if (pos >= tokens.length) throw new Error("Expected '}'");
      pos++; // skip '}'
      return { type: "block", stmts: blockStmts };
    }

    // Bare expression (also the last statement)
    return this.parseExpr();
  },

  parseExpr() {
    let left = this.parseComparison();
    while (pos < tokens.length && tokens[pos].type === "semi") {
      pos++; // skip ';'
    }
    return left;
  },

  parseComparison() {
    let left = this.parseAddSub();
    while (pos < tokens.length && tokens[pos].type === "cmp") {
      const opVal = tokens[pos++].value;
      const right = this.parseAddSub();
      left = { type: "binop", op: opVal, left, right };
    }
    return left;
  },

  parseAddSub() {
    let left = this.parsePrimary();
    while (
      pos < tokens.length &&
      tokens[pos].type === "op" &&
      "+-".includes(tokens[pos].value)
    ) {
      const opVal = tokens[pos++].value;
      const right = this.parsePrimary();
      left = { type: "binop", op: opVal, left, right };
    }
    return left;
  },

  parsePrimary() {
    if (pos >= tokens.length) throw new Error("Unexpected end");
    const token = tokens[pos];

    // '&' reference operator — optional 'mut' keyword for &mut syntax
    if (token.type === "ref") {
      pos++;
      // Consume optional 'mut' after '&' (&mut x)
      if (
        pos < tokens.length &&
        tokens[pos].type === "keyword" &&
        tokens[pos].value === "mut"
      ) {
        pos++;
      }
      const inner = this.parsePrimary();
      return { type: "ref", expr: inner };
    }

    // Parenthesized expression: ( expr )
    if (token.type === "paren_open") {
      pos++; // skip '('
      const inner = this.parseExpr();
      if (pos >= tokens.length || tokens[pos].type !== "paren_close")
        throw new Error("Expected ')'");
      pos++; // skip ')'
      return inner;
    }

    // '*' dereference operator — pass-through
    if (token.type === "op" && token.value === "*") {
      pos++;
      const inner = this.parsePrimary();
      return { type: "deref", expr: inner };
    }

    // Function call: read()
    if (token.type === "call") {
      pos++;
      return this.parseIndexAccess({ type: "call", name: token.name });
    }

    // Variable reference or bare identifier, possibly followed by [index]
    if (token.type === "identifier") {
      pos++;
      return this.parseIndexAccess({ type: "varref", name: token.value });
    }

    // Numeric literal
    if (token.type === "number") {
      pos++;
      return { type: "numlit", value: token.value };
    }

    // Array literal: [ expr , expr ] or [ expr ; expr ]
    if (token.type === "bracket_open") {
      pos++; // skip '['
      const elements = [];
      while (pos < tokens.length && tokens[pos].type !== "bracket_close") {
        elements.push(this.parseExpr());
        // Skip optional comma or semicolon separators
        if (
          pos < tokens.length &&
          (tokens[pos].type === "comma" || tokens[pos].type === "semi")
        ) {
          pos++;
        }
      }
      if (pos >= tokens.length) throw new Error("Expected ']'");
      pos++; // skip ']'
      return { type: "array", elements };
    }

    throw new Error(`Unsupported token at ${pos}: ${JSON.stringify(token)}`);
  },

  parseIndexAccess(base) {
    while (pos < tokens.length && tokens[pos].type === "bracket_open") {
      pos++; // skip '['
      const from = this.parseExpr();

      // Check for range slice: [start..end]
      if (pos < tokens.length && tokens[pos].type === "range") {
        pos++; // skip '..'
        const to = this.parseExpr();
        if (pos >= tokens.length || tokens[pos].type !== "bracket_close")
          throw new Error("Expected ']'");
        pos++; // skip ']'
        base = { type: "slice", target: base, from, to };
      } else {
        // Regular index access
        if (pos >= tokens.length || tokens[pos].type !== "bracket_close")
          throw new Error("Expected ']'");
        pos++; // skip ']'
        base = { type: "index", target: base, index: from };
      }
    }
    return base;
  },
};
