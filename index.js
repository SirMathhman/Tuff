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

  // Collect declared variable names for validation
  const declaredVars = new Set();
  for (const s of stmts) {
    if (s.type === "let") declaredVars.add(s.name);
  }

  // Validate all varrefs are declared
  for (const s of stmts) {
    validateRefs(s, declaredVars);
  }

  // Emit JS for each statement, last one is returned
  let js = "let ri=0;\n";
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    if (i === stmts.length - 1) {
      // Last statement: return its value
      js += `return(${emitExpr(s)});\n`;
    } else {
      js += `${emitStmt(s)};\n`;
    }
  }

  return js;
}

function validateRefs(node, declaredVars) {
  if (!node || typeof node !== "object") return;
  if (node.type === "varref" && !declaredVars.has(node.name)) {
    throw new Error(`Undefined variable: ${node.name}`);
  }
  if (node.left) validateRefs(node.left, declaredVars);
  if (node.right) validateRefs(node.right, declaredVars);
  if (node.init) validateRefs(node.init, declaredVars);
}

function parseStatement() {
  if (pos >= tokens.length) throw new Error("Unexpected end");
  const token = tokens[pos];

  // let x = expr ;
  if (token.type === "keyword" && token.value === "let") {
    pos++; // skip 'let'
    if (pos >= tokens.length || tokens[pos].type !== "identifier")
      throw new Error("Expected identifier after 'let'");
    const name = tokens[pos++].value;

    if (pos >= tokens.length || tokens[pos].type !== "assign")
      throw new Error("Expected '=' after variable name");
    pos++; // skip '='

    const exprAst = parseExpr();
    return { type: "let", name, init: exprAst };
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

  throw new Error(`Unsupported token at ${pos}: ${JSON.stringify(token)}`);
}

function emitExpr(node) {
  if (!node || typeof node !== "object") return "";
  if (node.type === "call" && node.name === "read") {
    return `parseInt(stdIn.split(/\\s+/)[ri++],10)`;
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
  // let x = expr
  if (stmt.type === "let") {
    return `let ${stmt.name}=${emitExpr(stmt.init)}`;
  }
  // Bare expression statement
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
      } else if (name === "let") {
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
