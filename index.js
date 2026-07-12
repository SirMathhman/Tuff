function isAlpha(ch) {
  return ch >= "a" && ch <= "z";
}

function isValidChar(ch) {
  if (ch >= "0" && ch <= "9") return true;
  const allowed = " \t\n\r+-*/(){ };=UI" + String.fromCharCode(60, 62) + ":|";
  for (let k = 0; k < allowed.length; k++) {
    if (allowed[k] === ch) return true;
  }
  return false;
}

// Skip a boolean literal ("true" or "false") at position i. Returns end index or -1.
function skipBoolLiteral(source, i) {
  const trueEnd = skipKeyword(source, i, "true");
  if (trueEnd !== -1 && (trueEnd >= source.length || !isAlpha(source[trueEnd]))) return trueEnd;
  const falseEnd = skipKeyword(source, i, "false");
  if (falseEnd !== -1 && (falseEnd >= source.length || !isAlpha(source[falseEnd]))) return falseEnd;
  return -1;
}

// Skip a logical operator ("||" or "&&") at position i. Returns end index or -1.
function skipLogicalOperator(source, i) {
  if (source.substring(i, i + 2) === "||") return i + 2;
  if (source.substring(i, i + 2) === "&&") return i + 2;
  return -1;
}

// Skip "if" keyword at position i. Returns end index or -1.
function skipIfKeyword(source, i) {
  if (source.substring(i, i + 2) === "if" && (i + 2 >= source.length || !isAlpha(source[i + 2]))) {
    return i + 2;
  }
  return -1;
}

// Skip "else" keyword at position i. Returns end index or -1.
function skipElseKeyword(source, i) {
  if (source.substring(i, i + 4) === "else" && (i + 4 >= source.length || !isAlpha(source[i + 4]))) {
    return i + 4;
  }
  return -1;
}

// Skip an if/else expression starting at position i. Returns end index or -1.
function skipIfElseExpression(source, i) {
  // Skip leading whitespace
  let pos = skipWhitespace(source, i);
  const ifEnd = skipIfKeyword(source, pos);
  if (ifEnd === -1) return -1;
  
  // Skip whitespace after "if"
  pos = skipWhitespace(source, ifEnd);
  
  // Expect opening parenthesis for condition
  if (source[pos] !== "(") return -1;
  
  // Find closing parenthesis of condition
  let parenDepth = 1;
  pos++;
  while (pos < source.length && parenDepth > 0) {
    if (source[pos] === "(") { parenDepth++; pos++; continue; }
    if (source[pos] === ")") { parenDepth--; pos++; continue; }
    pos++;
  }
  
  // Skip whitespace after condition
  pos = skipWhitespace(source, pos);
  
  // Skip the true branch (could be a block or expression)
  if (source[pos] === "{") {
    pos = findMatchingBrace(source, pos) + 1;
  } else {
    pos = skipExpression(source, pos);
  }
  
  // Skip whitespace
  pos = skipWhitespace(source, pos);
  
  // Check for "else" keyword and skip false branch
  const elseEnd = skipElseKeyword(source, pos);
  if (elseEnd === -1) return pos;
  
  pos = skipWhitespace(source, elseEnd);
  pos = source[pos] === "{" ? findMatchingBrace(source, pos) + 1 : skipExpression(source, pos);
  return pos;
}

// Skip an expression (non-block) until delimiter (semicolon, else, closing brace, etc.).
function skipExpression(source, start) {
  let i = start;
  let parenDepth = 0;
  while (i < source.length) {
    if (source[i] === "(") { parenDepth++; i++; continue; }
    if (source[i] === ")" && parenDepth === 0) break;
    if (source[i] === ")") { parenDepth--; i++; continue; }
    if (source[i] === ";" && parenDepth === 0) break;
    if (source[i] === "{") { i = findMatchingBrace(source, i) + 1; continue; }
    if (parenDepth === 0 && skipElseKeyword(source, skipWhitespace(source, i)) !== -1) break;
    i++;
  }
  return i;
}


function skipKeyword(source, i, keyword) {
  if (source.substring(i, i + keyword.length) === keyword) {
    return i + keyword.length;
  }
  return -1;
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
  // Bool type annotation
  if (j + 3 <= source.length && source.substring(j, j + 4) === "Bool") {
    return j + 4;
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
    // Try if/else expression
    const ifElseEnd = skipIfElseExpression(source, i);
    if (ifElseEnd !== -1) {
      i = ifElseEnd;
      continue;
    }
    // Skip boolean literals ("true" or "false")
    const boolEnd = skipBoolLiteral(source, i);
    if (boolEnd !== -1) {
      i = boolEnd;
      continue;
    }
    // Skip logical operators ("||", "&&")
    const logicOpEnd = skipLogicalOperator(source, i);
    if (logicOpEnd !== -1) {
      i = logicOpEnd;
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

// Find the start of an IIFE pattern ending at position endParen. Returns start index or -1.
function findIIFEStart(transformedInner, endParen) {
  if (endParen === 0 || transformedInner[endParen - 1] !== "(") return -1;
  let iifeDepth = 1;
  let j = endParen - 1;
  while (j >= 0 && iifeDepth > 0) {
    if (transformedInner[j] === "(") { iifeDepth--; j--; continue; }
    if (transformedInner[j] === ")") { iifeDepth++; j--; continue; }
    j--;
  }
  return iifeDepth === 0 ? j + 1 : -1;
}

// Try to skip over an IIFE ending at position j. Returns new j or -1 if not an IIFE.
function trySkipIIFE(transformedInner, j) {
  const iifeStart = findIIFEStart(transformedInner, j);
  if (iifeStart !== -1) return iifeStart;
  return -1;
}

// Process a single character in prependReturnToLastExpr. Returns {j, depth, parenDepth} or null if found semicolon.
function processChar(transformedInner, j, depth, parenDepth) {
  const ch = transformedInner[j];
  if (ch === "}") return { j, depth: depth + 1, parenDepth };
  if (ch === "{") return { j, depth: depth - 1, parenDepth };
  if (ch === ")") {
    const newParenDepth = parenDepth + 1;
    if (depth !== 0 || newParenDepth !== 1) { return { j, depth, parenDepth: newParenDepth }; }
    const skipped = trySkipIIFE(transformedInner, j);
    if (skipped !== -1) return { j: skipped, depth, parenDepth: 0 };
    return { j, depth, parenDepth: newParenDepth };
  }
  if (ch === "(") return { j, depth, parenDepth: parenDepth - 1 };
  if (ch === ";" && depth === 0 && parenDepth === 0) return null;
  return { j, depth, parenDepth };
}

function prependReturnToLastExpr(transformedInner) {
  let depth = 0;
  let parenDepth = 0;
  for (let j = transformedInner.length - 1; j >= 0; j--) {
    const result = processChar(transformedInner, j, depth, parenDepth);
    if (result === null) return buildReturnAfterSemi(transformedInner, j);
    j = result.j;
    depth = result.depth;
    parenDepth = result.parenDepth;
  }
  // No semicolons found; prepend 'return' to entire string
  return "return" + transformedInner;
}

// Check if a string contains only semicolons or whitespace. Returns true.
function isEmptyOrSemicolons(str) {
  for (let k = 0; k < str.length; k++) {
    const ch = str[k];
    if (ch !== ";" && ch !== " " && ch !== "\t" && ch !== "\n") return false;
  }
  return true;
}

// Build the return statement after a semicolon at position j. Returns new string.
function buildReturnAfterSemi(transformedInner, j) {
  const afterSemi = transformedInner.substring(j + 1);
  if (isEmptyOrSemicolons(afterSemi)) return transformedInner.substring(0, j + 1) + "return 0";
  return transformedInner.substring(0, j + 1) + "return" + afterSemi;
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
  // Skip to semicolon, but handle if/else expressions and blocks properly
  return skipToSemicolonWithIfElse(source, pos);
}

// Like skipToSemicolon but properly handles if/else expressions and blocks
function skipToSemicolonWithIfElse(source, start) {
  let j = start;
  while (j < source.length && source[j] !== ";") {
    // Handle if/else expressions
    const ifElseEnd = skipIfElseExpression(source, j);
    if (ifElseEnd !== -1) {
      j = ifElseEnd;
      continue;
    }
    // Handle blocks
    if (source[j] === "{") {
      const endIdx = findMatchingBrace(source, j);
      j = endIdx + 1;
      continue;
    }
    // Skip invalid chars (like alpha chars that aren't recognized keywords)
    if (isValidChar(source[j]) === false) {
      j++;
      continue;
    }
    j++;
  }
  return j;
}

// Skip whitespace and return new index.
function skipWhitespace(source, start) {
  let j = start;
  while (j < source.length && " \t\n\r".includes(source[j])) j++;
  return j;
}

// Extract variable type from a let declaration at position i. Returns typeName or null.
function extractVarTypeFromLet(source, i) {
  const identEnd = skipIdentifier(source, i + 4);
  if (identEnd === -1) return null;
  
  // Check for explicit ": TypeName" annotation after identifier
  let pos = skipWhitespace(source, identEnd);
  if (source[pos] === ":") {
    const annotEnd = skipTypeAnnotation(source, pos);
    if (annotEnd !== -1) {
      return source.substring(pos + 1, annotEnd).trim();
    }
  }
  
  // Infer from read<T>() in RHS after '='
  let eqPos = source.indexOf("=", i + 4);
  if (eqPos === -1) return null;
  const semiPos = source.indexOf(";", eqPos);
  const endBound = semiPos === -1 ? source.length : semiPos;
  
  for (let p = skipWhitespace(source, eqPos + 1); p < endBound && source[p] !== ";"; p++) {
    if (source.substring(p, p + 5) === "read<") {
      const info = extractTypedReadInfo(source, p);
      return info ? info.typeName : null;
    }
  }
  return null;
}

// Build a map of variable names to their types by scanning all let declarations. Returns object.
function buildVarTypeMap(source) {
  const typeMap = {};
  for (let i = 0; i < source.length; i++) {
    if (source.substring(i, i + 4) !== "let ") continue;
    const typeName = extractVarTypeFromLet(source, i);
    const identEnd = skipIdentifier(source, i + 4);
    if (identEnd === -1) continue;
    typeMap[source.substring(i + 4, identEnd)] = typeName;
  }
  return typeMap;
}

// Validate that variable assignments respect type compatibility. Throws if invalid.
function validateVarAssignments(source) {
  const varTypes = buildVarTypeMap(source);
  
  // Build a set of immutable variables (declared without "mut") and check typed declarations in one pass
  const immutables = new Set();
  for (let i = 0; i < source.length - 3; i++) {
    if (source.substring(i, i + 4) !== "let ") continue;
    
    let identEnd = skipIdentifier(source, i + 4);
    if (identEnd === -1) continue;
    
    const varName = source.substring(i + 4, identEnd);
    immutables.add(varName);
    
    // Check type annotation on this declaration for compatibility with RHS variable types
    let pos = skipWhitespace(source, identEnd);
    if (source[pos] !== ":") continue;
    
    const annotEnd = skipTypeAnnotation(source, pos);
    if (annotEnd === -1) continue;
    
    // Get target type and RHS variable name
    const targetTypeName = source.substring(pos + 1, annotEnd).trim();
    let eqPos2 = source.indexOf("=", i + 4);
    if (eqPos2 === -1) continue;
    
    let rhsStart = skipWhitespace(source, eqPos2 + 1);
    const semiPos2 = source.indexOf(";", eqPos2);
    const endBound = semiPos2 === -1 ? source.length : semiPos2;
    
    // Check if RHS is a simple identifier reference to another variable
    let rhsIdentEnd = skipIdentifier(source, rhsStart);
    if (rhsIdentEnd <= rhsStart) continue;
    
    const rhsVarName = source.substring(rhsStart, rhsIdentEnd);
    const rhsTrimmed = source.substring(rhsStart, endBound).trim();
    if (rhsVarName !== rhsTrimmed) continue; // not a bare identifier
    
    const srcTypeName = varTypes[rhsVarName];
    if (!srcTypeName || !targetTypeName) continue;
    
    validateTypeCompatibility(srcTypeName, targetTypeName);
  }
  
  // Check for reassignments to immutable variables (pattern: "x =" where x is not mutable)
  let eqPos = source.indexOf("=");
  while (eqPos !== -1 && eqPos < source.length) {
    checkReassignmentToImmutable(source, eqPos, immutables);
    
    eqPos = source.indexOf("=", eqPos + 1);
  }
}

// Check if an assignment at position eqPos is reassigning an immutable variable. Throws if invalid.
function checkReassignmentToImmutable(source, eqPos, immutables) {
  // Find identifier before '=' by walking backwards from '=' skipping whitespace
  let beforeEq = eqPos - 1;

  // Skip compound assignment operators (+=, -=, *=, /=) — the char before = is an operator
  if (beforeEq >= 0 && ["+", "-", "*", "/"].includes(source[beforeEq])) {
    beforeEq--;
  }

  while (beforeEq >= 0 && " \t\n\r".includes(source[beforeEq])) beforeEq--;

  if (!(beforeEq > 0 && isAlpha(source[beforeEq]))) return; // not an identifier
  
  // Walk backwards to find start of identifier
  let identStart = beforeEq;
  while (identStart > 0 && isAlpha(source[identStart - 1])) identStart--;
  
  const varName = source.substring(identStart, beforeEq + 1);
  
  // Check if this looks like a reassignment (not part of "let x =" declaration)
  let beforeIdent = identStart - 1;
  while (beforeIdent >= 0 && " \t\n\r".includes(source[beforeIdent])) beforeIdent--;
  
  // Determine context: preceded by ';' means standalone assignment, preceded by 'let' is a declaration
  const hasSemicolonBefore = source[beforeIdent] === ";";
  const hasLetBefore = identStart > 3 && source.substring(identStart - 4, identStart) === "let ";
  
  // If it's part of a let declaration, skip (that's the initial assignment)
  if (hasLetBefore) return;
  
  // Standalone assignment to immutable variable is an error
  if ((identStart === 0 || hasSemicolonBefore) && immutables.has(varName)) {
    throw new Error("Cannot reassign immutable variable: " + varName);
  }
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

// Strip type annotations (": TypeName") and transform typed reads ("read<T>()" -> "read()" or "_readBool()")
function stripTypedSyntax(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    const isReadTagged = source.substring(i, i + 5) === "read<";
    if (isReadTagged) {
      const nextI = tryStripTypedRead(source, i);
      result += source.substring(i + 5, i + 9) === "Bool" ? "_readBool()" : "read()";
      i = nextI !== null ? nextI : i + 1;
      continue;
    }
    // Convert boolean literals: true -> 1, false -> 0
    const boolEnd = skipBoolLiteral(source, i);
    if (boolEnd !== -1) {
      result += source.substring(i, boolEnd) === "true" ? "1" : "0";
      i = boolEnd;
      continue;
    }
    const isColon = source[i] === ":";
    if (!isColon) { result += source[i]; i++; continue; }
    const annotEnd = skipTypeAnnotation(source, i);
    if (annotEnd !== -1) { i = annotEnd; continue; }
    result += source[i];
    i++;
  }
  return stripMutKeyword(result);
}

// Handle typed read at position i. Returns new index or null if not a typed read.
function tryStripTypedRead(source, i) {
  const closeParen = source.indexOf(")", i);
  // Check for Bool type: read<Bool>() -> _readBool()
  if (source.substring(i + 5, i + 9) === "Bool" && closeParen > i + 9) {
    return closeParen >= 0 ? closeParen + 1 : i + 9;
  } else if (closeParen >= 0) {
    // Generic typed read: read<T>() -> read()
    return closeParen + 1;
  }
  return null;
}


// Strip "mut" keyword from let declarations ("let mut x" -> "var x") and replace "let" with "var"
function stripMutKeyword(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source.substring(i, i + 4) !== "let ") {
      result += source[i];
      i++;
      continue;
    }
    // Check for "mut" keyword after "let "
    let j = skipWhitespace(source, i + 4);
    const mutEnd = skipKeywordMut(source, j);
    if (mutEnd !== -1) {
      result += "var ";
      i = mutEnd; // skip past "mut" and continue processing from after it
      continue;
    }
    result += "var ";
    i += 4;
  }
  return result;
}

// Skip "mut" keyword at position i. Returns end index or -1.
function skipKeywordMut(source, i) {
  if (source.substring(i, i + 3) === "mut") {
    // Ensure it's a whole word (followed by whitespace or non-alpha char)
    const next = i + 3;
    if (next >= source.length || !isAlpha(source[next])) {
      return skipWhitespace(source, next);
    }
  }
  return -1;
}


function transformBlocks(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    // Check for if/else expression
    const ifEnd = skipIfKeyword(source, i);
    if (ifEnd !== -1) {
      result += transformIfElse(source, i);
      const nextI = skipIfElseExpression(source, i);
      i = nextI === -1 ? source.length : nextI;
      continue;
    }
    if (source[i] !== "{") {
      result += source[i];
      i++;
      continue;
    }
    const endIdx = findMatchingBrace(source, i);
    const inner = source.substring(i + 1, endIdx);
    if (!hasStatements(inner)) {
      result += "(" + transformBlocks(stripTypedSyntax(stripTypeSuffix(inner))) + ")";
    } else {
      let transformedInner = transformBlocks(stripTypedSyntax(stripTypeSuffix(inner)));
      const withReturn = prependReturnToLastExpr(transformedInner);
      result += "(function() {" + withReturn + "; })();";
    }
    i = endIdx + 1;
  }
  return stripTypedSyntax(stripTypeSuffix(result));
}

// Transform an if/else expression to JavaScript ternary: (cond) ? (trueBranch) : (falseBranch)
function transformIfElse(source, start) {
  const ifEnd = skipIfKeyword(source, start);
  let pos = skipWhitespace(source, ifEnd);
  
  // Extract condition (inside parentheses)
  pos++; // skip '('
  let parenDepth = 1;
  let condStart = pos;
  while (pos < source.length && parenDepth > 0) {
    if (source[pos] === "(") parenDepth++;
    else if (source[pos] === ")") parenDepth--;
    pos++;
  }
  const condition = source.substring(condStart, pos - 1);
  const transformedCondition = transformBlocks(stripTypedSyntax(stripTypeSuffix(condition)));
  
  // Skip whitespace after condition
  pos = skipWhitespace(source, pos);
  
  // Extract true branch
  let trueBranch;
  if (source[pos] === "{") {
    const endIdx = findMatchingBrace(source, pos);
    trueBranch = source.substring(pos + 1, endIdx);
  } else {
    const exprEnd = skipExpression(source, pos);
    trueBranch = source.substring(pos, exprEnd);
  }
  const transformedTrueBranch = transformBlocks(stripTypedSyntax(stripTypeSuffix(trueBranch.trim())));
  
  // Skip whitespace
  pos = skipWhitespace(source, pos);
  
  // Extract false branch (after "else")
  const elseEnd = skipElseKeyword(source, pos);
  if (elseEnd !== -1) {
    pos = skipWhitespace(source, elseEnd);
    let falseBranch;
    if (source[pos] === "{") {
      const endIdx = findMatchingBrace(source, pos);
      falseBranch = source.substring(pos + 1, endIdx);
    } else {
      const exprEnd = skipExpression(source, pos);
      falseBranch = source.substring(pos, exprEnd);
    }
    const transformedFalseBranch = transformBlocks(stripTypedSyntax(stripTypeSuffix(falseBranch.trim())));
    return "(" + transformedCondition + " ? " + transformedTrueBranch + " : " + transformedFalseBranch + ")";
  }
  
  // No else branch - return 0 for false case
  return "(" + transformedCondition + " ? " + transformedTrueBranch + " : 0)";
}

const RUNTIME_HELPERS = String.raw`function read() { return parseInt(_tokens.shift()); }
function _readBool() { var v = _tokens.shift(); return v === 'true' ? 1 : 0; }`;

export function compile(source) {
  if (source === "") {
    return "return 0;";
  }

  validateVarAssignments(source);

  if (!validateSource(source)) {
    throw new Error("Invalid source: " + source);
  }

  const transformed = transformBlocks(source);

  // If top-level has statements, wrap in IIFE with proper returns
  const isStmtLevel = hasStatements(source);
  if (isStmtLevel) {
    const withReturn = prependReturnToLastExpr(transformed);
    return (
      "var _tokens = stdIn.split(/\\s+/);\n" +
      RUNTIME_HELPERS + "\n" +
      "return (function() {" +
      withReturn +
      "; })();"
    );
  }

  return (
    "var _tokens = stdIn.split(/\\s+/);\n" +
    RUNTIME_HELPERS + "\n" +
    "return " +
    transformed +
    ";"
  );
}
