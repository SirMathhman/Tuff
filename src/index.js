const { tokenize } = require("./tokenizer");

let tokens, pos, refTargetVars;

function compileTuffToJS(source) {
  if (source.trim() === "") return "return 0;";

  tokens = tokenize(source);
  pos = 0;

  // Parse a sequence of statements separated by ;
  const stmts = [];
  while (pos < tokens.length) {
    stmts.push(parseStatement());
  }

  // Collect declared variable names and mutability for validation
  function collectVars(stmts, declSet, mutSet) {
    for (const s of stmts) {
      if (s.type === "let") {
        declSet.add(s.name);
        if (s.mutable) mutSet.add(s.name);
      }
      if (s.type === "block") collectVars(s.stmts, declSet, mutSet);
    }
  }
  const declaredVars = new Set();
  const mutableVars = new Set();
  collectVars(stmts, declaredVars, mutableVars);

  // Validate all varrefs are declared and assignments only to mut vars
  function validateEach(stmts, declSet, mutSet) {
    for (const s of stmts) {
      if (s.type === "block") {
        const childDecl = new Set(declSet);
        const childMut = new Set(mutSet);
        collectVars(s.stmts, childDecl, childMut);
        validateEach(s.stmts, childDecl, childMut);
      } else if (s.type === "if_stmt") {
        const thenScope = { decl: new Set(declSet), mut: new Set(mutSet) };
        validateEach(s.thenBranch, thenScope.decl, thenScope.mut);
        if (s.elseBranch) {
          const elseScope = { decl: new Set(declSet), mut: new Set(mutSet) };
          validateEach(s.elseBranch, elseScope.decl, elseScope.mut);
        }
      } else if (s.type === "while_stmt") {
        const childDecl = new Set(declSet);
        const childMut = new Set(mutSet);
        validateEach(s.body, childDecl, childMut);
      } else if (s.type === "for_stmt") {
        // Validate range expressions against parent scope
        validateRefs(s.from, declSet, mutSet);
        validateRefs(s.to, declSet, mutSet);
        // The loop variable is implicitly declared and mutable within the for scope
        const childDecl = new Set(declSet);
        const childMut = new Set(mutSet);
        childDecl.add(s.variable);
        childMut.add(s.variable);
        validateEach(s.body, childDecl, childMut);
      } else {
        validateRefs(s, declSet, mutSet);
      }
    }
  }

  function validateStmts(stmts, declSet, mutSet) {
    validateEach(stmts, declSet, mutSet);
  }

  validateStmts(stmts, declaredVars, mutableVars);

  // Collect variables that are referenced with & — these need unique slot objects for identity tracking
  refTargetVars = new Set();
  function collectRefTargets(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ref" && node.expr?.type === "varref") {
      refTargetVars.add(node.expr.name);
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(collectRefTargets);
      else if (child && typeof child === "object") collectRefTargets(child);
    }
  }
  stmts.forEach(collectRefTargets);

  // Emit JS for each statement, last one is returned
  function emitTop(stmts) {
    let js = "";
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      if (i === stmts.length - 1 && s.type !== "block") {
        // Last non-block statement: return its value
        js += `return(${emitExpr(s)});\n`;
      } else {
        js += `${emitStmt(s)};\n`;
      }
    }
    return js;
  }
  let js = "let ri=0;\n" + emitTop(stmts);
  return js;
}

function validateRefs(node, declaredVars, mutableVars) {
  if (!node || typeof node !== "object") return;
  if (node.type === "varref" && !declaredVars.has(node.name)) {
    throw new Error(`Undefined variable: ${node.name}`);
  }
  // Assignment statement: target must be a declared mutable var
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

function parseStatement() {
  if (pos >= tokens.length) throw new Error("Unexpected end");
  const token = tokens[pos];

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
    const from = parseExpr();
    if (pos >= tokens.length || tokens[pos].type !== "range") {
      throw new Error("Expected '..' in for loop range");
    }
    pos++; // skip '..'
    const to = parseExpr();

    if (pos >= tokens.length || tokens[pos].type !== "paren_close")
      throw new Error("Expected ')' after for loop range");
    pos++; // skip ')'

    const body = [parseStatement()];
    return { type: "for_stmt", variable, from, to, body };
  }

  // while (cond) stmt;
  if (token.type === "keyword" && token.value === "while") {
    pos++; // skip 'while'
    if (pos >= tokens.length || tokens[pos].type !== "paren_open")
      throw new Error("Expected '(' after 'while'");
    pos++; // skip '('
    const cond = parseExpr();
    if (pos >= tokens.length || tokens[pos].type !== "paren_close")
      throw new Error("Expected ')' after while condition");
    pos++; // skip ')'

    const body = [parseStatement()];
    return { type: "while_stmt", cond, body };
  }

  // if (expr) stmt; else stmt;
  if (token.type === "keyword" && token.value === "if") {
    pos++; // skip 'if'
    if (pos >= tokens.length || tokens[pos].type !== "paren_open")
      throw new Error("Expected '(' after 'if'");
    pos++; // skip '('
    const cond = parseExpr();
    if (pos >= tokens.length || tokens[pos].type !== "paren_close")
      throw new Error("Expected ')' after condition");
    pos++; // skip ')'

    const thenBranch = [parseStatement()];

    let elseBranch;
    if (
      pos < tokens.length &&
      tokens[pos].type === "keyword" &&
      tokens[pos].value === "else"
    ) {
      pos++; // skip 'else'
      elseBranch = [parseStatement()];
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

    const exprAst = parseExpr();
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
    let target = parseIndexAccess({ type: "varref", name });
    if (pos < tokens.length && tokens[pos].type === "assign_add") {
      pos++; // skip '+='
      const exprAst = parseExpr();
      return { type: "compound_assign_stmt", target, op: "+=", value: exprAst };
    }
    if (pos < tokens.length && tokens[pos].type === "assign") {
      pos++; // skip '='
      const exprAst = parseExpr();
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
    const exprAst = parseExpr();
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
    const exprAst = parseExpr();
    return { type: "assign_stmt", name, value: exprAst };
  }

  // *expr = value ; (deref assignment statement) or bare *expr expression
  if (token.type === "op" && token.value === "*") {
    pos++; // skip '*'
    const target = parsePrimary();
    if (pos < tokens.length && tokens[pos].type === "assign") {
      pos++; // skip '='
      const exprAst = parseExpr();
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
      blockStmts.push(parseStatement());
    }
    if (pos >= tokens.length) throw new Error("Expected '}'");
    pos++; // skip '}'
    return { type: "block", stmts: blockStmts };
  }

  // Bare expression (also the last statement)
  return parseExpr();
}

function parseExpr() {
  let left = parseComparison();
  while (pos < tokens.length && tokens[pos].type === "semi") {
    pos++; // skip ';'
  }
  return left;
}

function parseComparison() {
  let left = parseAddSub();
  while (pos < tokens.length && tokens[pos].type === "cmp") {
    const opVal = tokens[pos++].value;
    const right = parseAddSub();
    left = { type: "binop", op: opVal, left, right };
  }
  return left;
}

function parseAddSub() {
  let left = parsePrimary();
  while (
    pos < tokens.length &&
    tokens[pos].type === "op" &&
    "+-".includes(tokens[pos].value)
  ) {
    const opVal = tokens[pos++].value;
    const right = parsePrimary();
    left = { type: "binop", op: opVal, left, right };
  }
  return left;
}

function parsePrimary() {
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
    const inner = parsePrimary();
    return { type: "ref", expr: inner };
  }

  // '*' dereference operator — pass-through
  if (token.type === "op" && token.value === "*") {
    pos++;
    const inner = parsePrimary();
    return { type: "deref", expr: inner };
  }

  // Function call: read()
  if (token.type === "call") {
    pos++;
    return parseIndexAccess({ type: "call", name: token.name });
  }

  // Variable reference or bare identifier, possibly followed by [index]
  if (token.type === "identifier") {
    pos++;
    return parseIndexAccess({ type: "varref", name: token.value });
  }

  // Numeric literal
  if (token.type === "number") {
    pos++;
    return { type: "numlit", value: token.value };
  }

  // Array literal: [ expr ; expr ]
  if (token.type === "bracket_open") {
    pos++; // skip '['
    const elements = [];
    while (pos < tokens.length && tokens[pos].type !== "bracket_close") {
      elements.push(parseExpr());
    }
    if (pos >= tokens.length) throw new Error("Expected ']'");
    pos++; // skip ']'
    return { type: "array", elements };
  }

  throw new Error(`Unsupported token at ${pos}: ${JSON.stringify(token)}`);
}

function parseIndexAccess(base) {
  while (pos < tokens.length && tokens[pos].type === "bracket_open") {
    pos++; // skip '['
    const index = parseExpr();
    if (pos >= tokens.length || tokens[pos].type !== "bracket_close")
      throw new Error("Expected ']'");
    pos++; // skip ']'
    base = { type: "index", target: base, index };
  }
  return base;
}

function emitExpr(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "call" && node.name === "read") {
    return `parseInt(stdIn.split(/\\s+/)[ri++],10)`;
  }
  if (node.type === "call" && node.name === "readBool") {
    return `+(stdIn.split(/\\s+/)[ri++]==="true")`;
  }
  if (node.type === "numlit") {
    return String(node.value);
  }
  if (node.type === "binop") {
    // Coerce comparison results to numbers (+true => 1, +false => 0)
    const isCmp = "+-*/".includes(node.op);
    return isCmp
      ? `${emitExpr(node.left)}${node.op}${emitExpr(node.right)}`
      : `+(${emitExpr(node.left)}${node.op}${emitExpr(node.right)})`;
  }
  if (node.type === "varref") {
    // If this var is a ref target, unwrap .v from its slot object
    return refTargetVars.has(node.name) ? `${node.name}.v` : node.name;
  }
  if (node.type === "array") {
    const elems = node.elements.map(emitExpr).join(",");
    return `[${elems}]`;
  }
  if (node.type === "index") {
    return `${emitExpr(node.target)}[${emitExpr(node.index)}]`;
  }
  // &varref — emit the whole slot object for identity comparison via JS ===
  if (node.type === "ref" && node.expr?.type === "varref") {
    return node.expr.name;
  }
  // *expr — dereference: unwrap .v from a ref/slot
  if (node.type === "deref") {
    const inner = emitExpr(node.expr);
    return `${inner}.v`;
  }
  throw new Error(`Unsupported AST node: ${JSON.stringify(node)}`);
}

function emitStmt(stmt) {
  // let/var declaration — wrap in slot {v: value} if this var is a ref target, unless init is already a &expr (which emits a slot directly)
  if (stmt.type === "let") {
    const keyword = stmt.mutable ? "var" : "const";
    const initVal = emitExpr(stmt.init);
    const isRefInit = stmt.init?.type === "ref";
    return refTargetVars.has(stmt.name) && !isRefInit
      ? `${keyword} ${stmt.name}={v:${initVal}}`
      : `${keyword} ${stmt.name}=${initVal}`;
  }
  // x += expr compound assignment statement
  if (stmt.type === "compound_assign_stmt") {
    const lhs = stmt.target ? emitExpr(stmt.target) : stmt.name;
    return `${lhs}${stmt.op}${emitExpr(stmt.value)}`;
  }
  // array[idx] = expr index assignment statement
  if (stmt.type === "index_assign_stmt") {
    return `${emitExpr(stmt.target)}=${emitExpr(stmt.value)}`;
  }
  // *target = value deref assignment statement
  if (stmt.type === "deref_assign_stmt") {
    const targetPath = emitExpr({ type: "varref", name: stmt.target?.name });
    return `${targetPath}.v=${emitExpr(stmt.value)}`;
  }
  // x = expr assignment statement
  if (stmt.type === "assign_stmt") {
    return `${stmt.name}=${emitExpr(stmt.value)}`;
  }
  // { ... } block statement
  if (stmt.type === "block") {
    let blockJs = "{\n";
    for (const s of stmt.stmts) {
      blockJs += `${emitStmt(s)};\n`;
    }
    return blockJs + "}";
  } // if (...) { ... } else { ... }
  if (stmt.type === "if_stmt") {
    let js = `if(${emitExpr(stmt.cond)}){\n`;
    for (const s of stmt.thenBranch) {
      js += `${emitStmt(s)};\n`;
    }
    js += `}`;
    if (stmt.elseBranch) {
      js += ` else {\n`;
      for (const s of stmt.elseBranch) {
        js += `${emitStmt(s)};\n`;
      }
      js += ` }`;
    }
    return js;
  }
  // while (...) { ... }
  if (stmt.type === "while_stmt") {
    let js = `while(${emitExpr(stmt.cond)}){\n`;
    for (const s of stmt.body) {
      js += `${emitStmt(s)};\n`;
    }
    js += `}`;
    return js;
  }
  // for (i in start..end) { ... }
  if (stmt.type === "for_stmt") {
    let js = `var ${stmt.variable}=${emitExpr(stmt.from)};`;
    js += `while(${stmt.variable}<${emitExpr(stmt.to)}){\n`;
    for (const s of stmt.body) {
      js += `${emitStmt(s)};\n`;
    }
    js += `${stmt.variable}+=1;`;
    js += `}`;
    return js;
  } // Bare expression statement
  return emitExpr(stmt);
}

module.exports = { compileTuffToJS };
