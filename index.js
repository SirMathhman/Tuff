function isAlpha(ch) {
  return ch >= "a" && ch <= "z";
}

function isValidChar(ch) {
  if (ch >= "0" && ch <= "9") return true;
  const allowed = " \t\n\r+-*/(){ };=UI<>:";
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

// Try to match read<TYPE>() at position i. Returns end index or -1.
function tryMatchTypedRead(source, i) {
  // Check for "read<" followed by type name and ">"
  if (source.substring(i, i + 5) === "read<") {
    let j = i + 5;
    while (j < source.length && isValidChar(source[j]) === false && source[j] !== ">") {
      j++;
    }
    // Check for closing > and ()
    if (source.substring(j, j + 3) === ">()") {
      return j + 3;
    }
  }
  return -1;
}

// Skip a type annotation like ": U8" or ": I16", returns new index
function skipTypeAnnotation(source, i) {
  if (source[i] !== ":") return -1;
  let j = i + 1;
  while (j < source.length && " \t\n\r".includes(source[j])) j++;
  if (j < source.length && (source[j] === 'U' || source[j] === 'I' || source[j] === 'F')) {
    return skipTypeSuffixChars(source, j);
  }
  return -1;
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
    // Try typed read first: read<T>()
    const matchedTypedRead = tryMatchTypedRead(source, i);
    if (matchedTypedRead !== -1) {
      i = matchedTypedRead;
      continue;
    }
    // Plain read()
    const matchedRead = skipKeyword(source, i, "read()");
    if (matchedRead !== -1) {
      i = matchedRead;
      continue;
    }
    // Allow 'let' keyword with optional type annotation: let x : U8 = ...
    const matchedLetPos = skipKeyword(source, i, "let ");
    if (matchedLetPos !== -1) {
      i = processLetDeclaration(source, i);
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
  while (j < source.length && ((source[j] >= "0" && source[j] <= "9") || isAlpha(source[j]) || source[j] === "U" || source[j] === "I")) {
    j++;
  }
  return j;
}

// Get the valid range for a type name like U8, I16, etc. Returns {min, max}.
function getTypeRange(typeName) {
  const isUnsigned = typeName[0] === "U";
  let bits;
  if (typeName.length >= 2 && !isNaN(parseInt(typeName.substring(1)))) {
    bits = parseInt(typeName.substring(1));
  } else {
    // Fallback to U8/I8 if bit width not recognized
    bits = isUnsigned ? 8 : 8;
  }
  const minVal = isUnsigned ? 0 : -(Math.pow(2, bits - 1));
  const maxVal = Math.pow(2, (isUnsigned ? bits : bits - 1)) - 1;
  return { min: minVal, max: maxVal };
}

// Get the bit width from a type name like U8, I16, F32. Returns number or -1 if unrecognized.
function getTypeBits(typeName) {
  const prefix = typeName[0];
  if (prefix !== "U" && prefix !== "I" && prefix !== "F") return -1;
  const bitsStr = typeName.substring(1);
  const bits = parseInt(bitsStr, 10);
  return isNaN(bits) ? -1 : bits;
}

// Validate that inner type (from read<T>()) fits within outer declaration type. Throws if invalid.
function validateTypeCompatibility(innerTypeName, outerTypeName) {
  const innerBits = getTypeBits(innerTypeName);
  const outerBits = getTypeBits(outerTypeName);
  if (innerBits === -1 || outerBits === -1) return; // unrecognized types, skip check
  if (innerBits > outerBits) throw new Error("Type " + innerTypeName + " does not fit in " + outerTypeName);
}

// Extract type name from a typed read like "read<U8>" at position i. Returns {typeName, endPos} or null.
function extractTypedReadInfo(source, i) {
  if (source.substring(i, i + 5) !== "read<") return null;
  let j = i + 5; // skip past "read<"
  while (j < source.length && source[j] !== ">") j++;
  const typeNameStart = i + 5;
  if (source.substring(j, j + 3) !== ">()") return null;
  const typeName = source.substring(typeNameStart, j);
  return { typeName: typeName, endPos: j + 3 };
}

// Check for typed read in the RHS of a let declaration and validate compatibility. Throws if invalid.
function checkTypedReadInRHS(source, afterColonEnd) {
  // Skip whitespace and '=' to find potential 'read<'
  let pos = afterColonEnd;
  while (pos < source.length && " \t\n\r=".includes(source[pos])) pos++;
  const info = extractTypedReadInfo(source, pos);
  if (!info) return; // no typed read found in RHS
  // Walk back from afterColonEnd to find the colon position. Skip past all valid chars (type name + whitespace).
  let j = afterColonEnd - 1;
  while (j >= 0 && isValidChar(source[j]) === true) {
    if (source[j] === ":") break; // stop at colon itself
    j--;
  }
  const colonPos = source[j] === ":" ? j : j + 1; // position of ':'
  if (source[colonPos] !== ":") return; // sanity check — no type annotation found
  let outerStart = colonPos + 1;
  while (outerStart < afterColonEnd && " \t\n\r".includes(source[outerStart])) outerStart++;
  const outerTypeName = source.substring(outerStart, afterColonEnd);
  validateTypeCompatibility(info.typeName, outerTypeName);
}

// Process a let declaration starting at position i (where "let" begins), returns index after semicolon
function processLetDeclaration(source, i) {
  let pos = i + 4; // skip past "let "
  pos = skipIdentifier(source, pos);
  while (pos < source.length && isValidChar(source[pos]) === true && !isAlpha(source[pos])) {
    if (source[pos] !== ":") { pos++; continue; }
    const annotEnd = skipTypeAnnotation(source, pos);
    if (annotEnd !== -1) { checkTypedReadInRHS(source, annotEnd); return annotEnd; }
    pos++;
  }
  return skipToSemicolon(source, pos);
}

// Validate a typed number value against its type suffix. Throws if out of range.
function validateTypedNumber(value, typeName) {
  const range = getTypeRange(typeName);
  if (value < range.min || value > range.max) throw new Error("Value out of range for " + typeName);
}

// Parse a number with optional type suffix and validate range. Returns new index or throws.
function parseTypedNumber(source, start) {
  const numEnd = skipDigits(source, start);
  let i = numEnd;
  // Check for type suffix like U8, I16, F32 etc.
  if (source[i] === "U" || source[i] === "I" || source[i] === "F") {
    const suffixStart = i;
    i = skipTypeSuffixChars(source, i);
    // Extract the full type name for validation (e.g., "U16", "I32")
    const typeName = source.substring(suffixStart, i);
    // Include sign prefix if present for value calculation
    let numStr = source.substring(start, numEnd);
    if (start > 0 && source[start - 1] === "-") {
      numStr = "-" + numStr;
    } else if (start > 0 && source[start - 1] === "+") {
      numStr = "+" + numStr;
    }
    const value = parseInt(numStr);
    // Validate range based on type suffix
    validateTypedNumber(value, typeName);
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

// Strip type annotations (": TypeName") and transform typed reads ("read<T>()" -> "read()")
function stripTypedSyntax(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source.substring(i, i + 5) === "read<") {
      const closeParen = source.indexOf(")", i);
      result += "read()";
      i = closeParen >= 0 ? closeParen + 1 : i + 5;
      continue;
    }
    if (source[i] !== ":") { result += source[i]; i++; continue; }
    const annotEnd = skipTypeAnnotation(source, i);
    if (annotEnd !== -1) { i = annotEnd; continue; }
    result += source[i];
    i++;
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
      result += "(" + transformBlocks(stripTypedSyntax(stripTypeSuffix(inner))) + ")";
    } else {
      let transformedInner = transformBlocks(stripTypedSyntax(stripTypeSuffix(inner)));
      const withReturn = prependReturnToLastExpr(transformedInner);
      result += "(function() {" + withReturn + "; })()";
    }
    i = endIdx + 1;
  }
  return stripTypedSyntax(stripTypeSuffix(result));
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
