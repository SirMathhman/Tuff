/* eslint-disable no-unused-vars */
type Variable = { type: "variable"; value: number; mutable: boolean };
type FunctionDef = {
  type: "function";
  params: string[];
  body: string;
  bodyPos: number;
};
type ArrayDef = { type: "array"; elements: number[] };
type StringDef = { type: "string"; value: string };
type StructDef = {
  type: "structDef";
  fields: string[];
  body: string;
  bodyPos: number;
};
type StructInstance = {
  type: "structInstance";
  structName: string;
  fieldValues: Record<string, number>;
};
type EnvEntry =
  | Variable
  | FunctionDef
  | ArrayDef
  | StringDef
  | StructDef
  | StructInstance;
type Env = Record<string, EnvEntry>;

type ParserFn = (_source: string, _pos: number, _env: Env) => ParserResult;

type ConditionParserFn = (
  _source: string,
  _pos: number,
  _env: Env,
) => { condition: number; pos: number } | null;

type ParserResult = { value: number; pos: number };
/* eslint-enable no-unused-vars */

function parseNumericLiteral(
  source: string,
  start: number,
): { value: number; end: number } | null {
  let numEnd = start;
  while (
    numEnd < source.length &&
    source.charCodeAt(numEnd) >= 48 && // '0'
    source.charCodeAt(numEnd) <= 57 // '9'
  ) {
    numEnd++;
  }
  if (numEnd <= start) {
    return null;
  }
  // Skip type suffix (e.g., "U8", "I32")
  let suffixEnd = numEnd;
  while (
    suffixEnd < source.length &&
    ((source.charCodeAt(suffixEnd) >= 65 &&
      source.charCodeAt(suffixEnd) <= 90) || // 'A'-'Z'
      (source.charCodeAt(suffixEnd) >= 97 &&
        source.charCodeAt(suffixEnd) <= 122) || // 'a'-'z'
      (source.charCodeAt(suffixEnd) >= 48 &&
        source.charCodeAt(suffixEnd) <= 57)) // '0'-'9'
  ) {
    suffixEnd++;
  }
  return {
    value: parseInt(source.substring(start, numEnd), 10),
    end: suffixEnd,
  };
}

function parseCharacterLiteral(
  source: string,
  start: number,
): { value: number; end: number } | null {
  // Check for opening single quote
  if (source.charCodeAt(start) !== 39) {
    // "'"
    return null;
  }

  let charIndex = start + 1;

  // Handle escape sequences
  let charCode = 0;
  if (source.charCodeAt(charIndex) === 92) {
    // '\' - escape sequence
    charIndex++;
    const escapeChar = source.charCodeAt(charIndex);
    if (escapeChar === 110) {
      // 'n' - newline
      charCode = 10;
    } else if (escapeChar === 116) {
      // 't' - tab
      charCode = 9;
    } else if (escapeChar === 114) {
      // 'r' - carriage return
      charCode = 13;
    } else if (escapeChar === 92) {
      // '\' - backslash
      charCode = 92;
    } else if (escapeChar === 39) {
      // "'" - single quote
      charCode = 39;
    } else {
      // Unknown escape, treat as the character itself
      charCode = escapeChar;
    }
    charIndex++;
  } else {
    // Regular character
    charCode = source.charCodeAt(charIndex);
    charIndex++;
  }

  // Check for closing single quote
  if (source.charCodeAt(charIndex) !== 39) {
    // "'"
    return null;
  }

  return {
    value: charCode,
    end: charIndex + 1,
  };
}

function parseStringLiteral(
  source: string,
  start: number,
): { value: string; end: number } | null {
  // Check for opening double quote
  if (source.charCodeAt(start) !== 34) {
    // '"'
    return null;
  }

  let stringIndex = start + 1;
  let result = "";

  // Parse string content until closing quote
  while (stringIndex < source.length && source.charCodeAt(stringIndex) !== 34) {
    // '"'
    if (source.charCodeAt(stringIndex) === 92) {
      // '\' - escape sequence
      stringIndex++;
      const escapeChar = source.charCodeAt(stringIndex);
      if (escapeChar === 110) {
        // 'n' - newline
        result += "\n";
      } else if (escapeChar === 116) {
        // 't' - tab
        result += "\t";
      } else if (escapeChar === 114) {
        // 'r' - carriage return
        result += "\r";
      } else if (escapeChar === 92) {
        // '\' - backslash
        result += "\\";
      } else if (escapeChar === 34) {
        // '"' - double quote
        result += '"';
      } else {
        // Unknown escape, treat as the character itself
        result += String.fromCharCode(escapeChar);
      }
      stringIndex++;
    } else {
      // Regular character
      result += String.fromCharCode(source.charCodeAt(stringIndex));
      stringIndex++;
    }
  }

  // Check for closing double quote
  if (source.charCodeAt(stringIndex) !== 34) {
    // '"'
    return null;
  }

  return {
    value: result,
    end: stringIndex + 1,
  };
}

function parseIdentifier(
  source: string,
  start: number,
): { name: string; end: number } | null {
  let end = start;
  while (
    end < source.length &&
    ((source.charCodeAt(end) >= 97 && source.charCodeAt(end) <= 122) || // 'a'-'z'
      (source.charCodeAt(end) >= 65 && source.charCodeAt(end) <= 90) || // 'A'-'Z'
      (source.charCodeAt(end) >= 48 && source.charCodeAt(end) <= 57) || // '0'-'9'
      source.charCodeAt(end) === 95) // '_'
  ) {
    end++;
  }
  if (end <= start) {
    return null;
  }
  return {
    name: source.substring(start, end),
    end,
  };
}

function skipKeyword(
  source: string,
  start: number,
  keyword: string,
): number | null {
  const identifierResult = parseIdentifier(source, start);
  if (identifierResult && identifierResult.name === keyword) {
    return identifierResult.end;
  }
  return null;
}

function skipWhitespace(source: string, pos: number): number {
  while (pos < source.length && source.charCodeAt(pos) === 32) {
    // ' '
    pos++;
  }
  return pos;
}

function skipSemicolonAndWhitespace(source: string, pos: number): number {
  // Skip ';' if present
  if (source.charCodeAt(pos) === 59) {
    // ';'
    pos = pos + 1;
  }
  return skipWhitespace(source, pos);
}

// Helper for left-recursive binary operator parsing
function parseBinaryOperator(
  source: string,
  pos: number,
  env: Env,
  operandParser: ParserFn,
  operatorCodes: Array<number | number[]>,
  // eslint-disable-next-line no-unused-vars
  operators: Array<(left: number, right: number) => number>,
): ParserResult {
  const left = operandParser(source, pos, env);
  let result = left.value;
  pos = left.pos;

  while (pos < source.length) {
    const savedPos = pos;
    pos = skipWhitespace(source, pos);
    const charCode = source.charCodeAt(pos);

    let handlerIndex = -1;

    for (let i = 0; i < operatorCodes.length; i++) {
      const code = operatorCodes[i];
      if (Array.isArray(code)) {
        // Multi-character operator (e.g., [38, 38] for &&)
        if (charCode === code[0] && source.charCodeAt(pos + 1) === code[1]) {
          handlerIndex = i;
          pos = pos + code.length;
          break;
        }
      } else {
        // Single-character operator
        if (charCode === code) {
          handlerIndex = i;
          pos = pos + 1;
          break;
        }
      }
    }

    if (handlerIndex === -1) {
      pos = savedPos;
      break;
    }

    pos = skipWhitespace(source, pos);
    const right = operandParser(source, pos, env);
    const handler = operators[handlerIndex];
    if (handler) {
      result = handler(result, right.value);
    }
    pos = right.pos;
  }

  return { value: result, pos };
}

function parseIfCondition(
  source: string,
  pos: number,
  env: Env,
): { condition: number; pos: number } | null {
  pos = skipWhitespace(source, pos);

  // Parse condition in parentheses
  if (source.charCodeAt(pos) === 40) {
    // '('
    pos = skipWhitespace(source, pos + 1);
    const condResult = parseLogicalOr(source, pos, env);
    const condition = condResult.value;
    pos = skipWhitespace(source, condResult.pos);

    if (source.charCodeAt(pos) === 41) {
      // ')'
      pos = pos + 1;
    }
    pos = skipWhitespace(source, pos);

    return { condition, pos };
  }

  return null;
}

function getIfConditionAndPos(
  source: string,
  pos: number,
  env: Env,
): { condition: number; pos: number } | null {
  const condResult = parseIfCondition(source, pos, env);
  if (!condResult) {
    return null;
  }

  const { condition, pos: afterCond } = condResult;
  return { condition, pos: afterCond };
}

function parseIfConditional(
  source: string,
  pos: number,
  env: Env,
  branchParser: ParserFn,
): ParserResult {
  const condAndPos = getIfConditionAndPos(source, pos, env);
  if (!condAndPos) {
    return { value: 0, pos };
  }

  const { condition, pos: afterCond } = condAndPos;
  pos = afterCond;

  let result = 0;

  if (condition !== 0) {
    // Execute then branch
    const thenResult = branchParser(source, pos, env);
    result = thenResult.value;
    pos = skipWhitespace(source, thenResult.pos);

    pos = skipSemicolonAndWhitespace(source, pos);

    // Handle else branch (skip it)
    const elseResult = handleElseKeyword(source, pos, env, false, branchParser);
    pos = elseResult.pos;
  } else {
    // Skip then branch without executing it
    pos = skipStatement(source, pos);

    pos = skipSemicolonAndWhitespace(source, pos);

    // Handle else branch (execute it)
    const elseResult = handleElseKeyword(source, pos, env, true, branchParser);
    if (elseResult.foundElse) {
      result = elseResult.value;
    }
    pos = elseResult.pos;
  }

  pos = skipWhitespace(source, pos);
  return { value: result, pos };
}

function parseIfExpression(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseIfConditional(source, pos, env, parseLogicalOr);
}

function checkKeywordControlFlow(
  source: string,
  pos: number,
  env: Env,
  parseIfHandler: ParserFn,
): ParserResult | null {
  // Check for 'struct' keyword
  const structPos = skipKeyword(source, pos, "struct");
  if (structPos !== null) {
    return parseStructDefinition(source, structPos, env);
  }

  // Check for 'fn' keyword
  const fnPos = skipKeyword(source, pos, "fn");
  if (fnPos !== null) {
    return parseFunction(source, fnPos, env);
  }

  // Check for 'let' keyword
  const letPos = skipKeyword(source, pos, "let");
  if (letPos !== null) {
    return parseLetBinding(source, letPos, env);
  }

  // Check for 'if' keyword
  const ifPos = skipKeyword(source, pos, "if");
  if (ifPos !== null) {
    return parseIfHandler(source, ifPos, env);
  }

  return null;
}

function parseParenthesizedExpr(
  source: string,
  pos: number,
  env: Env,
  exprParser: ParserFn,
): ParserResult | null {
  pos = skipWhitespace(source, pos);

  if (source.charCodeAt(pos) !== 40) {
    // '('
    return null;
  }
  pos = skipWhitespace(source, pos + 1);

  const result = exprParser(source, pos, env);
  pos = skipWhitespace(source, result.pos);

  if (source.charCodeAt(pos) === 41) {
    // ')'
    pos = pos + 1;
  }

  return { value: result.value, pos };
}

function parseMatch(source: string, pos: number, env: Env): ParserResult {
  // Parse the value to match in parentheses
  const parenResult = parseParenthesizedExpr(source, pos, env, parseLogicalOr);
  if (!parenResult) {
    return { value: 0, pos };
  }

  const matchValue = parenResult.value;
  pos = parenResult.pos;

  const bracePos = skipToOpenBrace(source, pos);
  if (bracePos === null) {
    return { value: 0, pos };
  }
  pos = bracePos;

  // Parse cases until closing brace
  let result = 0;
  let foundMatch = false;
  while (pos < source.length && source.charCodeAt(pos) !== 125) {
    // charCode 125 is '}'
    pos = skipWhitespace(source, pos);

    // Check for 'case' keyword
    const casePos = skipKeyword(source, pos, "case");
    if (casePos === null) {
      break;
    }
    pos = skipWhitespace(source, casePos);

    // Parse pattern (either numeric literal or wildcard _)
    let patternMatches = false;

    // Check for wildcard pattern '_'
    if (source.charCodeAt(pos) === 95) {
      // '_'
      patternMatches = !foundMatch; // Only matches if nothing else has matched yet
      pos = pos + 1;
    } else {
      // Try to parse numeric literal pattern
      const patternLit = parseNumericLiteral(source, pos);
      if (patternLit) {
        patternMatches = !foundMatch && patternLit.value === matchValue;
        pos = patternLit.end;
      }
    }

    pos = skipWhitespace(source, pos);

    // Expect '=>'
    if (source.charCodeAt(pos) === 61 && source.charCodeAt(pos + 1) === 62) {
      // '=>'
      pos = pos + 2;
    }
    pos = skipWhitespace(source, pos);

    // Parse result expression
    const resultExpr = parseLogicalOr(source, pos, env);
    pos = skipWhitespace(source, resultExpr.pos);

    // If pattern matched, store result and mark as found
    if (patternMatches) {
      result = resultExpr.value;
      foundMatch = true;
    }

    // Skip semicolon
    pos = skipSemicolonAndWhitespace(source, pos);
  }

  // Expect closing brace '}'
  if (source.charCodeAt(pos) === 125) {
    // '}'
    pos = pos + 1;
  }

  return { value: result, pos };
}

function handleIndexing(
  source: string,
  afterIdPos: number,
  env: Env,
  entry: EnvEntry | null,
  // eslint-disable-next-line no-unused-vars
  getValue: (_index: number) => number,
): ParserResult | null {
  if (source.charCodeAt(afterIdPos) !== 91 || !entry) {
    return null;
  }

  // '['
  const indexPos = skipWhitespace(source, afterIdPos + 1);
  const indexResult = parseLogicalOr(source, indexPos, env);
  let endPos = skipWhitespace(source, indexResult.pos);

  // Expect ']'
  if (source.charCodeAt(endPos) === 93) {
    // ']'
    endPos = skipWhitespace(source, endPos + 1);
    const value = getValue(Math.floor(indexResult.value));
    return { value, pos: endPos };
  }

  return null;
}

function parsePrimaryParenOrBlock(
  source: string,
  pos: number,
  env: Env,
): ParserResult | null {
  // Check for opening parenthesis
  const parenResult = parseParenthesizedExpr(source, pos, env, parseAdditive);
  if (parenResult !== null) {
    return parenResult;
  }

  // Check for opening curly brace
  if (source.charCodeAt(pos) === 123) {
    // '{'
    let currentPos = skipWhitespace(source, pos + 1);
    const result = parseBlock(source, currentPos, env);
    currentPos = skipWhitespace(source, result.pos);
    if (source.charCodeAt(currentPos) === 125) {
      // '}'
      currentPos = currentPos + 1;
    }
    return { value: result.value, pos: currentPos };
  }

  return null;
}

function parsePrimaryControlFlow(
  source: string,
  pos: number,
  env: Env,
): ParserResult | null {
  return checkKeywordControlFlow(source, pos, env, parseIfExpression);
}

function parsePrimaryMatchOrBoolean(
  source: string,
  pos: number,
  env: Env,
): ParserResult | null {
  const matchPos = skipKeyword(source, pos, "match");
  if (matchPos !== null) {
    return parseMatch(source, matchPos, env);
  }

  const truePos = skipKeyword(source, pos, "true");
  if (truePos !== null) {
    return { value: 1, pos: truePos };
  }

  const falsePos = skipKeyword(source, pos, "false");
  if (falsePos !== null) {
    return { value: 0, pos: falsePos };
  }

  return null;
}

function parsePrimaryIdentifier(
  source: string,
  pos: number,
  env: Env,
): ParserResult | null {
  const identifier = parseIdentifier(source, pos);
  if (!identifier) {
    return null;
  }

  const afterIdPos = skipWhitespace(source, identifier.end);
  const entry = identifier.name in env ? env[identifier.name]! : null;
  if (!entry) {
    return null;
  }

  if (
    source.charCodeAt(afterIdPos) === 40 &&
    entry &&
    entry.type === "function"
  ) {
    const fnEntry = entry as FunctionDef;
    const result = parseFunctionCall(source, afterIdPos, env, fnEntry);
    return { value: result.value, pos: result.pos };
  }

  if (entry && entry.type === "variable") {
    return { value: entry.value, pos: identifier.end };
  }

  if (entry && entry.type === "structInstance") {
    let currentPos = identifier.end;
    currentPos = skipWhitespace(source, currentPos);
    if (source.charCodeAt(currentPos) === 46) {
      const fieldNamePos = skipWhitespace(source, currentPos + 1);
      const fieldName = parseIdentifier(source, fieldNamePos);
      if (fieldName) {
        const structInst = entry as StructInstance;
        const value = structInst.fieldValues[fieldName.name] ?? 0;
        return { value, pos: fieldName.end };
      }
    }
    return { value: 0, pos: identifier.end };
  }

  if (entry && entry.type === "array") {
    const arrayIndexResult = handleIndexing(
      source,
      afterIdPos,
      env,
      entry,
      (index: number) => {
        const arrayEntry = entry as ArrayDef;
        return arrayEntry.elements[index] ?? 0;
      },
    );
    if (arrayIndexResult) {
      return arrayIndexResult;
    }
  }

  if (entry && entry.type === "string") {
    const stringIndexResult = handleIndexing(
      source,
      afterIdPos,
      env,
      entry,
      (index: number) => {
        const stringEntry = entry as StringDef;
        return index >= 0 && index < stringEntry.value.length
          ? stringEntry.value.charCodeAt(index)
          : 0;
      },
    );
    if (stringIndexResult) {
      return stringIndexResult;
    }
  }

  return null;
}

function parsePrimaryLiterals(
  source: string,
  pos: number,
): ParserResult | null {
  const numLiteral = parseNumericLiteral(source, pos);
  if (numLiteral) {
    return { value: numLiteral.value, pos: numLiteral.end };
  }

  const charLiteral = parseCharacterLiteral(source, pos);
  if (charLiteral) {
    return { value: charLiteral.value, pos: charLiteral.end };
  }

  return null;
}

function parseFunctionCall(
  source: string,
  afterParenPos: number,
  env: Env,
  fnEntry: FunctionDef,
  thisValue: number | null = null,
): { value: number; pos: number } {
  let argPos = skipWhitespace(source, afterParenPos + 1);
  const args: number[] = [];

  while (source.charCodeAt(argPos) !== 41) {
    const argResult = parseLogicalOr(source, argPos, env);
    args.push(argResult.value);
    argPos = skipWhitespace(source, argResult.pos);

    if (source.charCodeAt(argPos) === 44) {
      argPos = skipWhitespace(source, argPos + 1);
    }
  }

  argPos = skipWhitespace(source, argPos + 1);

  const callEnv: Env = { ...env };

  // Bind 'this' parameter if provided
  if (thisValue !== null && fnEntry.params.length > 0 && fnEntry.params[0] === "this") {
    callEnv["this"] = {
      type: "variable",
      value: thisValue,
      mutable: false,
    };
  }

  // Bind other parameters
  const argStartIndex = thisValue !== null && fnEntry.params[0] === "this" ? 1 : 0;
  for (let i = argStartIndex; i < fnEntry.params.length && i - argStartIndex < args.length; i++) {
    const paramName = fnEntry.params[i];
    if (paramName !== undefined) {
      callEnv[paramName] = {
        type: "variable",
        value: args[i - argStartIndex]!,
        mutable: false,
      };
    }
  }

  const bodyResult = parseLogicalOr(source, fnEntry.bodyPos, callEnv);
  return { value: bodyResult.value, pos: argPos };
}

function parseMethodCall(
  source: string,
  pos: number,
  env: Env,
  thisValue: number,
): ParserResult | null {
  // Check if there is a dot followed by method name and parentheses
  pos = skipWhitespace(source, pos);

  if (source.charCodeAt(pos) !== 46) {
    // '.'
    return null;
  }

  const methodPos = skipWhitespace(source, pos + 1);
  const methodName = parseIdentifier(source, methodPos);

  if (!methodName) {
    return null;
  }

  const afterMethodPos = skipWhitespace(source, methodName.end);

  // Check if it's a method call (has parentheses)
  if (source.charCodeAt(afterMethodPos) !== 40) {
    // '('
    return null;
  }

  // Look up the function in the environment
  const entry = methodName.name in env ? env[methodName.name] : null;
  if (!entry || entry.type !== "function") {
    return null;
  }

  const fnEntry = entry as FunctionDef;
  const result = parseFunctionCall(source, afterMethodPos, env, fnEntry, thisValue);
  return { value: result.value, pos: result.pos };
}

function parsePrimary(source: string, pos: number, env: Env): ParserResult {
  const trimmedPos = skipWhitespace(source, pos);

  const parenOrBlock = parsePrimaryParenOrBlock(source, trimmedPos, env);
  if (parenOrBlock) {
    return parenOrBlock;
  }

  const controlFlow = parsePrimaryControlFlow(source, trimmedPos, env);
  if (controlFlow) {
    return controlFlow;
  }

  const matchOrBoolean = parsePrimaryMatchOrBoolean(source, trimmedPos, env);
  if (matchOrBoolean) {
    return matchOrBoolean;
  }

  const identifierResult = parsePrimaryIdentifier(source, trimmedPos, env);
  if (identifierResult) {
    return identifierResult;
  }

  const literalResult = parsePrimaryLiterals(source, trimmedPos);
  if (literalResult) {
    // Check if this literal is followed by a method call
    const methodResult = parseMethodCall(
      source,
      literalResult.pos,
      env,
      literalResult.value,
    );
    if (methodResult) {
      return methodResult;
    }
    return literalResult;
  }

  return { value: 0, pos: trimmedPos };
}

function skipTypeAnnotation(source: string, pos: number): number {
  // Skip type annotation (: TypeName or : [Type; N; M])
  const typePos = parseTypeAnnotationColon(source, pos);
  if (typePos === null) {
    return pos;
  }
  pos = typePos;

  // Check for array type annotation
  if (source.charCodeAt(pos) === 91) {
    // '[' - array type, skip to ']'
    pos = skipBalancedBrackets(source, pos, 91, 93);
  } else {
    // Simple type identifier
    const typeId = parseIdentifier(source, pos);
    if (typeId) {
      pos = skipWhitespace(source, typeId.end);
    }
  }

  return pos;
}

function skipOpeningParen(source: string, pos: number): number {
  pos = skipWhitespace(source, pos);
  // '('
  return source.charCodeAt(pos) === 40 ? skipWhitespace(source, pos + 1) : -1;
}

function skipBalancedBrackets(
  source: string,
  pos: number,
  openChar: number,
  closeChar: number,
): number {
  if (source.charCodeAt(pos) !== openChar) {
    return pos;
  }
  let depth = 1;
  pos = pos + 1;

  while (pos < source.length && depth > 0) {
    const code = source.charCodeAt(pos);
    if (code === openChar) {
      depth++;
    } else if (code === closeChar) {
      depth--;
    }
    pos++;
  }

  return pos;
}

function skipCommaAndWhitespace(source: string, pos: number): number {
  if (source.charCodeAt(pos) === 44) {
    // ','
    pos = skipWhitespace(source, pos + 1);
  }
  return pos;
}

function skipToOpenBrace(source: string, pos: number): number | null {
  pos = skipWhitespace(source, pos);
  if (source.charCodeAt(pos) !== 123) {
    // '{'
    return null;
  }
  return skipWhitespace(source, pos + 1);
}

function parseTypeAnnotationColon(source: string, pos: number): number | null {
  if (source.charCodeAt(pos) !== 58) {
    // ':'
    return null;
  }
  pos = pos + 1;
  return skipWhitespace(source, pos);
}

function parseFunction(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);

  // Parse function name
  const fnName = parseIdentifier(source, pos);
  if (!fnName) {
    return { value: 0, pos };
  }
  pos = skipOpeningParen(source, fnName.end);
  if (pos === -1) {
    return { value: 0, pos: fnName.end };
  }

  // Parse parameters
  const params: string[] = [];
  while (source.charCodeAt(pos) !== 41) {
    // ')'
    const paramName = parseIdentifier(source, pos);
    if (!paramName) {
      return { value: 0, pos };
    }
    params.push(paramName.name);
    pos = skipWhitespace(source, paramName.end);

    // Skip type annotation
    pos = skipTypeAnnotation(source, pos);

    // Skip comma if present
    pos = skipCommaAndWhitespace(source, pos);
  }

  pos = skipWhitespace(source, pos + 1); // skip ')'

  // Skip return type annotation
  pos = skipTypeAnnotation(source, pos);

  // Expect '=>'
  if (source.charCodeAt(pos) !== 61 || source.charCodeAt(pos + 1) !== 62) {
    // '='  '>'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 2);

  // Find the end of the function body (up to semicolon)
  const bodyStartPos = pos;
  let bodyEndPos = pos;
  let depth = 0;

  while (bodyEndPos < source.length) {
    const code = source.charCodeAt(bodyEndPos);

    if (code === 40 || code === 123) {
      // '(' or '{'
      depth++;
      bodyEndPos++;
    } else if ((code === 41 || code === 125) && depth > 0) {
      // ')' or '}'
      depth--;
      bodyEndPos++;
    } else if (code === 59 && depth === 0) {
      // ';'
      break;
    } else {
      bodyEndPos++;
    }
  }

  const body = source.substring(bodyStartPos, bodyEndPos);

  // Store function in environment
  env[fnName.name] = {
    type: "function",
    params,
    body,
    bodyPos: bodyStartPos,
  };

  // Skip semicolon
  pos = bodyEndPos;
  if (source.charCodeAt(pos) === 59) {
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  // Parse rest of statements
  const restResult = parseStatement(source, pos, env);
  return { value: restResult.value, pos: restResult.pos };
}

function parseStructDefinition(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);

  // Parse struct name
  const structName = parseIdentifier(source, pos);
  if (!structName) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, structName.end);

  // Expect '{'
  const openPos = skipToOpenBrace(source, pos);
  if (openPos === null) {
    return { value: 0, pos };
  }
  pos = openPos;

  // Parse field names (in order)
  const fields: string[] = [];
  while (source.charCodeAt(pos) !== 125) {
    // '}'
    const fieldName = parseIdentifier(source, pos);
    if (!fieldName) {
      return { value: 0, pos };
    }
    fields.push(fieldName.name);
    pos = skipWhitespace(source, fieldName.end);

    // Skip type annotation
    pos = skipTypeAnnotation(source, pos);

    // Skip semicolon if present
    if (source.charCodeAt(pos) === 59) {
      // ';'
      pos = skipWhitespace(source, pos + 1);
    } else if (source.charCodeAt(pos) === 44) {
      // ','
      pos = skipWhitespace(source, pos + 1);
    }
  }

  pos = skipWhitespace(source, pos + 1); // skip '}'
  pos = skipSemicolonAndWhitespace(source, pos);

  // Store struct definition in environment
  // We store it with a special marker - the body and bodyPos are empty for now
  env[structName.name] = {
    type: "structDef",
    fields,
    body: "",
    bodyPos: 0,
  };

  // Parse rest of statements
  const restResult = parseStatement(source, pos, env);
  return { value: restResult.value, pos: restResult.pos };
}

function createVariableEntry(
  source: string,
  pos: number,
  env: Env,
  mutable: boolean,
): {
  entry: EnvEntry;
  pos: number;
} {
  const initResult = parseLogicalOr(source, pos, env);
  const newPos = skipWhitespace(source, initResult.pos);
  const entry: EnvEntry = {
    type: "variable",
    value: initResult.value,
    mutable,
  };
  return { entry, pos: newPos };
}

function parseLetTypeAnnotation(
  source: string,
  pos: number,
  env: Env,
): { structType: string | null; pos: number } {
  let structType: string | null = null;
  const typePos = parseTypeAnnotationColon(source, pos);
  if (typePos === null) {
    return { structType, pos };
  }

  let currentPos = typePos;
  while (source.charCodeAt(currentPos) === 42) {
    currentPos = skipWhitespace(source, currentPos + 1);
  }

  if (source.charCodeAt(currentPos) !== 91) {
    const typeId = parseIdentifier(source, currentPos);
    if (
      typeId &&
      typeId.name in env &&
      (env[typeId.name] as EnvEntry).type === "structDef"
    ) {
      structType = typeId.name;
    }
    currentPos = skipWhitespace(source, typeId?.end ?? currentPos);
  } else {
    currentPos = skipBalancedBrackets(source, currentPos, 91, 93);
    currentPos = skipWhitespace(source, currentPos);
  }

  return { structType, pos: currentPos };
}

function tryParseStructInstantiation(
  source: string,
  pos: number,
  env: Env,
  structType: string | null,
): { entry: EnvEntry; pos: number } | null {
  if (structType === null) {
    return null;
  }

  const structInstId = parseIdentifier(source, pos);
  if (!structInstId || structInstId.name !== structType) {
    return null;
  }

  const afterStructName = skipWhitespace(source, structInstId.end);
  if (source.charCodeAt(afterStructName) !== 123) {
    return null;
  }

  const structDef = env[structType] as StructDef;
  let fieldPos = skipWhitespace(source, afterStructName + 1);
  const fieldValues: Record<string, number> = {};
  let fieldIndex = 0;

  while (source.charCodeAt(fieldPos) !== 125) {
    const fieldResult = parseLogicalOr(source, fieldPos, env);
    if (fieldIndex < structDef.fields.length) {
      fieldValues[structDef.fields[fieldIndex]!] = fieldResult.value;
      fieldIndex++;
    }
    fieldPos = skipWhitespace(source, fieldResult.pos);

    if (source.charCodeAt(fieldPos) === 44) {
      fieldPos = skipWhitespace(source, fieldPos + 1);
    }
  }

  fieldPos = skipWhitespace(source, fieldPos + 1);
  return {
    entry: {
      type: "structInstance",
      structName: structType,
      fieldValues,
    },
    pos: fieldPos,
  };
}

function tryParseArrayLiteral(
  source: string,
  pos: number,
  env: Env,
): { entry: EnvEntry; pos: number } | null {
  if (source.charCodeAt(pos) !== 91) {
    return null;
  }

  let bracketPos = skipWhitespace(source, pos + 1);
  const elements: number[] = [];

  while (source.charCodeAt(bracketPos) !== 93) {
    const elemResult = parseLogicalOr(source, bracketPos, env);
    elements.push(elemResult.value);
    bracketPos = skipWhitespace(source, elemResult.pos);

    if (source.charCodeAt(bracketPos) === 44) {
      bracketPos = skipWhitespace(source, bracketPos + 1);
    }
  }

  return {
    entry: { type: "array", elements },
    pos: skipWhitespace(source, bracketPos + 1),
  };
}

function tryParseStringLiteral(
  source: string,
  pos: number,
  mutable: boolean,
): { entry: EnvEntry; pos: number } | null {
  if (source.charCodeAt(pos) !== 34) {
    return null;
  }

  const stringResult = parseStringLiteral(source, pos);
  if (!stringResult) {
    return {
      entry: { type: "variable", value: 0, mutable },
      pos,
    };
  }

  return {
    entry: { type: "string", value: stringResult.value },
    pos: skipWhitespace(source, stringResult.end),
  };
}

function parseLetBinding(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check for 'mut' keyword
  let isMutable = false;
  const mutPos = skipKeyword(source, pos, "mut");
  if (mutPos !== null) {
    isMutable = true;
    pos = skipWhitespace(source, mutPos);
  }

  // Parse variable name
  const identifier = parseIdentifier(source, pos);
  if (!identifier) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, identifier.end);

  const typeInfo = parseLetTypeAnnotation(source, pos, env);
  let structType: string | null = typeInfo.structType;
  pos = typeInfo.pos;

  // Skip '='
  pos = skipWhitespace(source, pos);
  if (source.charCodeAt(pos) === 61) {
    // '='
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  let entry: EnvEntry;
  const structResult = tryParseStructInstantiation(
    source,
    pos,
    env,
    structType,
  );
  if (structResult) {
    entry = structResult.entry;
    pos = structResult.pos;
  } else {
    const arrayResult = tryParseArrayLiteral(source, pos, env);
    if (arrayResult) {
      entry = arrayResult.entry;
      pos = arrayResult.pos;
    } else {
      const stringResult = tryParseStringLiteral(source, pos, isMutable);
      if (stringResult) {
        entry = stringResult.entry;
        pos = stringResult.pos;
      } else {
        const result = createVariableEntry(source, pos, env, isMutable);
        entry = result.entry;
        pos = result.pos;
      }
    }
  }

  pos = skipSemicolonAndWhitespace(source, pos);

  // Create new environment with the binding
  const newEnv: Env = { ...env, [identifier.name]: entry };

  // Parse body statement (which may contain another let binding)
  const bodyResult = parseStatement(source, pos, newEnv);
  return { value: bodyResult.value, pos: bodyResult.pos };
}

function parseBlock(source: string, pos: number, env: Env): ParserResult {
  let result = 0;
  pos = skipWhitespace(source, pos);

  // Parse statements until we hit closing brace
  while (pos < source.length && source.charCodeAt(pos) !== 125) {
    // charCode 125 is '}'
    const stmtResult = parseStatement(source, pos, env);
    result = stmtResult.value;
    pos = skipWhitespace(source, stmtResult.pos);
  }

  return { value: result, pos };
}

function skipStatement(source: string, pos: number): number {
  pos = skipWhitespace(source, pos);

  // Skip past the next statement-like construct
  // This is a simple approach: find the next semicolon or closing brace
  // Also stops at 'else' keyword to handle if-else chains
  let depth = 0;
  while (pos < source.length) {
    const code = source.charCodeAt(pos);

    // Found end of statement
    if (code === 59 && depth === 0) {
      // ';'
      return pos + 1;
    }

    // Found closing brace - don't consume it
    if (code === 125 && depth === 0) {
      // '}'
      return pos;
    }

    // Check for 'else' keyword at depth 0
    if (depth === 0 && code >= 97 && code <= 122) {
      // Potential identifier starting with lowercase letter
      const potentialElse = skipKeyword(source, pos, "else");
      if (potentialElse !== null) {
        // Found 'else', stop here
        return pos;
      }
    }

    // Skip over strings/literals by skipping parentheses and braces
    if (code === 40 || code === 123) {
      // '(' or '{'
      depth++;
      pos++;
    } else if ((code === 41 || code === 125) && depth > 0) {
      // ')' or '}'
      depth--;
      pos++;
    } else {
      pos++;
    }
  }

  return pos;
}

function handleElseKeyword(
  source: string,
  pos: number,
  env: Env,
  shouldExecute: boolean,
  branchParser: ParserFn,
): { foundElse: boolean; value: number; pos: number } {
  const elsePos = skipKeyword(source, pos, "else");
  if (elsePos === null) {
    return { foundElse: false, value: 0, pos };
  }

  pos = skipWhitespace(source, elsePos);
  let value = 0;

  if (shouldExecute) {
    const elseResult = branchParser(source, pos, env);
    value = elseResult.value;
    pos = skipWhitespace(source, elseResult.pos);
  } else {
    pos = skipStatement(source, pos);
  }

  pos = skipSemicolonAndWhitespace(source, pos);
  return { foundElse: true, value, pos };
}

function parseIfStatement(source: string, pos: number, env: Env): ParserResult {
  const ifResult = parseIfConditional(source, pos, env, parseStatement);

  // Check if there's more to parse (not at '}' or end)
  pos = ifResult.pos;
  if (pos < source.length && source.charCodeAt(pos) !== 125) {
    // charCode 125 is '}'
    const restResult = parseStatement(source, pos, env);
    return { value: restResult.value, pos: restResult.pos };
  } else {
    return ifResult;
  }
}

function parseWhile(source: string, pos: number, env: Env): ParserResult {
  // Parse initial condition to find where the body starts
  const condResult = parseIfCondition(source, pos, env);
  if (!condResult) {
    return { value: 0, pos };
  }

  const bodyStartPos = condResult.pos;
  let value = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 1024;

  while (iterations < MAX_ITERATIONS) {
    // Re-evaluate the condition each iteration
    const condCheckResult = parseIfCondition(source, pos, env);
    if (!condCheckResult || condCheckResult.condition === 0) {
      break;
    }

    // Execute body
    const bodyResult = parseStatement(source, bodyStartPos, env);
    value = bodyResult.value;
    let bodyEndPos = skipWhitespace(source, bodyResult.pos);

    // Skip semicolon if present
    bodyEndPos = skipSemicolonAndWhitespace(source, bodyEndPos);

    iterations++;
  }

  // Position after the while loop
  let finalPos = bodyStartPos;
  // Skip to the end of the loop body for final position
  // This is a simplified approach - in real code we'd need better tracking
  finalPos = skipStatement(source, bodyStartPos);

  return { value, pos: finalPos };
}

function parseFor(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check opening parenthesis
  pos = skipOpeningParen(source, pos);
  if (pos === -1) {
    return { value: 0, pos };
  }

  // Parse loop variable name
  const loopVarIdent = parseIdentifier(source, pos);
  if (!loopVarIdent) {
    return { value: 0, pos };
  }
  const loopVarName = loopVarIdent.name;
  pos = skipWhitespace(source, loopVarIdent.end);

  // Expect 'in' keyword
  const inPos = skipKeyword(source, pos, "in");
  if (inPos === null) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, inPos);

  // Parse range start
  const startNumResult = parseNumericLiteral(source, pos);
  if (!startNumResult) {
    return { value: 0, pos };
  }
  const rangeStart = startNumResult.value;
  pos = skipWhitespace(source, startNumResult.end);

  // Expect '..' (two dots)
  if (source.charCodeAt(pos) !== 46 || source.charCodeAt(pos + 1) !== 46) {
    // '.'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 2);

  // Parse range end
  const endNumResult = parseNumericLiteral(source, pos);
  if (!endNumResult) {
    return { value: 0, pos };
  }
  const rangeEnd = endNumResult.value;
  pos = skipWhitespace(source, endNumResult.end);

  // Expect closing parenthesis
  if (source.charCodeAt(pos) !== 41) {
    // ')'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 1);

  // Get body starting position
  const bodyStartPos = pos;

  let value = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 1024;

  // Loop through the range
  for (
    let i = rangeStart;
    i < rangeEnd && iterations < MAX_ITERATIONS;
    i++, iterations++
  ) {
    // Add loop variable to environment
    env[loopVarName] = { type: "variable", value: i, mutable: false };

    // Execute body
    const bodyResult = parseStatement(source, bodyStartPos, env);
    value = bodyResult.value;
    pos = skipWhitespace(source, bodyResult.pos);

    // Skip semicolon if present
    pos = skipSemicolonAndWhitespace(source, pos);
  }

  // Remove loop variable from environment
  delete env[loopVarName];

  return { value, pos };
}

function parseStatement(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check for control flow keywords (let, if)
  const keywordResult = checkKeywordControlFlow(
    source,
    pos,
    env,
    parseIfStatement,
  );
  if (keywordResult !== null) {
    return keywordResult;
  }

  // Check for 'while' keyword
  const whilePos = skipKeyword(source, pos, "while");
  if (whilePos !== null) {
    return parseWhile(source, whilePos, env);
  }

  // Check for 'for' keyword
  const forPos = skipKeyword(source, pos, "for");
  if (forPos !== null) {
    return parseFor(source, forPos, env);
  }

  // Try to parse assignment or expression
  return parseAssignmentOrExpression(source, pos, env);
}

function parseComparison(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseShift,
    [
      [60, 61], // <=
      [62, 61], // >=
      [61, 61], // ==
      [33, 61], // !=
      60, // <
      62, // >
    ],
    [
      (left: number, right: number) => (left <= right ? 1 : 0),
      (left: number, right: number) => (left >= right ? 1 : 0),
      (left: number, right: number) => (left === right ? 1 : 0),
      (left: number, right: number) => (left !== right ? 1 : 0),
      (left: number, right: number) => (left < right ? 1 : 0),
      (left: number, right: number) => (left > right ? 1 : 0),
    ],
  );
}

function parseLogicalAnd(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseBitwiseOr,
    [[38, 38]], // &&
    [(left: number, right: number) => (left !== 0 && right !== 0 ? 1 : 0)],
  );
}

function parseLogicalOr(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseLogicalAnd,
    [[124, 124]], // ||
    [(left: number, right: number) => (left !== 0 || right !== 0 ? 1 : 0)],
  );
}

function parseBitwiseOr(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseBitwiseXor,
    [124], // |
    [(left: number, right: number) => left | right],
  );
}

function parseBitwiseXor(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseBitwiseAnd,
    [94], // ^
    [(left: number, right: number) => left ^ right],
  );
}

function parseBitwiseAnd(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseComparison,
    [38], // &
    [(left: number, right: number) => left & right],
  );
}

function parseShift(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseAdditive,
    [
      [60, 60],
      [62, 62],
    ], // << >>
    [
      (left: number, right: number) => left << right,
      (left: number, right: number) => left >> right,
    ],
  );
}

function parseAssignmentOrExpression(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  const startPos = pos;
  pos = skipWhitespace(source, startPos);

  // Try to parse an identifier (potential assignment target)
  const identifier = parseIdentifier(source, pos);
  if (identifier) {
    const afterIdPos = skipWhitespace(source, identifier.end);
    const nextCode = source.charCodeAt(afterIdPos);
    const varName = identifier.name;

    // Check if variable is mutable
    const entry = varName in env ? env[varName] : null;
    if (entry && entry.type === "variable" && entry.mutable) {
      // Check for compound assignment operators: +=, -=, *=, /=
      if (
        nextCode === 43 || // '+'
        nextCode === 45 || // '-'
        nextCode === 42 || // '*'
        nextCode === 47 // '/'
      ) {
        if (source.charCodeAt(afterIdPos + 1) === 61) {
          // Compound assignment operator found
          const assignPos = skipWhitespace(source, afterIdPos + 2);

          // Parse RHS expression
          const rhsResult = parseLogicalOr(source, assignPos, env);
          const rhsValue = rhsResult.value;
          const currentValue = entry.value;

          // Apply the operator
          let newValue = currentValue;
          if (nextCode === 43) {
            // '+'
            newValue = currentValue + rhsValue;
          } else if (nextCode === 45) {
            // '-'
            newValue = currentValue - rhsValue;
          } else if (nextCode === 42) {
            // '*'
            newValue = currentValue * rhsValue;
          } else if (nextCode === 47) {
            // '/'
            newValue = currentValue / rhsValue;
          }

          return completeAssignment(
            source,
            rhsResult.pos,
            env,
            varName,
            newValue,
          );
        }
      }

      // Check if this is followed by '='
      if (nextCode === 61) {
        // '=' - this is an assignment
        const assignPos = skipWhitespace(source, afterIdPos + 1);

        // Parse RHS expression
        const rhsResult = parseLogicalOr(source, assignPos, env);
        const newValue = rhsResult.value;

        return completeAssignment(
          source,
          rhsResult.pos,
          env,
          varName,
          newValue,
        );
      }
    }
  }

  // Not an assignment, parse as normal expression
  const exprResult = parseLogicalOr(source, startPos, env);
  return exprResult;
}

function completeAssignment(
  source: string,
  pos: number,
  env: Env,
  varName: string,
  newValue: number,
): ParserResult {
  let exprPos = skipWhitespace(source, pos);
  exprPos = skipSemicolonAndWhitespace(source, exprPos);

  // Mutate the mutable variable in place
  const entry = env[varName];
  if (entry && entry.type === "variable") {
    entry.value = newValue;
  }

  // Return the assigned value
  return { value: newValue, pos: exprPos };
}

function parseMultiplicative(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseUnary,
    [42, 47, 37], // * / %
    [
      (left: number, right: number) => left * right,
      (left: number, right: number) => left / right,
      (left: number, right: number) => left % right,
    ],
  );
}

function parseUnary(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);

  // Check for unary NOT operator (!)
  if (source.charCodeAt(pos) === 33) {
    // '!'
    pos = skipWhitespace(source, pos + 1);
    const result = parseUnary(source, pos, env); // Allow chaining of unary operators
    return { value: result.value !== 0 ? 0 : 1, pos: result.pos };
  }

  return parsePrimary(source, pos, env);
}

function parseAdditive(source: string, pos: number, env: Env): ParserResult {
  return parseBinaryOperator(
    source,
    pos,
    env,
    parseMultiplicative,
    [43, 45], // + -
    [
      (left: number, right: number) => left + right,
      (left: number, right: number) => left - right,
    ],
  );
}

export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }

  const result = parseStatement(source, 0, {});
  return result.value;
}
