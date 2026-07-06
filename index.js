export function ok(value) {
  return { isOk: true, value };
}

export function err(error) {
  return { isOk: false, error };
}

// Split text by top-level semicolons, respecting {} nesting depth and skipping quoted strings
function splitStatements(text) {
  const result = [];
  let current = "";
  let depth = 0;
  let inStr = false;
  let strDelim = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Track whether we're inside a quoted string literal
    if (!inStr && (ch === '"' || ch === "'")) {
      inStr = true;
      strDelim = ch;
      current += ch;
    } else if (inStr && ch === strDelim) {
      inStr = false;
      strDelim = null;
      current += ch;
    } else if (inStr) {
      // Inside a string — just accumulate, don't interpret braces/semicolons
      current += ch;
    } else if (ch === "{") {
      depth++;
      current += ch;
    } else if (ch === "}") {
      depth--;
      current += ch;
    } else if (ch === ";" && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    } else {
      current += ch;
    }
  }

  const last = current.trim();
  if (last.length > 0) result.push(last);
  return result;
}

// Find the matching closing brace for an opening brace at position pos.
// Assumes well-formed input with balanced braces (validated before compile).
function findMatchingBrace(expr, pos) {
  let depth = 1;
  const maxIter = Math.min(1024, expr.length);
  let inStr = false;
  let strDelim = null;
  for (let i = pos + 1; i < maxIter; i++) {
    // Skip over string literals so braces inside them don't affect depth
    if (!inStr && (expr[i] === '"' || expr[i] === "'")) {
      inStr = true;
      strDelim = expr[i];
    } else if (inStr) {
      if (expr[i] === strDelim) {
        inStr = false;
        strDelim = null;
      }
    } else if (expr[i] === "{") {
      depth++;
    } else if (expr[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
}

// Compile the inner content of an object literal: key1 : val1, key2 : val2
function compileObjectInner(text) {
  // Split by commas (not inside nested braces)
  const parts = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += text[i];
  }
  const last = current.trim();
  if (last.length > 0) parts.push(last);

  let result = "";
  for (const part of parts) {
    // Split by first colon: key : value
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue; // skip malformed entries
    const key = part.slice(0, colonIdx).trim();
    const valExpr = part.slice(colonIdx + 1).trim();
    result += `${key}: ${valExpr}, `;
  }
  return result;
}

// Validate that an expression only contains allowed Tuff constructs:
// numbers, arithmetic operators (+ - * /), parentheses, whitespace, read(), readString(), blocks,
// and known variable names (declaredVars).
function validateExpression(expr, declaredVars = []) {
  // Reject method calls on any identifier (e.g., dummy.read())
  if (/\w+\.\w+\(\)/.test(expr)) return false;

  // First strip out any nested {} blocks — they're validated recursively
  let cleaned = "";
  let depth = 0;
  let inStr = false;
  let strDelim = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    // Track whether we're inside a quoted string literal
    if (!inStr && (ch === '"' || ch === "'")) {
      inStr = true;
      strDelim = ch;
      cleaned += ch;
    } else if (inStr) {
      cleaned += ch;
      if (ch === strDelim) {
        inStr = false;
        strDelim = null;
      }
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (depth === 0) {
      cleaned += ch;
    }
  }

  // Remove known-good tokens to check if anything suspicious remains
  cleaned = cleaned.replace(/(?<!\.)readString\(\)/g, "");
  cleaned = cleaned.replace(/(?<!\.)read\(\)/g, "");
  cleaned = cleaned.replace(/["'][^"']*["']/g, ""); // string literals
  cleaned = cleaned.replace(/\.(length|toFixed|toString)\b/g, "");
  // Allow property access on declared variables (e.g., dummy.x)
  for (const v of declaredVars) {
    cleaned = cleaned.split(v).join("");
  }
  cleaned = cleaned.replace(/\.\w+/g, ""); // .propertyAccess
  cleaned = cleaned.replace(/[0-9.]/g, "");
  cleaned = cleaned.replace(/[+\-*\/() \t\n\r;,]/g, "");
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

// Check if braces contain object literal syntax (key: value pairs with commas)
function isObjectLiteral(content) {
  // Object literals have colons for key-value mapping and use commas as separators
  const hasColon = content.includes(":");
  return hasColon && !content.includes(";");
}

// Compile a single Tuff expression to JavaScript code string.
function compileExpression(expr, declaredVars = []) {
  expr = expr.trim();

  if (!validateExpression(expr, declaredVars)) return null;

  // Handle top-level block or object literal: { ... }
  if (expr.startsWith("{") && expr.endsWith("}")) {
    const inner = expr.slice(1, -1);
    if (isObjectLiteral(inner)) {
      // Compile as JS object literal
      return "({" + compileObjectInner(inner) + "})";
    }
    return compileBlock(inner, [...declaredVars]);
  }

  // Scan for embedded blocks/object-literals and compile them recursively.
  // Skip over string literals so braces/semicolons inside them don't affect parsing.
  let result = "";
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "{") {
      const end = findMatchingBrace(expr, i);
      const inner = expr.slice(i + 1, end);
      if (isObjectLiteral(inner)) {
        result += "({" + compileObjectInner(inner) + "})";
      } else {
        result += compileBlock(inner, [...declaredVars]);
      }
      i = end + 1;
    } else if (expr[i] === '"' || expr[i] === "'") {
      // Start of a string literal — collect until closing quote and pass through as-is
      const delim = expr[i];
      let segStart = i;
      i++;
      while (i < expr.length && expr[i] !== delim) i++;
      if (i < expr.length) i++; // include closing delimiter
      result += expr.slice(segStart, i);
    } else {
      // Collect text until next block or string literal boundary
      let segStart = i;
      while (
        i < expr.length &&
        expr[i] !== "{" &&
        expr[i] !== '"' &&
        expr[i] !== "'"
      )
        i++;
      const segment = expr.slice(segStart, i);
      result += segment
        .replace(/(?<!\.)readString\(\)/g, "__readStr()")
        .replace(/(?<!\.)read\(\)/g, "__read()");
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
    'const tokens = (stdIn || "").trim().split(/\\s+/); let tokenIdx = 0; function __read() { return parseInt(tokens[tokenIdx++]); } function __readStr() { return tokens[tokenIdx++]; } ' +
      body,
  );
}
