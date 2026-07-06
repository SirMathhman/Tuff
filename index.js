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
    // If the value is a known function name, also store it under that name for method calls
    if (/^\w+$/.test(valExpr)) {
      result += `${valExpr}: ${valExpr}, `;
    }
  }
  return result;
}

// Validate that an expression only contains allowed Tuff constructs:
// numbers, arithmetic operators (+ - * /), parentheses, whitespace, read(), readString(), fn,
// arrow (=>), blocks, and known variable names (declaredVars).
function validateExpression(expr, declaredVars = []) {
  // Reject .read() and .readString() as method calls — these are built-ins only
  if (/\.read\(\)/.test(expr) || /\.readString\(\)/.test(expr)) return false;

  // Reject method calls on unknown identifiers — only allow .word() when the base is a known var
  const methodCallMatch = expr.match(/(\\w+)\\.\\w+\\(\\)/);
  if (methodCallMatch && !declaredVars.includes(methodCallMatch[1]))
    return false;

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
  cleaned = cleaned.replace(/=>/g, ""); // arrow syntax for fn declarations
  cleaned = cleaned.replace(/fn\b/g, ""); // function keyword
  cleaned = cleaned.replace(/mut\b/g, ""); // mut keyword
  // Allow property access on declared variables (e.g., dummy.x)
  for (const v of declaredVars) {
    cleaned = cleaned.split(v).join("");
  }
  cleaned = cleaned.replace(/\.\w+/g, ""); // .propertyAccess
  cleaned = cleaned.replace(/[0-9.]/g, "");
  cleaned = cleaned.replace(/[+\-*\/() \t\n\r;,=]/g, "");
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
function compileExpression(expr, declaredVars = [], mutableVars = []) {
  expr = expr.trim();

  if (!validateExpression(expr, declaredVars)) return null;

  // Handle top-level block or object literal: { ... }
  if (expr.startsWith("{") && expr.endsWith("}")) {
    const inner = expr.slice(1, -1);
    if (isObjectLiteral(inner)) {
      // Compile as JS object literal
      return "({" + compileObjectInner(inner) + "})";
    }
    return compileBlock(inner, [...declaredVars], [...mutableVars]);
  }

  // Scan for embedded blocks/object-literals and compile them recursively.
  // Skip over string literals so braces/semicolons inside them don't affect parsing.
  let result = "";
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === "{") {
      const end = findMatchingBrace(expr, i);
      const inner = expr.slice(i + 1, end);
      // Check if there's more content after this block that needs a separator
      const trailingText = expr.slice(end + 1).trim();
      const hasTrailingContent = /\w/.test(trailingText[0]);
      if (isObjectLiteral(inner)) {
        result += "({" + compileObjectInner(inner) + "})";
      } else {
        result += compileBlock(inner, [...declaredVars], [...mutableVars]);
      }
      // Insert newline separator so IIFE doesn't run into adjacent identifiers
      if (hasTrailingContent) result += "\n";
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
function compileBlock(text, declaredVars, mutableVars) {
  const statements = splitStatements(text);
  let body = "";
  // Make mutable copy so new lets inside this block are visible to later stmts
  const localDeclaredVars = [...declaredVars];
  const localMutableVars = [...(mutableVars || [])];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    // Track newly declared functions and variables BEFORE compiling so nested blocks see them
    const fnMatch = stmt.match(/^\s*fn\s+(\w+)\(\)\s*=>\s*(.+)$/);
    if (fnMatch) {
      localDeclaredVars.push(fnMatch[1]);
    } else {
      const letMutMatch = stmt.match(/^\s*let\s+mut\s+(\w+)\s*=\s*(.+)$/);
      if (letMutMatch) {
        localDeclaredVars.push(letMutMatch[1]);
        localMutableVars.push(letMutMatch[1]);
      } else {
        const letMatch = stmt.match(/^\s*let\s+(\w+)\s*=\s*(.+)$/);
        if (letMatch) {
          localDeclaredVars.push(letMatch[1]);
        }
      }
    }
    // Check for assignment to mutable var BEFORE compiling so nested blocks see it
    const assignCheck = stmt.match(/^\s*(\w+)\s*=\s*([^=].+)$/);
    if (assignCheck && localMutableVars.includes(assignCheck[1])) {
      // Assignment is valid, proceed with compilation
    }
    const isLast = i === statements.length - 1;
    const compiled = compileStatement(
      stmt,
      localDeclaredVars,
      localMutableVars,
    );
    if (compiled === null) return null;

    // If the last statement is a declaration, don't wrap in 'return' — just emit it.
    if (isLast && !isDeclaration(stmt)) {
      body += `return ${compiled};`;
    } else {
      body += `${compiled};\n`;
    }
  }

  // If block ends with a declaration, return 0 as neutral value so the IIFE doesn't
  // return undefined when used in expressions like `{ let x = 1; } outer`
  if (isDeclaration(statements[statements.length - 1])) {
    body += `return 0;`;
  }

  return `(function() { ${body} })()`;
}

// Check if a statement is a declaration (let/let mut/fn)
function isDeclaration(stmt) {
  const s = stmt.trim();
  return /^\s*(fn|let)\b/.test(s);
}

// Compile a single statement, returns JS code (without semicolon) or null on error.
function compileStatement(stmt, declaredVars, mutableVars = []) {
  stmt = stmt.trim();

  // Match 'fn name() => expr' — function declaration
  const fnMatch = stmt.match(/^\s*fn\s+(\w+)\(\)\s*=>\s*(.+)$/);
  if (fnMatch) {
    const fnName = fnMatch[1];
    const compiledBody = compileExpression(
      fnMatch[2],
      declaredVars,
      mutableVars,
    );
    if (compiledBody === null) return null;
    // Add new function to the scope for subsequent statements
    const updatedVars = [...declaredVars, fnName];
    return `var ${fnName} = () => ${compiledBody}`;
  }

  // Match 'let mut x = expr' — mutable variable declaration
  const letMutMatch = stmt.match(/^\s*let\s+mut\s+(\w+)\s*=\s*(.+)$/);
  if (letMutMatch) {
    const varName = letMutMatch[1];
    const compiledExpr = compileExpression(
      letMutMatch[2],
      declaredVars,
      mutableVars,
    );
    if (compiledExpr === null) return null;
    // Add new variable to the scope for subsequent statements
    const updatedVars = [...declaredVars, varName];
    return `var ${varName} = ${compiledExpr}`;
  }

  // Match 'let x = expr' — capture everything after '=' as the expression,
  // including any nested blocks
  const letMatch = stmt.match(/^\s*let\s+(\w+)\s*=\s*(.+)$/);
  if (letMatch) {
    const varName = letMatch[1];
    const compiledExpr = compileExpression(
      letMatch[2],
      declaredVars,
      mutableVars,
    );
    if (compiledExpr === null) return null;
    // Add new variable to the scope for subsequent statements
    const updatedVars = [...declaredVars, varName];
    return `var ${varName} = ${compiledExpr}`;
  }

  // Match 'x = expr' — plain assignment (requires x to be declared as mutable)
  const assignMatch = stmt.match(/^\s*(\w+)\s*=\s*([^=].+)$/);
  if (assignMatch && mutableVars.includes(assignMatch[1])) {
    const varName = assignMatch[1];
    const compiledExpr = compileExpression(
      assignMatch[2],
      declaredVars,
      mutableVars,
    );
    if (compiledExpr === null) return null;
    return `${varName} = ${compiledExpr}`;
  }

  // Reject assignment to non-mutable variable
  if (assignMatch && !mutableVars.includes(assignMatch[1])) {
    return null;
  }

  // Plain expression
  return compileExpression(stmt, declaredVars, mutableVars);
}

export function compileTuffToJS(source) {
  const trimmed = source.trim();

  if (trimmed === "") {
    return ok("return 0;");
  }

  const statements = splitStatements(trimmed);
  let body = "";
  const declaredVars = [];
  const mutableVars = [];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    // Track newly declared functions and variables BEFORE compiling so nested blocks see them
    const fnMatch = stmt.match(/^\s*fn\s+(\w+)\(\)\s*=>\s*(.+)$/);
    if (fnMatch) {
      declaredVars.push(fnMatch[1]);
    } else {
      const letMutMatch = stmt.match(/^\s*let\s+mut\s+(\w+)\s*=\s*(.+)$/);
      if (letMutMatch) {
        declaredVars.push(letMutMatch[1]);
        mutableVars.push(letMutMatch[1]);
      } else {
        const letMatch = stmt.match(/^\s*let\s+(\w+)\s*=\s*(.+)$/);
        if (letMatch) {
          declaredVars.push(letMatch[1]);
        }
      }
    }

    // Check for assignment to mutable var BEFORE compiling so nested blocks see it
    const assignCheck = stmt.match(/^\s*(\w+)\s*=\s*([^=].+)$/);
    if (
      assignCheck &&
      declaredVars.includes(assignCheck[1]) &&
      !mutableVars.includes(assignCheck[1])
    ) {
      // Assignment to non-mutable var — will fail compilation, skip tracking
    }

    const isLast = i === statements.length - 1;
    const compiled = compileStatement(stmt, declaredVars, mutableVars);
    if (compiled === null) return err("Invalid source code: " + source);

    // If the last statement is a declaration, don't wrap in 'return' — just emit it.
    if (isLast && !isDeclaration(stmt)) {
      body += `return ${compiled};`;
    } else {
      body += `${compiled};\n`;
    }
  }

  // If the last statement was a declaration, add default return so function doesn't return undefined
  if (statements.length > 0 && isDeclaration(statements[statements.length - 1])) {
    body += `return 0;`;
  }

  return ok(
    'const tokens = (stdIn || "").trim().split(/\\s+/); let tokenIdx = 0; function __read() { return parseInt(tokens[tokenIdx++]); } function __readStr() { return tokens[tokenIdx++]; } ' +
      body,
  );
}
