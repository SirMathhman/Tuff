// Statement parsing + validation (let, if/else, while, for, fn_def, out_*, extern_, assignments).
import state from "./parser_state";
import { parseExpr, parsePrimary, parseIndexAccess } from "./expr_parser";

export function validateRefs(node, declaredVars, mutableVars) {
  if (!node || typeof node !== "object") return;
  // Function definition body references are validated against parent scope + params
  if (node.type === "fn_def") {
    const fnDeclared = new Set(declaredVars);
    const fnMutable = new Set(mutableVars);
    for (const p of node.params || []) {
      fnDeclared.add(p);
      fnMutable.add(p);
    }
    validateRefs(node.body, fnDeclared, fnMutable);
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
    validateRefs(node.value, declaredVars, mutableVars);
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
      validateRefs(node.target, declaredVars, mutableVars);
    }
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Deref assignment statement (*expr = value)
  if (node.type === "deref_assign_stmt") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Index assignment statement (array[idx] = expr)
  if (node.type === "index_assign_stmt") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.value, declaredVars, mutableVars);
  }
  // Array literal: validate each element
  if (node.type === "array") {
    for (const elem of node.elements) {
      validateRefs(elem, declaredVars, mutableVars);
    }
  }
  // Index access: validate target and index expressions
  if (node.type === "index") {
    validateRefs(node.target, declaredVars, mutableVars);
    validateRefs(node.index, declaredVars, mutableVars);
  }
  if (node.left) validateRefs(node.left, declaredVars, mutableVars);
  if (node.right) validateRefs(node.right, declaredVars, mutableVars);
  if (node.init) validateRefs(node.init, declaredVars, mutableVars);
}

// Shared helper: consume optional 'mut' keyword, returns true if present
function consumeMut() {
  const mutable =
    state.pos < state.tokens.length &&
    state.tokens[state.pos].type === "keyword" &&
    state.tokens[state.pos].value === "mut";
  if (mutable) state.pos++;
  return mutable;
}

// Shared helper: parse comma-separated params inside parens
function parseParams() {
  const params = [];
  while (state.pos < state.tokens.length && state.tokens[state.pos].type !== "paren_close") {
    if (state.tokens[state.pos].type === "identifier") {
      params.push(state.tokens[state.pos++].value);
    } else {
      throw new Error("Expected parameter name in function definition");
    }
    // Skip optional comma
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "comma") state.pos++;
  }
  return params;
}

export function parseStatement() {
  while (state.pos < state.tokens.length && state.tokens[state.pos].type === "semi") state.pos++; // skip trailing ';' from previous statement
  if (state.pos >= state.tokens.length) throw new Error("Unexpected end");
  const token = state.tokens[state.pos];

  // fn name(params) => expr ; (function definition)
  if (token.type === "keyword" && token.value === "fn") {
    state.pos++; // skip 'fn'

    // Function name is an identifier
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
      throw new Error("Expected function name after 'fn'");
    }
    const name = state.tokens[state.pos++].value;

    // Expect '(' for params list
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_open") {
      throw new Error("Expected '(' after function name");
    }
    state.pos++; // skip '('

    const params = parseParams();

    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close") {
      throw new Error("Expected ')' after function params");
    }
    state.pos++; // skip ')'

    // Expect fat arrow '=>'
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "fat_arrow") {
      throw new Error("Expected '=>' after function name");
    }
    state.pos++; // skip '=>'

    const body = parseExpr();
    return { type: "fn_def", name, params, body };
  }

  // for (i in start..end) stmt;
  if (token.type === "keyword" && token.value === "for") {
    state.pos++; // skip 'for'
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_open")
      throw new Error("Expected '(' after 'for'");
    state.pos++; // skip '('

    // Expect identifier for loop variable
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
      throw new Error("Expected identifier in for loop");
    }
    const variable = state.tokens[state.pos++].value;

    // Expect 'in' keyword
    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "keyword" ||
      state.tokens[state.pos].value !== "in"
    ) {
      throw new Error("Expected 'in' in for loop");
    }
    state.pos++; // skip 'in'

    // Parse range: expr .. expr
    const from = parseExpr();
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "range") {
      throw new Error("Expected '..' in for loop range");
    }
    state.pos++; // skip '..'
    const to = parseExpr();

    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close")
      throw new Error("Expected ')' after for loop range");
    state.pos++; // skip ')'

    const body = [parseStatement()];
    return { type: "for_stmt", variable, from, to, body };
  }

  // while (cond) stmt;
  if (token.type === "keyword" && token.value === "while") {
    state.pos++; // skip 'while'
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_open")
      throw new Error("Expected '(' after 'while'");
    state.pos++; // skip '('
    const cond = parseExpr();
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close")
      throw new Error("Expected ')' after while condition");
    state.pos++; // skip ')'

    const body = [parseStatement()];
    return { type: "while_stmt", cond, body };
  }

  // if (expr) stmt; else stmt;
  if (token.type === "keyword" && token.value === "if") {
    state.pos++; // skip 'if'
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_open")
      throw new Error("Expected '(' after 'if'");
    state.pos++; // skip '('
    const cond = parseExpr();
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close")
      throw new Error("Expected ')' after condition");
    state.pos++; // skip ')'

    const thenBranch = [parseStatement()];

    let elseBranch;
    if (
      state.pos < state.tokens.length &&
      state.tokens[state.pos].type === "keyword" &&
      state.tokens[state.pos].value === "else"
    ) {
      state.pos++; // skip 'else'
      elseBranch = [parseStatement()];
    }

    return { type: "if_stmt", cond, thenBranch, elseBranch };
  }

  // extern let { x, y } = moduleName ; — import from raw JS module
  if (token.type === "keyword" && token.value === "extern") {
    state.pos++; // skip 'extern'

    if (
      state.pos >= state.tokens.length ||
      state.tokens[state.pos].type !== "keyword" ||
      state.tokens[state.pos].value !== "let"
    )
      throw new Error("Expected 'let' after 'extern'");
    state.pos++; // skip 'let'

    // Expect destructuring pattern: { x, y }
    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "brace_open") {
      throw new Error("Expected '{' in extern import pattern");
    }
    const fields = parseDestructuringPattern();

    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "assign")
      throw new Error("Expected '=' after extern import pattern");
    state.pos++; // skip '='

    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
      throw new Error("Expected module name in extern import");
    }
    const moduleName = state.tokens[state.pos++].value;

    return { type: "extern_let", fields, moduleName };
  }

  // out let x = expr ; or out fn name(params) => expr ; (export declarations)
  if (token.type === "keyword" && token.value === "out") {
    state.pos++; // skip 'out'

    if (state.pos >= state.tokens.length)
      throw new Error("Expected 'let' or 'fn' after 'out'");

    // out fn name(params) => expr ;
    if (state.tokens[state.pos].type === "keyword" && state.tokens[state.pos].value === "fn") {
      state.pos++; // skip 'fn'
      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
        throw new Error("Expected function name after 'out fn'");
      }
      const name = state.tokens[state.pos++].value;

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_open") {
        throw new Error("Expected '(' after exported function name");
      }
      state.pos++; // skip '('

      const params = parseParams();

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "paren_close") {
        throw new Error("Expected ')' after exported function params");
      }
      state.pos++; // skip ')'

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "fat_arrow") {
        throw new Error("Expected '=>' in exported function definition");
      }
      state.pos++; // skip '=>'

      const body = parseExpr();
      return { type: "out_fn", name, params, body };
    }

    // out let x = expr ; or out mut x = expr ;
    if (state.tokens[state.pos].type === "keyword" && state.tokens[state.pos].value === "let") {
      state.pos++; // skip 'let'

      const mutable = consumeMut();

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier") {
        throw new Error("Expected identifier after 'out let'");
      }
      const name = state.tokens[state.pos++].value;

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "assign") {
        throw new Error("Expected '=' after exported variable name");
      }
      state.pos++; // skip '='

      const exprAst = parseExpr();
      return { type: "out_let", name, mutable, init: exprAst };
    }

    throw new Error("Expected 'let' or 'fn' after 'out'");
  }

  // let x = expr ; or let mut x = expr ;
  if (token.type === "keyword" && token.value === "let") {
    state.pos++; // skip 'let'

    const mutable = consumeMut();

    // Check for object destructuring pattern: let { x, y } = expr
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "brace_open") {
      const fields = parseDestructuringPattern();

      if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "assign")
        throw new Error("Expected '=' after destructuring pattern");
      state.pos++; // skip '='

      const exprAst = parseExpr();
      return { type: "let", mutable, init: exprAst, fields };
    }

    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "identifier")
      throw new Error("Expected identifier after 'let'");
    const name = state.tokens[state.pos++].value;

    if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "assign")
      throw new Error("Expected '=' after variable name");
    state.pos++; // skip '='

    const exprAst = parseExpr();
    return { type: "let", name, mutable, init: exprAst };
  }

  // array[idx] += expr ; (compound index assignment statement) or bare array access expression
  if (
    token.type === "identifier" &&
    state.pos + 1 < state.tokens.length &&
    state.tokens[state.pos + 1].type === "bracket_open"
  ) {
    const name = state.tokens[state.pos++].value;
    // Parse index access chain
    let target = parseIndexAccess({ type: "varref", name });
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "assign_add") {
      state.pos++; // skip '+='
      const exprAst = parseExpr();
      return {
        type: "compound_assign_stmt",
        target,
        op: "+=",
        value: exprAst,
      };
    }
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "assign") {
      state.pos++; // skip '='
      const exprAst = parseExpr();
      return { type: "index_assign_stmt", target, value: exprAst };
    }
    // Bare array access expression (e.g., array[0])
    return target;
  }

  // x += expr ; (compound assignment statement)
  if (
    token.type === "identifier" &&
    state.pos + 1 < state.tokens.length &&
    state.tokens[state.pos + 1].type === "assign_add"
  ) {
    const name = state.tokens[state.pos++].value;
    state.pos++; // skip '+='
    const exprAst = parseExpr();
    return { type: "compound_assign_stmt", name, op: "+=", value: exprAst };
  }

  // x = expr ; (assignment statement)
  if (
    token.type === "identifier" &&
    state.pos + 1 < state.tokens.length &&
    state.tokens[state.pos + 1].type === "assign"
  ) {
    const name = state.tokens[state.pos++].value;
    state.pos++; // skip '='
    const exprAst = parseExpr();
    return { type: "assign_stmt", name, value: exprAst };
  }

  // *expr = value ; (deref assignment statement) or bare *expr expression
  if (token.type === "op" && token.value === "*") {
    state.pos++; // skip '*'
    const target = parsePrimary();
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "assign") {
      state.pos++; // skip '='
      const exprAst = parseExpr();
      return { type: "deref_assign_stmt", target, value: exprAst };
    }
    // Bare deref expression (e.g., *y)
    return { type: "deref", expr: target };
  }

  // { stmt; stmt; ... } (block statement)
  if (token.type === "brace_open") {
    state.pos++; // skip '{'
    const blockStmts = [];
    while (state.pos < state.tokens.length && state.tokens[state.pos].type !== "brace_close") {
      blockStmts.push(parseStatement());
    }
    if (state.pos >= state.tokens.length) throw new Error("Expected '}'");
    state.pos++; // skip '}'
    return { type: "block", stmts: blockStmts };
  }

  // Bare expression (also the last statement)
  return parseExpr();
}

export function parseDestructuringPattern() {
  state.pos++; // skip '{'
  const fields = [];
  while (state.pos < state.tokens.length && state.tokens[state.pos].type !== "brace_close") {
    if (state.tokens[state.pos].type !== "identifier") {
      throw new Error("Expected identifier in destructuring pattern");
    }
    fields.push(state.tokens[state.pos++].value);
    // Skip optional comma separator
    if (state.pos < state.tokens.length && state.tokens[state.pos].type === "comma") state.pos++;
  }
  if (state.pos >= state.tokens.length || state.tokens[state.pos].type !== "brace_close") {
    throw new Error("Expected '}' to close destructuring pattern");
  }
  state.pos++; // skip '}'
  return fields;
}
