export function ok(value) {
  return { isOk: true, value };
}

export function err(error) {
  return { isOk: false, error };
}

// Split text by top-level semicolons, respecting {} nesting depth
function splitStatements(text) {
  const result = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ";" && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  const last = current.trim();
  if (last.length > 0) result.push(last);
  return result;
}

// Find the matching closing brace for an opening brace at position pos.
// Assumes well-formed input with balanced braces (validated before compile).
function findMatchingBrace(expr, pos) {
  let depth = 1;
  for (let i = pos + 1; ; i++) {
    if (expr[i] === "{") depth++;
    else if (expr[i] === "}") depth--;
    if (depth === 0) return i;
  }
}

// Validate that an expression only contains allowed Tuff constructs:
// numbers, arithmetic operators (+ - * /), parentheses, whitespace, read(), blocks,
// and known variable names (declaredVars).
function validateExpression(expr, declaredVars = []) {
  // First strip out any nested {} blocks — they're validated recursively
  let cleaned = "";
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "{") depth++;
    else if (expr[i] === "}") depth--;
    else if (depth === 0) cleaned += expr[i];
  }

  // Remove known-good tokens to check if anything suspicious remains
  cleaned = cleaned.replace(/read\(\)/g, "");
  cleaned = cleaned.replace(/[0-9.]/g, "");
  cleaned = cleaned.replace(/[+\-*\/() \t\n\r;]/g, "");
  // Remove known variable names
  for (const v of declaredVars) {
    cleaned = cleaned.split(v).join("");
  }
  // If anything is left (e.g., unknown identifiers), it's invalid
  if (cleaned.length > 0) {
    return false;
  }
  return true;
}

// Compile a single Tuff expression to JavaScript code string.
function compileExpression(expr, declaredVars = []) {
  expr = expr.trim();

  if (!validateExpression(expr, declaredVars)) return null;

  // Handle top-level block: { stmts }
  if (expr.startsWith("{") && expr.endsWith("}")) {
    const inner = expr.slice(1, -1);
    return compileBlock(inner, [...declaredVars]);
  }

  // Scan for embedded blocks and compile them recursively
  let result = "";
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "{") {
      const end = findMatchingBrace(expr, i);
      const inner = expr.slice(i + 1, end);
      result += compileBlock(inner, [...declaredVars]);
      i = end + 1;
    } else {
      // Collect text until next block or end
      let segmentStart = i;
      while (i < expr.length && expr[i] !== "{") i++;
      const segment = expr.slice(segmentStart, i);
      result += segment.replace(/read\(\)/g, "__read()");
    }
  }

  return result;
}

// Compile a block of statements to an IIFE that returns the last value.
// Returns null if any statement is invalid.
function compileBlock(text, declaredVars) {
  const statements = splitStatements(text);
  let body = "";
  // Make mutable copy so new lets inside this block are visible to later stmts
  const localDeclaredVars = [...declaredVars];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const isLast = i === statements.length - 1;
    const compiled = compileStatement(stmt, localDeclaredVars);
    if (compiled === null) return null;

    // Track newly declared variables for subsequent statements in this block
    const letMatch = stmt.match(/^\s*let\s+(\w+)\s*=\s*(.+)$/);
    if (letMatch) {
      localDeclaredVars.push(letMatch[1]);
    }

    if (isLast) {
      body += `return ${compiled};`;
    } else {
      body += `${compiled};\n`;
    }
  }

  return `(function() { ${body} })()`;
}

// Compile a single statement, returns JS code (without semicolon) or null on error.
function compileStatement(stmt, declaredVars) {
  stmt = stmt.trim();

  // Match 'let x = expr' — capture everything after '=' as the expression,
  // including any nested blocks
  const letMatch = stmt.match(/^\s*let\s+(\w+)\s*=\s*(.+)$/);
  if (letMatch) {
    const varName = letMatch[1];
    const compiledExpr = compileExpression(letMatch[2], declaredVars);
    if (compiledExpr === null) return null;
    // Add new variable to the scope for subsequent statements
    const updatedVars = [...declaredVars, varName];
    return `var ${varName} = ${compiledExpr}`;
  }

  // Plain expression
  return compileExpression(stmt, declaredVars);
}

export function compileTuffToJS(source) {
  const trimmed = source.trim();

  if (trimmed === "") {
    return ok("return 0;");
  }

  const statements = splitStatements(trimmed);
  let body = "";
  const declaredVars = [];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const isLast = i === statements.length - 1;
    const compiled = compileStatement(stmt, declaredVars);
    if (compiled === null) return err("Invalid source code: " + source);

    // Track newly declared variables for subsequent iterations
    const letMatch = stmt.match(/^\s*let\s+(\w+)\s*=\s*(.+)$/);
    if (letMatch) {
      declaredVars.push(letMatch[1]);
    }

    if (isLast) {
      body += `return ${compiled};`;
    } else {
      body += `${compiled};\n`;
    }
  }

  return ok(
    'const tokens = (stdIn || "").trim().split(/\\s+/); let tokenIdx = 0; function __read() { return parseInt(tokens[tokenIdx++]); } ' +
      body,
  );
}
