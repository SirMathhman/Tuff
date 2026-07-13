function isAlpha(ch) {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isValidChar(ch) {
  if (ch >= "0" && ch <= "9") return true;
  if (ch >= "a" && ch <= "z") return true;
  if (ch >= "A" && ch <= "Z") return true;
  const allowed = " \t\n\r+-*/(){ };=UI." + String.fromCharCode(60, 62) + ":|[]&";
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

// Skip "while" keyword at position i. Returns end index or -1.
function skipWhileKeyword(source, i) {
  if (source.substring(i, i + 5) === "while" && (i + 5 >= source.length || !isAlpha(source[i + 5]))) {
    return i + 5;
  }
  return -1;
}

// Skip "break" keyword at position i. Returns end index or -1.
function skipBreakKeyword(source, i) {
  if (source.substring(i, i + 5) === "break" && (i + 5 >= source.length || !isAlpha(source[i + 5]))) {
    return i + 5;
  }
  return -1;
}

// Skip "continue" keyword at position i. Returns end index or -1.
function skipContinueKeyword(source, i) {
  if (source.substring(i, i + 8) === "continue" && (i + 8 >= source.length || !isAlpha(source[i + 8]))) {
    return i + 8;
  }
  return -1;
}

// Skip "yield" keyword at position i. Returns end index or -1.
function skipYieldKeyword(source, i) {
  if (source.substring(i, i + 5) === "yield" && (i + 5 >= source.length || !isAlpha(source[i + 5]))) {
    return i + 5;
  }
  return -1;
}

// Skip a yield statement starting at position i. Returns end index or -1.
// Syntax: yield expression;
function skipYieldStatement(source, i) {
  const yieldEnd = skipYieldKeyword(source, i);
  if (yieldEnd === -1) return -1;
  
  let pos = skipWhitespace(source, yieldEnd);
  // Skip expression until semicolon
  const exprEnd = skipExpression(source, pos);
  pos = exprEnd;
  // Skip semicolon
  if (source[pos] === ";") pos++;
  
  return pos;
}

// Skip "struct" keyword at position i. Returns end index or -1.
function skipStructKeyword(source, i) {
  if (source.substring(i, i + 6) === "struct" && (i + 6 >= source.length || !isAlpha(source[i + 6]))) {
    return i + 6; 
  }
  return -1;
}

// Skip a struct declaration starting at position i. Returns end index or -1.
// Syntax: struct Name { field : Type, field : Type }
// Validates that field names are unique within the struct.
function skipStructDeclaration(source, i) {
  const structEnd = skipStructKeyword(source, i);
  if (structEnd === -1) return -1;
  
  let pos = skipWhitespace(source, structEnd);
  // Skip identifier (struct name)
  const identEnd = skipIdentifier(source, pos);
  if (identEnd === -1) return -1;
  
  pos = skipWhitespace(source, identEnd);
  // Skip "{ ... }" block and validate field names
  if (source[pos] !== "{") return -1;
  const endIdx = findMatchingBrace(source, pos);
  const body = source.substring(pos + 1, endIdx);
  validateStructFields(body);
  return endIdx + 1;
}

// Validate struct fields: check for duplicate field names and valid type names. Throws if invalid.
function validateStructFields(body) {
  const fieldNames = new Set();
  let i = 0;
  while (i < body.length) {
    // Skip whitespace and commas
    if (" \t\n\r,".includes(body[i])) { i++; continue; }
    // Skip field identifier
    const identEnd = skipIdentifier(body, i);
    if (identEnd === -1) { i++; continue; }
    const fieldName = body.substring(i, identEnd);
    if (fieldNames.has(fieldName)) {
      throw new Error("Duplicate field name: " + fieldName);
    }
    fieldNames.add(fieldName);
    i = identEnd;
    // Skip to type annotation ": TypeName"
    let pos = skipWhitespace(body, i);
    if (body[pos] !== ":") continue;
    pos = skipWhitespace(body, pos + 1);
    // Extract type name (can start with uppercase U, I, F or lowercase for Bool)
    let typeEnd = pos;
    while (typeEnd < body.length && !", \t\n\r}".includes(body[typeEnd])) typeEnd++;
    if (typeEnd === pos) continue;
    const typeName = body.substring(pos, typeEnd).trim();
    if (typeName.length === 0) continue;
    // Validate type name
    if (getTypeBits(typeName) === -1 && typeName !== "Bool") {
      throw new Error("Unknown type: " + typeName);
    }
    i = typeEnd;
  }
}

// Skip "fn" keyword at position i. Returns end index or -1.
function skipFnKeyword(source, i) {
  if (source.substring(i, i + 2) === "fn" && (i + 2 >= source.length || !isAlpha(source[i + 2]))) {
    return i + 2;
  }
  return -1;
}

// Skip a function declaration starting at position i. Returns end index or -1.
// Syntax: fn name(param : Type) => expression;  or  fn name() => expression;
function skipFnDeclaration(source, i) {
  const fnEnd = skipFnKeyword(source, i);
  if (fnEnd === -1) return -1;
  
  let pos = skipWhitespace(source, fnEnd);
  // Skip identifier (function name)
  const identEnd = skipIdentifier(source, pos);
  if (identEnd === -1) return -1;
  
  pos = identEnd;
  // Skip "(params)"
  if (source[pos] !== "(") return -1;
  pos++;
  // Skip parameters (identifier, optional ": Type", optional ",")
  pos = skipParams(source, pos);
  if (pos === -1) return -1;
  
  pos = skipWhitespace(source, pos);
  // Skip optional return type annotation ": Type"
  const annotEnd = skipTypeAnnotation(source, pos);
  if (annotEnd !== -1) { pos = annotEnd; }
  
  pos = skipWhitespace(source, pos);
  // Skip "=>"
  if (source.substring(pos, pos + 2) !== "=>") return -1;
  pos += 2;
  
  pos = skipWhitespace(source, pos);
  // Skip expression until semicolon (handles if/else, while, blocks)
  const exprEnd = skipToSemicolonWithIfElse(source, pos);
  pos = exprEnd;
  // Skip semicolon
  if (source[pos] === ";") pos++;
  
  return pos;
}

// Skip "for" keyword at position i. Returns end index or -1.
function skipForKeyword(source, i) {
  if (source.substring(i, i + 3) === "for" && (i + 3 >= source.length || !isAlpha(source[i + 3]))) {
    return i + 3;
  }
  return -1;
}

// Skip a for loop starting at position i. Returns end index or -1.
function skipForLoop(source, i) {
  const forEnd = skipForKeyword(source, i);
  if (forEnd === -1) return -1;
  
  let pos = skipWhitespace(source, forEnd);
  if (source[pos] !== "(") return -1;
  
  pos = skipParenthesizedCondition(source, pos + 1);
  pos = skipWhitespace(source, pos);
  pos = skipBranch(source, pos);
  return pos;
}

// Skip past a parenthesized condition starting at the opening '('. Returns index after closing ')'.
function skipParenthesizedCondition(source, start) {
  let parenDepth = 1;
  let pos = start;
  while (pos < source.length && parenDepth > 0) {
    if (source[pos] === "(") { parenDepth++; pos++; continue; }
    if (source[pos] === ")") { parenDepth--; pos++; continue; }
    pos++;
  }
  return pos;
}

// Skip a branch (block or expression) at position i. Returns end index.
function skipBranch(source, i) {
  if (source[i] === "{") return findMatchingBrace(source, i) + 1;
  return skipExpression(source, i);
}

// Skip a while loop starting at position i. Returns end index or -1.
function skipWhileLoop(source, i) {
  const whileEnd = skipWhileKeyword(source, i);
  if (whileEnd === -1) return -1;
  
  let pos = skipWhitespace(source, whileEnd);
  if (source[pos] !== "(") return -1;
  
  pos = skipParenthesizedCondition(source, pos + 1);
  pos = skipWhitespace(source, pos);
  pos = skipBranch(source, pos);
  return pos;
}

// Skip an if/else expression starting at position i. Returns end index or -1.
function skipIfElseExpression(source, i) {
  let pos = skipWhitespace(source, i);
  const ifEnd = skipIfKeyword(source, pos);
  if (ifEnd === -1) return -1;
  
  pos = skipWhitespace(source, ifEnd);
  if (source[pos] !== "(") return -1;
  
  pos = skipParenthesizedCondition(source, pos + 1);
  pos = skipWhitespace(source, pos);
  pos = skipBranch(source, pos);
  // Skip past semicolon if present (e.g., "if (c) break; else ...")
  pos = skipWhitespace(source, pos);
  if (source[pos] === ";") pos++;
  pos = skipWhitespace(source, pos);
  
  const elseEnd = skipElseKeyword(source, pos);
  if (elseEnd === -1) return pos;
  
  pos = skipWhitespace(source, elseEnd);
  pos = skipBranch(source, pos);
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
    if (source[i] === "[") { i = findMatchingBracket(source, i) + 1; continue; }
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

// Skip a type annotation like ": U8" or ": I16" or ": [I32; 2]", returns new index
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
  // Array type annotation: [Type; size]
  if (j < source.length && source[j] === "[") {
    return findMatchingBracket(source, j) + 1;
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

// Skip array indexing brackets after an identifier. Returns new index.
function skipArrayIndexing(source, start) {
  let i = start;
  while (i < source.length && source[i] === "[") {
    i = findMatchingBracket(source, i) + 1;
  }
  return i;
}

// Skip ".length" property access at position i. Returns end index or -1.
function skipDotLength(source, i) {
  if (source.substring(i, i + 7) === ".length" && (i + 7 >= source.length || !isAlpha(source[i + 7]))) {
    return i + 7;
  }
  return -1;
}

// Try to skip identifier if preceded by ; or = (ignoring whitespace), returns new index or -1
// Also handles array indexing: identifier[expr] and .length property access
function maybeSkipIdentifier(source, i) {
  if (!isAlpha(source[i])) return -1;
  let j = i - 1;
  while (j >= 0 && isValidChar(source[j]) === true && !isAlpha(source[j])) {
    const ch = source[j];
    if (ch === ";" || ch === "=" || ch === "]" || ch === ")" || ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "<" || ch === ">" || ch === "|" || ch === "&") {
      let identEnd = skipIdentifier(source, i);
      identEnd = skipArrayIndexing(source, identEnd);
      // Also skip .length if present
      identEnd = skipDotLength(source, identEnd) !== -1 ? skipDotLength(source, identEnd) : identEnd;
      return identEnd;
    }
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
    // Skip array literals entirely
    const isArrayLiteral = source[i] === "[";
    if (isArrayLiteral) {
      const endIdx = findMatchingBracket(source, i);
      i = endIdx + 1;
      continue;
    }
    // Try break keyword
    const breakEnd = skipBreakKeyword(source, i);
    if (breakEnd !== -1) {
      i = breakEnd;
      continue;
    }
    // Try continue keyword
    const continueEnd = skipContinueKeyword(source, i);
    if (continueEnd !== -1) {
      i = continueEnd;
      continue;
    }
    // Try yield statement
    const yieldEnd = skipYieldStatement(source, i);
    if (yieldEnd !== -1) {
      i = yieldEnd;
      continue;
    }
    // Try struct declaration
    const structEnd = skipStructDeclaration(source, i);
    if (structEnd !== -1) {
      i = structEnd;
      continue;
    }
    // Try function declaration
    const fnEnd = skipFnDeclaration(source, i);
    if (fnEnd !== -1) {
      i = fnEnd;
      continue;
    }
    // Try for loop
    const forEnd = skipForLoop(source, i);
    if (forEnd !== -1) {
      i = forEnd;
      continue;
    }
    // Try while loop
    const whileEnd = skipWhileLoop(source, i);
    if (whileEnd !== -1) {
      i = whileEnd;
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

// Find the matching ']' for '[' at position start. Returns index of ']'.
function findMatchingBracket(source, start) {
  let depth = 1;
  let i = start + 1;
  while (depth > 0 && i < source.length) {
    if (source[i] === "[") depth++;
    else if (source[i] === "]") depth--;
    i++;
  }
  return i - 1; // index of matching ']'
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

// Try to detect a function declaration ending near position j and return the start index, or -1.
function tryFindFunctionDeclaration(transformedInner, j) {
  const funcKeyword = "function ";
  for (let k = j; k >= 0; k--) {
    if (k + funcKeyword.length > j + 1) continue;
    if (transformedInner.substring(k, k + funcKeyword.length) !== funcKeyword) continue;
    const braceStart = transformedInner.indexOf("{", k + funcKeyword.length);
    if (braceStart === -1 || braceStart > j) continue;
    const endIdx = findMatchingBrace(transformedInner, braceStart);
    if (endIdx <= j) continue;
    return k;
  }
  return -1;
}

// Process a single character in prependReturnToLastExpr. Returns {j, depth, parenDepth} or null if found semicolon.
function processChar(transformedInner, j, depth, parenDepth) {
  const ch = transformedInner[j];
  if (ch === "}") {
    // Check if this is part of a function declaration
    const fnStart = tryFindFunctionDeclaration(transformedInner, j);
    if (fnStart !== -1) return { j: fnStart - 1, depth, parenDepth };
    return { j, depth: depth + 1, parenDepth };
  }
  if (ch === "{") return { j, depth: depth - 1, parenDepth };
  if (ch === ")") {
    const newParenDepth = parenDepth + 1;
    if (depth !== 0 || newParenDepth !== 1) { return { j, depth, parenDepth: newParenDepth }; }
    const skipped = trySkipIIFE(transformedInner, j);
    if (skipped !== -1) return { j: skipped, depth, parenDepth: 0 };
    return { j, depth, parenDepth: newParenDepth };
  }
  if (ch === "(") return { j, depth, parenDepth: parenDepth - 1 };
  if (ch === ";" && depth === 0 && parenDepth === 0) {
    // If content after semicolon starts with an operator, it's part of a larger expression — skip this semicolon
    let k = j + 1;
    while (k < transformedInner.length && " \t\n\r".includes(transformedInner[k])) k++;
    if (k < transformedInner.length && "+-*/%".includes(transformedInner[k])) return { j, depth, parenDepth };
    return null;
  }
  return { j, depth, parenDepth };
}

// Skip leading function declarations and return the index after them.
function skipLeadingFunctionDeclarations(transformedInner) {
  let i = 0;
  while (i < transformedInner.length) {
    const funcKeyword = "function ";
    if (transformedInner.substring(i, i + funcKeyword.length) !== funcKeyword) break;
    const braceStart = transformedInner.indexOf("{", i + funcKeyword.length);
    if (braceStart === -1) break;
    const endIdx = findMatchingBrace(transformedInner, braceStart);
    i = endIdx + 1;
    i = skipWhitespace(transformedInner, i);
  }
  return i;
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
  // No semicolons found; skip leading function declarations and prepend 'return' to the rest
  const afterFns = skipLeadingFunctionDeclarations(transformedInner);
  const fnDecls = transformedInner.substring(0, afterFns);
  const rest = transformedInner.substring(afterFns);
  return fnDecls + "return " + rest;
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
  const outerTypeStr = source.substring(outerStart, afterColonEnd);

  // Check if this is an array type annotation like [U8; 2]
  const isArrayType = outerTypeStr.startsWith("[");
  const elementType = isArrayType ? extractArrayElementType(outerTypeStr) : outerTypeStr;
  const declaredSize = isArrayType ? extractArrayDeclaredSize(outerTypeStr) : null;

  // Find all read<T>() in RHS and validate against element type (for arrays) or outer type
  let pos = afterColonEnd;
  while (pos < source.length) {
    const semiPos = source.indexOf(";", pos);
    if (semiPos === -1) break;
    validateTypedReadsInRange(source, pos, semiPos, elementType);
    pos = semiPos + 1;
  }

  // Validate array literal size matches declared size
  if (isArrayType && declaredSize !== null) {
    validateArrayLiteralSize(source, afterColonEnd, declaredSize);
    // Also check if RHS is a variable reference to an array and validate size compatibility
    validateArrayVariableAssignment(source, afterColonEnd, declaredSize);
  }
}

// Validate all read<T>() calls in source[pos..end] against the given target type. Throws if incompatible.
function validateTypedReadsInRange(source, pos, end, targetType) {
  for (let p = pos; p < end; p++) {
    if (source.substring(p, p + 5) !== "read<") continue;
    const info = extractTypedReadInfo(source, p);
    if (info) validateTypeCompatibility(info.typeName, targetType);
  }
}

// Extract element type from an array type annotation like "[U8; 2]". Returns type name or null.
function extractArrayElementType(typeStr) {
  // Find first '[' and extract type name before ';'
  let i = typeStr.indexOf("[");
  if (i === -1) return null;
  i++;
  // Skip whitespace
  while (i < typeStr.length && " \t\n\r".includes(typeStr[i])) i++;
  // Read type name (U8, I16, F32, Bool)
  let typeStart = i;
  while (i < typeStr.length && typeStr[i] !== ";" && typeStr[i] !== "]" && !" \t\n\r".includes(typeStr[i])) i++;
  return typeStr.substring(typeStart, i);
}

// Extract declared size from an array type annotation like "[U8; 2]". Returns number or null.
function extractArrayDeclaredSize(typeStr) {
  // Find ';' after type name, then read number before ']'
  let i = typeStr.indexOf(";");
  if (i === -1) return null;
  i++;
  // Skip whitespace
  while (i < typeStr.length && " \t\n\r".includes(typeStr[i])) i++;
  // Read number
  let numStart = i;
  while (i < typeStr.length && typeStr[i] >= "0" && typeStr[i] <= "9") i++;
  const numStr = typeStr.substring(numStart, i);
  return numStr.length > 0 ? parseInt(numStr) : null;
}

// Validate that the array literal on the RHS has the correct number of elements. Throws if mismatch.
function validateArrayLiteralSize(source, afterColonEnd, declaredSize) {
  const rhsInfo = extractRhs(source, afterColonEnd);
  if (!rhsInfo) return;
  // Check if RHS is an array literal
  if (rhsInfo.rhs[0] !== "[") return;
  // Count elements in the array literal by counting top-level commas + 1
  const elementCount = countArrayElements(rhsInfo.rhs);
  if (elementCount !== declaredSize) {
    throw new Error("Array size mismatch: declared " + declaredSize + " but got " + elementCount);
  }
}

// Validate that when assigning an array variable to a typed array, sizes are compatible. Throws if mismatch.
function validateArrayVariableAssignment(source, afterColonEnd, declaredSize) {
  const rhsInfo = extractRhs(source, afterColonEnd);
  if (!rhsInfo) return;
  // Check if RHS is a simple identifier (variable reference)
  let rhsStart = skipWhitespace(source, rhsInfo.eqPos + 1);
  let identEnd = skipIdentifier(source, rhsStart);
  if (identEnd <= rhsStart) return;
  const rhsVarName = source.substring(rhsStart, identEnd);
  if (rhsVarName !== rhsInfo.rhs) return; // not a bare identifier
  // Check if the RHS variable is an array by looking at its declaration
  const rhsArraySize = findArrayVariableSize(source, rhsVarName);
  if (rhsArraySize !== null && rhsArraySize !== declaredSize) {
    throw new Error("Array size mismatch: declared " + declaredSize + " but source has " + rhsArraySize);
  }
}

// Extract the RHS string between '=' and ';' after a given position. Returns {rhs, eqPos, semiPos} or null.
function extractRhs(source, startPos) {
  let eqPos = source.indexOf("=", startPos);
  if (eqPos === -1) return null;
  let semiPos = source.indexOf(";", eqPos);
  if (semiPos === -1) return null;
  let rhsStart = skipWhitespace(source, eqPos + 1);
  return { rhs: source.substring(rhsStart, semiPos).trim(), eqPos, semiPos };
}

// Iterate over all 'let' declarations in source, calling callback with (varName, identEnd, pos) for each.
// Handles both "let x" and "let mut x" declarations.
function forEachLetDeclaration(source, callback) {
  for (let i = 0; i < source.length - 3; i++) {
    if (source.substring(i, i + 4) !== "let ") continue;
    let pos = skipWhitespace(source, i + 4);
    // Skip optional "mut" keyword
    const mutEnd = skipKeywordMut(source, pos);
    if (mutEnd !== -1) pos = mutEnd;
    let identEnd = skipIdentifier(source, pos);
    if (identEnd === -1) continue;
    const name = source.substring(pos, identEnd);
    callback(name, identEnd, i);
  }
}

// Find the declared size of an array variable by scanning its 'let' declaration. Returns size or null.
function findArrayVariableSize(source, varName) {
  let result = null;
  forEachLetDeclaration(source, (name, identEnd, pos) => {
    if (name !== varName) return;
    // Check if this declaration has an array type annotation
    let typePos = skipWhitespace(source, identEnd);
    if (source[typePos] !== ":") {
      const size = countArrayLiteralSize(source, pos + 4);
      if (size !== null) result = size;
      return;
    }
    const annotEnd = skipTypeAnnotation(source, typePos);
    if (annotEnd === -1) return;
    const typeStr = source.substring(typePos + 1, annotEnd).trim();
    if (typeStr.startsWith("[")) result = extractArrayDeclaredSize(typeStr);
  });
  return result;
}

// Count elements in the array literal RHS of a let declaration starting at position i. Returns count or null.
function countArrayLiteralSize(source, i) {
  let eqPos = source.indexOf("=", i);
  if (eqPos === -1) return null;
  let semiPos = source.indexOf(";", eqPos);
  if (semiPos === -1) return null;
  let rhsStart = skipWhitespace(source, eqPos + 1);
  if (source[rhsStart] !== "[") return null;
  return countArrayElements(source.substring(rhsStart, semiPos));
}

// Count elements in an array literal string like "[a, b, c]". Returns count.
function countArrayElements(arrayStr) {
  let count = 0;
  let depth = 0;
  for (let i = 0; i < arrayStr.length; i++) {
    if (arrayStr[i] === "[") depth++;
    else if (arrayStr[i] === "]") depth--;
    else if (arrayStr[i] === "," && depth === 1) count++;
  }
  return count + 1;
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

// Like skipToSemicolon but properly handles if/else expressions, while loops, and blocks
function skipToSemicolonWithIfElse(source, start) {
  let j = start;
  while (j < source.length && source[j] !== ";") {
    // Handle while loops
    const whileEnd = skipWhileLoop(source, j);
    if (whileEnd !== -1) {
      j = whileEnd;
      continue;
    }
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
    // Handle array literals
    if (source[j] === "[") {
      const endIdx = findMatchingBracket(source, j);
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
// Set of built-in identifiers that are always valid.
const BUILTINS = new Set(["read", "true", "false", "mut", "in", "yield", "break", "continue", "return", "length"]);

// Scan struct fields and add them to declaredVars set.
function scanStructFields(body, declaredVars) {
  let j = 0;
  while (j < body.length) {
    if (" \t\n\r,".includes(body[j])) { j++; continue; }
    const fieldEnd = skipIdentifier(body, j);
    if (fieldEnd === -1) { j++; continue; }
    declaredVars.add(body.substring(j, fieldEnd));
    j = fieldEnd;
  }
}

// Skip a single parameter (identifier + optional type annotation). Returns new position or -1.
function skipParam(source, pos) {
  const paramEnd = skipIdentifier(source, pos);
  if (paramEnd === -1) return -1;
  pos = skipWhitespace(source, paramEnd);
  const annotEnd = skipTypeAnnotation(source, pos);
  if (annotEnd !== -1) pos = annotEnd;
  return skipWhitespace(source, pos);
}

// Skip parameters in parentheses, returning position after closing ")". Returns -1 on failure.
function skipParams(source, start) {
  let pos = start;
  while (pos < source.length && source[pos] !== ")") {
    pos = skipWhitespace(source, pos);
    if (source[pos] === ",") { pos++; continue; }
    const nextPos = skipParam(source, pos);
    if (nextPos === -1) return -1;
    pos = nextPos;
  }
  if (pos >= source.length || source[pos] !== ")") return -1;
  return pos + 1;
}

// Scan function parameters and add them to declaredVars set.
function scanFunctionParams(source, start, declaredVars) {
  let pos = start;
  while (pos < source.length && source[pos] !== ")") {
    pos = skipWhitespace(source, pos);
    if (source[pos] === ",") { pos++; continue; }
    const paramEnd = skipIdentifier(source, pos);
    if (paramEnd === -1) break;
    declaredVars.add(source.substring(pos, paramEnd));
    pos = skipParam(source, pos);
    if (pos === -1) break;
  }
}

// Validate that all identifier references are declared variables, functions, or built-ins. Throws if not.
function validateIdentifiers(source, declaredVars, declaredFns) {
  let i = 0;
  while (i < source.length) {
    if (!isAlpha(source[i])) { i++; continue; }
    const identEnd = skipIdentifier(source, i);
    if (identEnd === -1) { i++; continue; }
    const name = source.substring(i, identEnd);
    // Skip keywords and built-ins
    if (BUILTINS.has(name)) { i = identEnd; continue; }
    // Skip "let", "fn", "struct", "if", "else", "while", "for" keywords
    if (name === "let" || name === "fn" || name === "struct" || name === "if" || name === "else" || name === "while" || name === "for") { i = identEnd; continue; }
    // Skip type names (U, I, F followed by digits, or Bool)
    if ((name[0] === "U" || name[0] === "I" || name[0] === "F") && identEnd < source.length && source[identEnd] >= "0" && source[identEnd] <= "9") { i = identEnd; continue; }
    if (name === "Bool") { i = identEnd; continue; }
    // Skip if this is a declaration (let x = ... or fn name ...)
    if (i > 0 && source.substring(i - 4, i) === "let ") { i = identEnd; continue; }
    if (i > 0 && source.substring(i - 2, i) === "fn ") { i = identEnd; continue; }
    if (i > 0 && source.substring(i - 6, i) === "struct ") { i = identEnd; continue; }
    // Skip if preceded by "mut " (let mut x)
    if (i > 0 && source.substring(i - 4, i) === "mut ") { i = identEnd; continue; }
    // Check if identifier is declared
    if (!declaredVars.has(name) && !declaredFns.has(name)) {
      throw new Error("Unknown identifier: " + name);
    }
    i = identEnd;
  }
}

function validateVarAssignments(source) {
  const varTypes = buildVarTypeMap(source);
  
  // Build a set of declared variables and functions
  const declaredVars = new Set();
  const declaredFns = new Set();
  forEachLetDeclaration(source, (varName) => { declaredVars.add(varName); });
  // Scan for function declarations and their parameters
  for (let i = 0; i < source.length - 3; i++) {
    if (source.substring(i, i + 3) !== "fn ") continue;
    let pos = skipWhitespace(source, i + 3);
    const identEnd = skipIdentifier(source, pos);
    if (identEnd === -1) continue;
    declaredFns.add(source.substring(pos, identEnd));
    // Scan parameters in parentheses
    pos = identEnd;
    if (source[pos] !== "(") continue;
    scanFunctionParams(source, pos + 1, declaredVars);
  }
  // Scan for struct declarations and their field names
  for (let i = 0; i < source.length - 6; i++) {
    if (source.substring(i, i + 7) !== "struct ") continue;
    let pos = skipWhitespace(source, i + 7);
    const identEnd = skipIdentifier(source, pos);
    if (identEnd === -1) continue;
    declaredVars.add(source.substring(pos, identEnd));
    // Scan fields in braces
    pos = skipWhitespace(source, identEnd);
    if (source[pos] !== "{") continue;
    const endIdx = findMatchingBrace(source, pos);
    const body = source.substring(pos + 1, endIdx);
    scanStructFields(body, declaredVars);
  }
  
  // Scan for for-loop variable declarations: for (i in ...)
  for (let i = 0; i < source.length - 3; i++) {
    if (source.substring(i, i + 3) !== "for") continue;
    let pos = skipWhitespace(source, i + 3);
    if (source[pos] !== "(") continue;
    pos++;
    // Find " in " to get the loop variable
    const inIdx = source.indexOf(" in ", pos);
    if (inIdx === -1) continue;
    // Extract variable name before " in "
    let varEnd = inIdx;
    while (varEnd > pos && " \t\n\r".includes(source[varEnd - 1])) varEnd--;
    let varStart = varEnd;
    while (varStart > pos && isAlpha(source[varStart - 1])) varStart--;
    if (varStart < varEnd) {
      declaredVars.add(source.substring(varStart, varEnd));
    }
  }
  
  // Check all identifier references are declared or built-in
  validateIdentifiers(source, declaredVars, declaredFns);
  
  // Build a set of immutable variables (declared without "mut") and check typed declarations in one pass
  const immutables = new Set();
  forEachLetDeclaration(source, (varName, identEnd, pos) => {
    // Check if this declaration has "mut" keyword
    let afterLet = skipWhitespace(source, pos + 4);
    const mutEnd = skipKeywordMut(source, afterLet);
    if (mutEnd !== -1) return; // mutable variable, skip
    immutables.add(varName);
    
    // Check type annotation on this declaration for compatibility with RHS variable types
    let typePos = skipWhitespace(source, identEnd);
    if (source[typePos] !== ":") return;
    
    const annotEnd = skipTypeAnnotation(source, typePos);
    if (annotEnd === -1) return;
    
    // Get target type and RHS variable name
    const targetTypeName = source.substring(typePos + 1, annotEnd).trim();
    let eqPos2 = source.indexOf("=", pos + 4);
    if (eqPos2 === -1) return;
    
    let rhsStart = skipWhitespace(source, eqPos2 + 1);
    const semiPos2 = source.indexOf(";", eqPos2);
    const endBound = semiPos2 === -1 ? source.length : semiPos2;
    
    // Check if RHS is a simple identifier reference to another variable
    let rhsIdentEnd = skipIdentifier(source, rhsStart);
    if (rhsIdentEnd <= rhsStart) return;
    
    const rhsVarName = source.substring(rhsStart, rhsIdentEnd);
    const rhsTrimmed = source.substring(rhsStart, endBound).trim();
    if (rhsVarName !== rhsTrimmed) return; // not a bare identifier
    
    const srcTypeName = varTypes[rhsVarName];
    if (!srcTypeName || !targetTypeName) return;
    
    validateTypeCompatibility(srcTypeName, targetTypeName);
  });
  
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
    // Convert "break" keyword
    const breakEnd = skipBreakKeyword(source, i);
    if (breakEnd !== -1) {
      result += "break";
      i = breakEnd;
      continue;
    }
    // Convert "continue" keyword
    const continueEnd = skipContinueKeyword(source, i);
    if (continueEnd !== -1) {
      result += "continue";
      i = continueEnd;
      continue;
    }
    // Convert "yield expr;" -> "return expr;" and skip rest of block
    const yieldEnd = skipYieldKeyword(source, i);
    if (yieldEnd !== -1) {
      let pos = skipWhitespace(source, yieldEnd);
      const exprEnd = skipExpression(source, pos);
      const expr = source.substring(pos, exprEnd);
      result += "return " + expr;
      pos = exprEnd;
      result += source[pos] === ";" ? ";" : "";
      pos = source[pos] === ";" ? pos + 1 : pos;
      // Skip remaining content until end of block
      i = source.indexOf("}", pos);
      i = i === -1 ? source.length : i;
      continue;
    }
    // Convert boolean literals: true -> 1, false -> 0
    const boolEnd = skipBoolLiteral(source, i);
    if (boolEnd !== -1) {
      result += source.substring(i, boolEnd) === "true" ? "1" : "0";
      i = boolEnd;
      continue;
    }
    // Address-of operator: &x -> "&x", a string literal used as a stable per-name
    // identity token so that &x == &x but &x != &y for distinct variables.
    // Must check after && which is handled by boolean literal conversion
    const isAddressOf = source[i] === "&" && (i + 1 >= source.length || source[i + 1] !== "&");
    if (isAddressOf) {
      const identEnd = skipIdentifier(source, i + 1);
      result += identEnd !== -1 ? '"&' + source.substring(i + 1, identEnd) + '"' : "";
      i = identEnd !== -1 ? identEnd : i + 1;
      continue;
    }
    const isColon = source[i] === ":";
    if (!isColon) { result += source[i]; i++; continue; }
    const annotEnd = skipTypeAnnotation(source, i);
    if (annotEnd !== -1) { i = annotEnd; continue; }
    // Check for array type annotation: : [Type; size]
    let j = i + 1;
    while (j < source.length && " \t\n\r".includes(source[j])) j++;
    if (j < source.length && source[j] === "[") {
      i = findMatchingBracket(source, j) + 1;
      continue;
    }
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


// Check if a let declaration at position i has a range RHS (contains ".."). Returns {varName, startExpr, endExpr, semiPos} or null.
function tryExtractRangeAssignment(source, i) {
  let afterLet = i + 4;
  // Skip optional "mut" keyword
  let j = skipWhitespace(source, afterLet);
  const mutEnd = skipKeywordMut(source, j);
  if (mutEnd !== -1) afterLet = mutEnd;
  
  const identEnd = skipIdentifier(source, afterLet);
  if (identEnd === -1) return null;
  
  const eqPos = source.indexOf("=", identEnd);
  if (eqPos === -1) return null;
  
  const semiPos = source.indexOf(";", eqPos);
  if (semiPos === -1) return null;
  
  const rhs = source.substring(eqPos + 1, semiPos).trim();
  const dotDotIdx = rhs.indexOf("..");
  if (dotDotIdx === -1) return null;
  
  const varName = source.substring(afterLet, identEnd).trim();
  return {
    varName: varName,
    startExpr: rhs.substring(0, dotDotIdx).trim(),
    endExpr: rhs.substring(dotDotIdx + 2).trim(),
    semiPos: semiPos
  };
}

// Strip "mut" keyword from let declarations ("let mut x" -> "var x") and replace "let" with "var"
// Also handle range literals: "let range = 0..read();" -> "var _rangeStart = 0; var _rangeEnd = read();"
function stripMutKeyword(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source.substring(i, i + 4) !== "let ") {
      result += source[i];
      i++;
      continue;
    }
    // Check for range assignment first
    const rangeInfo = tryExtractRangeAssignment(source, i);
    if (rangeInfo) {
      result += "var _" + rangeInfo.varName + "Start = " + rangeInfo.startExpr + "; var _" + rangeInfo.varName + "End = " + rangeInfo.endExpr + "; ";
      i = rangeInfo.semiPos + 1;
      continue;
    }
    
    // Check for "mut" keyword after "let "
    let j = skipWhitespace(source, i + 4);
    const mutEnd = skipKeywordMut(source, j);
    if (mutEnd !== -1) {
      result += "var ";
      i = mutEnd;
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


// Transform struct field assignments inside {{} into JS object properties.
// "field : 100, other : read()" -> "field: 100, other: read()"
function transformStructFields(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (" \t\n\r,".includes(source[i])) { i++; continue; }
    // Extract field name
    const fieldEnd = skipIdentifier(source, i);
    if (fieldEnd === -1) { i++; continue; }
    const fieldName = source.substring(i, fieldEnd);
    result += fieldName;
    let pos = skipWhitespace(source, fieldEnd);
    // Skip ": " separator (field : value)
    if (source[pos] === ":") pos++;
    pos = skipWhitespace(source, pos);
    // Find value expression (until comma or end)
    let valEnd = pos;
    while (valEnd < source.length && source[valEnd] !== ",") valEnd++;
    const value = source.substring(pos, valEnd);
    result += ":" + transformBlocks(stripTypedSyntax(stripTypeSuffix(value)));
    i = valEnd;
  }
  return result;
}

function transformBlocks(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    // Check for struct declaration
    const structEnd = skipStructKeyword(source, i);
    if (structEnd !== -1) {
      const nextI = skipStructDeclaration(source, i);
      result += "0; ";
      i = nextI === -1 ? source.length : nextI;
      continue;
    }
    // Check for function declaration
    const fnEnd = skipFnKeyword(source, i);
    if (fnEnd !== -1) {
      result += transformFnDeclaration(source, i);
      const nextI = skipFnDeclaration(source, i);
      i = nextI === -1 ? source.length : nextI;
      continue;
    }
    // Check for for loop
    const forEnd = skipForKeyword(source, i);
    if (forEnd !== -1) {
      result += transformForLoop(source, i);
      const nextI = skipForLoop(source, i);
      i = nextI === -1 ? source.length : nextI;
      continue;
    }
    // Check for while loop
    const whileEnd = skipWhileKeyword(source, i);
    if (whileEnd !== -1) {
      result += transformWhileLoop(source, i);
      const nextI = skipWhileLoop(source, i);
      i = nextI === -1 ? source.length : nextI;
      continue;
    }
    // Check for if/else expression
    const ifEnd = skipIfKeyword(source, i);
    if (ifEnd !== -1) {
      result += transformIfElse(source, i);
      const nextI = skipIfElseExpression(source, i);
      i = nextI === -1 ? source.length : nextI;
      continue;
    }
    if (source[i] === "[") {
      // Transform array literal: [a, b, c] -> [transformed_a, transformed_b, transformed_c]
      const endIdx = findMatchingBracket(source, i);
      const inner = source.substring(i + 1, endIdx);
      const transformedInner = transformBlocks(stripTypedSyntax(stripTypeSuffix(inner)));
      result += "[" + transformedInner + "]";
      i = endIdx + 1;
      continue;
    }
    if (source[i] !== "{") {
      result += source[i];
      i++;
      continue;
    }
    // Check for struct instantiation: identifier followed by { ... }
    // Look back in result to see if it ends with an identifier
    let resultTrimEnd = result.length;
    while (resultTrimEnd > 0 && " \t\n\r".includes(result[resultTrimEnd - 1])) resultTrimEnd--;
    let identEndInResult = resultTrimEnd;
    let identStartInResult = identEndInResult;
    while (identStartInResult > 0 && isAlpha(result[identStartInResult - 1])) identStartInResult--;
    const hasStructType = identEndInResult > identStartInResult;
    const endIdx = findMatchingBrace(source, i);
    if (hasStructType) {
      // Struct instantiation: remove type name, transform inner as JS object
      result = result.substring(0, identStartInResult);
      const structInner = source.substring(i + 1, endIdx);
      const transformedStructInner = transformStructFields(structInner);
      result += "{" + transformedStructInner + "}";
      i = endIdx + 1;
      continue;
    }
    const inner = source.substring(i + 1, endIdx);
    if (hasBreakOrContinue(inner) || hasReturn(inner)) {
      // Blocks with break/continue/return must stay as plain blocks, not IIFEs
      result += "{ " + transformBlocks(stripTypedSyntax(stripTypeSuffix(inner))) + " }";
    } else if (!hasStatements(inner)) {
      result += "(" + transformBlocks(stripTypedSyntax(stripTypeSuffix(inner))) + ")";
    } else if (inner.indexOf("yield") !== -1) {
      // Blocks with yield: wrap as IIFE, yield -> return exits the IIFE
      let transformedInner = transformBlocks(stripTypedSyntax(stripTypeSuffix(inner)));
      result += "(function() {" + transformedInner + "})()";
    } else {
      let transformedInner = transformBlocks(stripTypedSyntax(stripTypeSuffix(inner)));
      const withReturn = prependReturnToLastExpr(transformedInner);
      result += "(function() {" + withReturn + "; })();";
    }
    i = endIdx + 1;
  }
  return stripTypedSyntax(stripTypeSuffix(result));
}

// Extract a parenthesized condition starting at the opening '('. Returns {condition, endPos}.
function extractCondition(source, start) {
  let parenDepth = 1;
  let pos = start;
  while (pos < source.length && parenDepth > 0) {
    if (source[pos] === "(") parenDepth++;
    else if (source[pos] === ")") parenDepth--;
    pos++;
  }
  return { condition: source.substring(start, pos - 1), endPos: pos };
}

// Extract a branch (block or expression) at position i. Returns {content, endPos}.
function extractBranch(source, i) {
  if (source[i] === "{") {
    const endIdx = findMatchingBrace(source, i);
    return { content: source.substring(i + 1, endIdx), endPos: endIdx + 1 };
  }
  const exprEnd = skipExpression(source, i);
  return { content: source.substring(i, exprEnd), endPos: exprEnd };
}

// Check if a source string contains break or continue keywords. Returns true if found.
function hasBreakOrContinue(source) {
  for (let i = 0; i < source.length - 4; i++) {
    if (source.substring(i, i + 5) === "break" && (i + 5 >= source.length || !isAlpha(source[i + 5]))) return true;
    if (source.substring(i, i + 8) === "continue" && (i + 8 >= source.length || !isAlpha(source[i + 8]))) return true;
  }
  return false;
}

// Check if a source string contains the return keyword. Returns true if found.
function hasReturn(source) {
  for (let i = 0; i < source.length - 5; i++) {
    if (source.substring(i, i + 6) === "return" && (i + 6 >= source.length || !isAlpha(source[i + 6]))) return true;
  }
  return false;
}

// Transform an if/else expression to JavaScript ternary: (cond) ? (trueBranch) : (falseBranch)
// If branches contain break/continue, use statement-style output instead.
function transformIfElse(source, start) {
  const ifEnd = skipIfKeyword(source, start);
  let pos = skipWhitespace(source, ifEnd);
  
  const { condition } = extractCondition(source, pos + 1);
  const transformedCondition = transformBlocks(stripTypedSyntax(stripTypeSuffix(condition)));
  
  pos = skipWhitespace(source, pos + (condition.length + 2));
  
  const { content: trueBranch } = extractBranch(source, pos);
  const transformedTrueBranch = transformBlocks(stripTypedSyntax(stripTypeSuffix(trueBranch.trim())));
  
  pos = skipWhitespace(source, pos + trueBranch.length);
  // Skip past semicolon if present (e.g., "if (c) break; else ...")
  if (source[pos] === ";") pos++;
  pos = skipWhitespace(source, pos);
  
  const elseEnd = skipElseKeyword(source, pos);
  if (elseEnd !== -1) {
    pos = skipWhitespace(source, elseEnd);
    const { content: falseBranch } = extractBranch(source, pos);
    const transformedFalseBranch = transformBlocks(stripTypedSyntax(stripTypeSuffix(falseBranch.trim())));
    
    // If either branch contains break/continue/yield, use statement-style output
    if (hasBreakOrContinue(trueBranch) || hasBreakOrContinue(falseBranch) || transformedTrueBranch.indexOf("break") !== -1 || transformedTrueBranch.indexOf("continue") !== -1 || transformedFalseBranch.indexOf("break") !== -1 || transformedFalseBranch.indexOf("continue") !== -1 || transformedTrueBranch.indexOf("return") !== -1 || transformedFalseBranch.indexOf("return") !== -1) {
      const trueBranchStr = transformedTrueBranch.endsWith(";") ? transformedTrueBranch : transformedTrueBranch + ";";
      const falseBranchStr = transformedFalseBranch.endsWith(";") ? transformedFalseBranch : transformedFalseBranch + ";";
      return "if (" + transformedCondition + ") { " + trueBranchStr + " } else { " + falseBranchStr + " }";
    }
    
    return "(" + transformedCondition + " ? " + transformedTrueBranch + " : " + transformedFalseBranch + ")";
  }
  
  // If true branch contains break/continue/yield, use statement-style output
  if (hasBreakOrContinue(trueBranch) || transformedTrueBranch.indexOf("break") !== -1 || transformedTrueBranch.indexOf("continue") !== -1 || transformedTrueBranch.indexOf("return") !== -1) {
    const trueBranchStr = transformedTrueBranch.endsWith(";") ? transformedTrueBranch : transformedTrueBranch + ";";
    return "if (" + transformedCondition + ") { " + trueBranchStr + " }";
  }
  
  return "(" + transformedCondition + " ? " + transformedTrueBranch + " : 0)";
}

// Extract and transform a branch body at position pos. Returns {transformedBody, endPos}.
function extractAndTransformBranch(source, pos) {
  const { content: body } = extractBranch(source, pos);
  const transformedBody = transformBlocks(stripTypedSyntax(stripTypeSuffix(body.trim())));
  return { transformedBody, endPos: pos + body.length };
}

// Transform a while loop to JavaScript: while (cond) { body };
function transformWhileLoop(source, start) {
  const whileEnd = skipWhileKeyword(source, start);
  let pos = skipWhitespace(source, whileEnd);
  
  const { condition } = extractCondition(source, pos + 1);
  const transformedCondition = transformBlocks(stripTypedSyntax(stripTypeSuffix(condition)));
  
  pos = skipWhitespace(source, pos + condition.length + 2);
  const { transformedBody } = extractAndTransformBranch(source, pos);
  
  return "while (" + transformedCondition + ") { " + transformedBody + " };";
}

// Build a map of variable names to their range assignments (start..end). Returns object.
// Uses transformed variable names (_varNameStart, _varNameEnd) to match stripMutKeyword output.
function buildRangeMap(source) {
  const rangeMap = {};
  for (let i = 0; i < source.length - 3; i++) {
    if (source.substring(i, i + 4) !== "let ") continue;
    
    const identEnd = skipIdentifier(source, i + 4);
    if (identEnd === -1) continue;
    
    const varName = source.substring(i + 4, identEnd);
    
    // Find '=' after identifier
    let eqPos = source.indexOf("=", identEnd);
    if (eqPos === -1) continue;
    
    // Find ';' after '='
    let semiPos = source.indexOf(";", eqPos);
    if (semiPos === -1) continue;
    
    // Extract RHS
    const rhs = source.substring(eqPos + 1, semiPos).trim();
    
    // Check if RHS is a range expression (contains ..)
    const dotDotIdx = rhs.indexOf("..");
    if (dotDotIdx === -1) continue;
    
    // Store with transformed variable names
    rangeMap[varName] = { start: "_" + varName + "Start", end: "_" + varName + "End" };
  }
  return rangeMap;
}

// Transform a function declaration to JavaScript: fn name() => expr; -> function name() { return expr; }
function transformFnDeclaration(source, start) {
  const fnEnd = skipFnKeyword(source, start);
  let pos = skipWhitespace(source, fnEnd);
  
  // Extract function name
  const identEnd = skipIdentifier(source, pos);
  const varName = source.substring(pos, identEnd);
  
  pos = identEnd;
  // Extract parameters from "(params)"
  if (source[pos] !== "(") return "";
  pos++;
  const paramsStart = pos;
  while (pos < source.length && source[pos] !== ")") pos++;
  const paramsStr = source.substring(paramsStart, pos).trim();
  pos++; // skip ")"
  
  // Build parameter list (strip type annotations)
  const paramList = stripTypedSyntax(paramsStr).split(",").map(p => p.trim()).filter(p => p.length > 0).join(", ");
  
  pos = skipWhitespace(source, pos);
  // Skip optional return type annotation ": Type"
  const annotEnd = skipTypeAnnotation(source, pos);
  if (annotEnd !== -1) { pos = annotEnd; }
  
  pos = skipWhitespace(source, pos);
  // Skip "=>"
  pos += 2;
  
  pos = skipWhitespace(source, pos);
  // Extract expression until semicolon (handles if/else, while, blocks)
  const exprEnd = skipToSemicolonWithIfElse(source, pos);
  const expr = source.substring(pos, exprEnd);
  
  const transformedExpr = transformBlocks(stripTypedSyntax(stripTypeSuffix(expr.trim())));
  
  // If the body contains return statements, emit body directly without wrapping in return
  if (hasReturn(expr)) {
    return "function " + varName + "(" + paramList + ") { " + transformedExpr + " } ";
  }
  
  return "function " + varName + "(" + paramList + ") { return " + transformedExpr + "; } ";
}

// Transform a for loop with range syntax: for (i in start..end) body
// Lowered to: let mut i = start; while (i < end) { body; i += 1; }
function transformForLoop(source, start) {
  const forEnd = skipForKeyword(source, start);
  let pos = skipWhitespace(source, forEnd);
  
  const { condition: forHeader } = extractCondition(source, pos + 1);
  
  // Parse "i in start..end" from the for header
  const inIdx = forHeader.indexOf(" in ");
  if (inIdx === -1) {
    // Fallback: treat as regular while-like loop
    const transformedCondition = transformBlocks(stripTypedSyntax(stripTypeSuffix(forHeader)));
    pos = skipWhitespace(source, pos + forHeader.length + 2);
    const { transformedBody } = extractAndTransformBranch(source, pos);
    return "while (" + transformedCondition + ") { " + transformedBody + " }";
  }
  
  const varName = forHeader.substring(0, inIdx).trim();
  const rangeExpr = forHeader.substring(inIdx + 4).trim();
  
  // Check if rangeExpr is a variable reference to a range
  const rangeMap = buildRangeMap(source);
  let startExpr, endExpr;
  
  if (rangeMap[rangeExpr]) {
    // Use the range from the variable
    startExpr = rangeMap[rangeExpr].start;
    endExpr = rangeMap[rangeExpr].end;
  } else {
    // Parse "start..end" from range expression
    const dotDotIdx = rangeExpr.indexOf("..");
    if (dotDotIdx === -1) {
      // Fallback without range
      pos = skipWhitespace(source, pos + forHeader.length + 2);
      const { transformedBody } = extractAndTransformBranch(source, pos);
      return "while (1) { " + transformedBody + " }";
    }
    
    startExpr = rangeExpr.substring(0, dotDotIdx).trim();
    endExpr = rangeExpr.substring(dotDotIdx + 2).trim();
  }
  
  const transformedStart = transformBlocks(stripTypedSyntax(stripTypeSuffix(startExpr)));
  const transformedEnd = transformBlocks(stripTypedSyntax(stripTypeSuffix(endExpr)));
  
  pos = skipWhitespace(source, pos + forHeader.length + 2);
  const { transformedBody } = extractAndTransformBranch(source, pos);
  
  return "var " + varName + " = " + transformedStart + "; var _forEnd = " + transformedEnd + "; while (" + varName + " < _forEnd) { " + transformedBody + "; " + varName + " += 1; }";
}

const RUNTIME_HELPERS = String.raw`function read() { return parseInt(_tokens.shift()); }
function _readBool() { var v = _tokens.shift(); return v === 'true' ? 1 : 0; }
function _toInt(v) { return v === true ? 1 : v === false ? 0 : v; }`;

// Strip a single trailing ";" (and any trailing whitespace after it) from source.
function stripTrailingSemicolon(source) {
  let end = source.length;
  while (end > 0 && " \t\n\r".includes(source[end - 1])) end--;
  if (end > 0 && source[end - 1] === ";") end--;
  return source.substring(0, end);
}

export function compile(source) {
  if (source === "") {
    return "return 0;";
  }

  validateVarAssignments(source);

  if (!validateSource(source)) {
    throw new Error("Invalid source: " + source);
  }

  const transformed = transformBlocks(source);

  // If top-level has statements OR contains yield, wrap in IIFE with proper returns
  const isStmtLevel = hasStatements(source) || source.indexOf("yield") !== -1;
  if (isStmtLevel) {
    // yield -> return conversion already handled by transformBlocks, so use
    // prependReturnToLastExpr which correctly skips leading function declarations
    const withReturn = prependReturnToLastExpr(transformed);
    return (
      "var _tokens = stdIn.split(/\\s+/);\n" +
      RUNTIME_HELPERS + "\n" +
      "return _toInt((function() {" +
      withReturn +
      "; })());"
    );
  }

  // transformBlocks() can leave a trailing ";" from struct declarations or
  // block IIFEs (harmless when concatenated after "return X;", but invalid
  // once wrapped as an argument to _toInt(...)) — strip it before wrapping.
  const transformedExpr = stripTrailingSemicolon(transformed);

  return (
    "var _tokens = stdIn.split(/\\s+/);\n" +
    RUNTIME_HELPERS + "\n" +
    "return _toInt(" +
    transformedExpr +
    ");"
  );
}
