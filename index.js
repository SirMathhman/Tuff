function isAlpha(ch) {
  return ch >= "a" && ch <= "z";
}

function isValidChar(ch) {
  if (ch >= "0" && ch <= "9") return true;
  const allowed = " \t\n\r+-*/(){ };=U";
  for (let k = 0; k < allowed.length; k++) {
    if (allowed[k] === ch) return true;
  }
  return false;
}

function skipKeyword(source, i, keyword) {
  if (source.substring(i, i + keyword.length) === keyword) {
    return i + keyword.length;
  }
  return -1;
}

function skipToSemicolon(source, start) {
  let j = start;
  while (j < source.length && isValidChar(source[j]) === false && source[j] !== ";")
    j++;
  return j;
}

// Skip an identifier and return new index, or -1 if not found
function skipIdentifier(source, i) {
  if (i < source.length && isAlpha(source[i])) {
    let j = i + 1;
    while (j < source.length && isAlpha(source[j])) {
      j++;
    }
    return j;
  }
  return -1;
}

// Try to skip identifier if preceded by ; or = (ignoring whitespace), returns new index or -1
function maybeSkipIdentifier(source, i) {
  if (!isAlpha(source[i])) return -1;
  let j = i - 1;
  while (j >= 0 && isValidChar(source[j]) === true && !isAlpha(source[j])) {
    const ch = source[j];
    if (ch === ";" || ch === "=") return skipIdentifier(source, i);
    j--;
  }
  return -1;
}

function validateSource(source) {
  let i = 0;
  while (i < source.length) {
    const matchedRead = skipKeyword(source, i, "read()");
    if (matchedRead !== -1) {
      i = matchedRead;
      continue;
    }
    // Allow 'let' keyword and skip to semicolon
    const matchedLet = skipKeyword(source, i, "let ");
    if (matchedLet !== -1) {
      i = skipToSemicolon(source, i + 4);
      continue;
    }
    // Skip blocks entirely (identifiers inside are handled by block skipping)
    const isBlockStart = source[i] === "{" ;
    if (isBlockStart) {
      const endIdx = findMatchingBrace(source, i);
      i = endIdx + 1;
      continue;
    }
    // Allow identifiers only after semicolons or assignment operators
    const identIdx = maybeSkipIdentifier(source, i);
    if (identIdx !== -1) {
      i = identIdx;
      continue;
    }
    if (!isValidChar(source[i])) {
      return false;
    }
    i++;
  }
  return true;
}

function findMatchingBrace(source, start) {
  let depth = 1;
  let i = start + 1;
  while (depth > 0 && i < source.length) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  return i - 1; // index of matching '}'
}

function hasStatements(source) {
  let i = 0;
  while (i < source.length) {
    if (source[i] === ";") return true;
    const isBlock = source[i] === "{" ;
    if (!isBlock) { i++; continue; }
    const endIdx = findMatchingBrace(source, i);
    i = endIdx + 1;
  }
  return false;
}

function prependReturnToLastExpr(transformedInner) {
  let depth = 0;
  for (let j = transformedInner.length - 1; j >= 0; j--) {
    if (transformedInner[j] === "}") depth++;
    else if (transformedInner[j] === "{") depth--;
    else if (transformedInner[j] === ";" && depth === 0) {
      return transformedInner.substring(0, j + 1) + "return" + transformedInner.substring(j + 1);
    }
  }
  // No semicolons found; prepend 'return' to entire string
  return "return" + transformedInner;
}

// Skip digits and advance index, returns the digit string
function skipDigits(source, start) {
  let j = start;
  while (j < source.length && source[j] >= "0" && source[j] <= "9") {
    j++;
  }
  return j;
}

// Skip type suffix like U8, I16, F32 and advance index
function skipTypeSuffixChars(source, start) {
  let j = start;
  while (j < source.length && ((source[j] >= "0" && source[j] <= "9") || isAlpha(source[j]) || source[j] === "U")) {
    j++;
  }
  return j;
}

// Validate a typed number value against its type suffix. Throws if out of range.
function validateTypedNumber(value, typeChar) {
  if (typeChar === "U") {
    if (value < 0 || value > 255) throw new Error("Value out of range for U8");
  } else if (typeChar === "I") {
    if (value < -128 || value > 127) throw new Error("Value out of range for I8");
  }
}

// Parse a number with optional type suffix and validate range. Returns new index or throws.
function parseTypedNumber(source, start) {
  const numEnd = skipDigits(source, start);
  let i = numEnd;
  // Check for type suffix like U8, I16, F32 etc.
  if (source[i] === "U" || source[i] === "I" || source[i] === "F") {
    const suffixStart = i;
    i = skipTypeSuffixChars(source, i);
    // Include sign prefix if present for value calculation
    let numStr = source.substring(start, numEnd);
    if (start > 0 && source[start - 1] === "-") {
      numStr = "-" + numStr;
    } else if (start > 0 && source[start - 1] === "+") {
      numStr = "+" + numStr;
    }
    const value = parseInt(numStr);
    // Validate range based on type suffix
    validateTypedNumber(value, source[suffixStart]);
  }
  return i;
}

// Strip numeric type suffixes like U8 from source text and validate ranges
function stripTypeSuffix(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] >= "0" && source[i] <= "9") {
      const numEnd = skipDigits(source, i);
      result += source.substring(i, numEnd);
      i = parseTypedNumber(source, i);
    } else {
      result += source[i];
      i++;
    }
  }
  return result;
}

function transformBlocks(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] !== "{") {
      result += source[i];
      i++;
      continue;
    }
    const endIdx = findMatchingBrace(source, i);
    const inner = source.substring(i + 1, endIdx);
    const isStmtBlock = hasStatements(inner);
    if (!isStmtBlock) {
      result += "(" + transformBlocks(stripTypeSuffix(inner)) + ")";
    } else {
      let transformedInner = transformBlocks(stripTypeSuffix(inner));
      const withReturn = prependReturnToLastExpr(transformedInner);
      result += "(function() {" + withReturn + "; })()";
    }
    i = endIdx + 1;
  }
  return stripTypeSuffix(result);
}

export function compile(source) {
  if (source === "") {
    return "return 0;";
  }

  if (!validateSource(source)) {
    throw new Error("Invalid source: " + source);
  }

  const transformed = transformBlocks(source);

  // If top-level has statements, wrap in IIFE with proper returns
  const isStmtLevel = hasStatements(transformed);
  if (isStmtLevel) {
    const withReturn = prependReturnToLastExpr(transformed);
    return (
      "var _tokens = stdIn.split(/\\s+/);\n" +
      "function read() { return parseInt(_tokens.shift()); }\n" +
      "return (function() {" +
      withReturn +
      "; })();"
    );
  }

  return (
    "var _tokens = stdIn.split(/\\s+/);\n" +
    "function read() { return parseInt(_tokens.shift()); }\n" +
    "return " +
    transformed +
    ";"
  );
}
