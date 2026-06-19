let tokens, pos;

export function compileTuffToJS(source) {
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
  function forEachStmt(stmts, declSet, mutSet, fn) {
    for (const s of stmts) {
      if (s.type === "block") {
        validateBlock(s.stmts, new Set(declSet), new Set(mutSet));
      } else if (s.type === "if_stmt") {
        const childScope = { decl: new Set(declSet), mut: new Set(mutSet) };
        forEachStmt(s.thenBranch, childScope.decl, childScope.mut, fn);
        if (s.elseBranch) {
          const elseScope = { decl: new Set(declSet), mut: new Set(mutSet) };
          forEachStmt(s.elseBranch, elseScope.decl, elseScope.mut, fn);
        }
      } else {
        fn(s);
      }
    }
  }

  function validateStmts(stmts, declSet, mutSet) {
    forEachStmt(stmts, declSet, mutSet, (s) =>
      validateRefs(s, declSet, mutSet),
    );
  }

  function validateBlock(stmts, declSet, mutSet) {
    collectVars(stmts, declSet, mutSet);
    forEachStmt(stmts, declSet, mutSet, (s) =>
      validateRefs(s, declSet, mutSet),
    );
  }

  validateStmts(stmts, declaredVars, mutableVars);
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
  if (node.left) validateRefs(node.left, declaredVars, mutableVars);
  if (node.right) validateRefs(node.right, declaredVars, mutableVars);
  if (node.init) validateRefs(node.init, declaredVars, mutableVars);
}

function parseStatement() {
  if (pos >= tokens.length) throw new Error("Unexpected end");
  const token = tokens[pos];

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
  let left = parseAddSub();
  while (pos < tokens.length && tokens[pos].type === "semi") {
    pos++; // skip ';'
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

  // Function call: read()
  if (token.type === "call") {
    pos++;
    return { type: "call", name: token.name };
  }

  // Variable reference or bare identifier
  if (token.type === "identifier") {
    pos++;
    return { type: "varref", name: token.value };
  }

  // Numeric literal
  if (token.type === "number") {
    pos++;
    return { type: "numlit", value: token.value };
  }

  throw new Error(`Unsupported token at ${pos}: ${JSON.stringify(token)}`);
}

function emitExpr(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "call" && node.name === "read") {
    return `parseInt(stdIn.split(/\\s+/)[ri++],10)`;
  }
  if (node.type === "call" && node.name === "readBool") {
    return `+(stdIn.split(/\\s+/)[ri++]===\"true\")`;
  }
  if (node.type === "numlit") {
    return String(node.value);
  }
  if (node.type === "binop") {
    return `${emitExpr(node.left)}${node.op}${emitExpr(node.right)}`;
  }
  if (node.type === "varref") {
    return node.name;
  }
  throw new Error(`Unsupported AST node: ${JSON.stringify(node)}`);
}

function emitStmt(stmt) {
  // let/var declaration
  if (stmt.type === "let") {
    const keyword = stmt.mutable ? "var" : "const";
    return `${keyword} ${stmt.name}=${emitExpr(stmt.init)}`;
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
  } // Bare expression statement
  return emitExpr(stmt);
}

function tokenize(source) {
  const result = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }

    // Match operators like +, -, *, /
    if ("+-*/".includes(source[i])) {
      result.push({ type: "op", value: source[i] });
      i++;
      continue;
    }

    // Match '=' assignment operator
    if (source[i] === "=") {
      result.push({ type: "assign" });
      i++;
      continue;
    }

    // Match ';' statement separator
    if (source[i] === ";") {
      result.push({ type: "semi" });
      i++;
      continue;
    }

    // Match '(' paren open
    if (source[i] === "(") {
      result.push({ type: "paren_open" });
      i++;
      continue;
    }

    // Match ')' paren close
    if (source[i] === ")") {
      result.push({ type: "paren_close" });
      i++;
      continue;
    }

    // Match '{' block open
    if (source[i] === "{") {
      result.push({ type: "brace_open" });
      i++;
      continue;
    }

    // Match '}' block close
    if (source[i] === "}") {
      result.push({ type: "brace_close" });
      i++;
      continue;
    }

    // Match numeric literals like 0, 42, -3.14
    const numMatch = source.slice(i).match(/^(-?\d+(\.\d+)?)/);
    if (numMatch) {
      result.push({ type: "number", value: parseFloat(numMatch[1]) });
      i += numMatch[1].length;
      continue;
    }

    // Match identifiers and keywords like let, read
    const idMatch = source.slice(i).match(/^([a-zA-Z_]\w*)/);
    if (idMatch) {
      const name = idMatch[1];
      i += name.length;

      // Check for function call: identifier followed by ()
      if (i < source.length && source[i] === "(") {
        i++; // skip '('
        if (i >= source.length || source[i] !== ")")
          throw new Error("Expected ')'");
        i++; // skip ')'
        result.push({ type: "call", name });
      } else if (name === "let" || name === "mut") {
        result.push({ type: "keyword", value: name });
      } else if (name === "if" || name === "else") {
        result.push({ type: "keyword", value: name });
      } else {
        result.push({ type: "identifier", value: name });
      }
      continue;
    }

    throw new Error(`Unexpected character at ${i}: ${source[i]}`);
  }
  return result;
}
