/* eslint-disable no-unused-vars */
type Variable = {
  type: "variable";
  value: number;
  mutable: boolean;
  structType?: string; // Track if this variable holds a struct instance
};
type FunctionDef = {
  type: "function";
  params: string[];
  body: string;
  bodyPos: number;
};
type FunctionRef = {
  type: "functionRef";
  functionName: string;
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
type EnumDef = {
  type: "enumDef";
  variants: string[];
};
type TypeAlias = {
  type: "typeAlias";
  aliasName?: string; // For simple type aliases: type Alias = I32;
  unionTypes?: string[]; // For union types: type Option = Some | None;
};
type ModuleDef = {
  type: "module";
  body: string;
  bodyPos: number;
  env: Env; // Module's own environment with its functions
};
type PointerDef = {
  type: "pointer";
  value: number; // The address/reference (we store variable reference ID or a simple index)
  pointsToName?: string; // Optional: name of the variable this points to
  isMutable?: boolean; // Whether this pointer can mutate its target
};
type EnvEntry =
  | Variable
  | FunctionDef
  | FunctionRef
  | ArrayDef
  | StringDef
  | StructDef
  | StructInstance
  | EnumDef
  | TypeAlias
  | ModuleDef
  | PointerDef;
type Env = Record<string, EnvEntry> & {
  breakRequested?: boolean;
  continueRequested?: boolean;
  yieldRequested?: boolean;
  yieldValue?: number;
  returnRequested?: boolean;
  returnValue?: number;
  returnedFunctionRef?: string; // For functions that return function references
};

type ParserFn = (_source: string, _pos: number, _env: Env) => ParserResult;

type ParserResult = { value: number; pos: number };
const MAX_LOOP_ITERATIONS = 1024;
/* eslint-enable no-unused-vars */

function parseNumericLiteral(
  source: string,
  start: number,
): { value: number; end: number } | null {
  let numEnd = start;
  let iterations = 0;
  let value = 0;
  let base = 10;

  // Check for hex, octal, or binary prefix
  if (source.charCodeAt(start) === 48 && start + 1 < source.length) {
    // '0'
    const nextChar = source.charCodeAt(start + 1);
    if (nextChar === 120 || nextChar === 88) {
      // '0x' or '0X' - hexadecimal
      base = 16;
      numEnd = start + 2;
    } else if (nextChar === 111 || nextChar === 79) {
      // '0o' or '0O' - octal
      base = 8;
      numEnd = start + 2;
    } else if (nextChar === 98 || nextChar === 66) {
      // '0b' or '0B' - binary
      base = 2;
      numEnd = start + 2;
    }
  }

  // If we haven't found a prefix, start from the beginning
  if (base === 10 && numEnd === start) {
    numEnd = start;
  } else if (base !== 10) {
    // We found a prefix, now parse the digits
    iterations = 0;
    while (numEnd < source.length && iterations < MAX_LOOP_ITERATIONS) {
      const code = source.charCodeAt(numEnd);
      let digit = -1;

      if (base === 16) {
        if (code >= 48 && code <= 57) {
          // '0'-'9'
          digit = code - 48;
        } else if (code >= 97 && code <= 102) {
          // 'a'-'f'
          digit = code - 97 + 10;
        } else if (code >= 65 && code <= 70) {
          // 'A'-'F'
          digit = code - 65 + 10;
        }
      } else if (base === 8) {
        if (code >= 48 && code <= 55) {
          // '0'-'7'
          digit = code - 48;
        }
      } else if (base === 2) {
        if (code === 48 || code === 49) {
          // '0' or '1'
          digit = code - 48;
        }
      }

      if (digit === -1) {
        break;
      }
      value = value * base + digit;
      numEnd++;
      iterations++;
    }

    if (numEnd === start + 2) {
      // No digits found after prefix
      return null;
    }
  }

  // Parse decimal digits if no special prefix was found
  if (base === 10) {
    iterations = 0;
    while (
      numEnd < source.length &&
      source.charCodeAt(numEnd) >= 48 && // '0'
      source.charCodeAt(numEnd) <= 57 && // '9'
      iterations < MAX_LOOP_ITERATIONS
    ) {
      value = value * 10 + (source.charCodeAt(numEnd) - 48);
      numEnd++;
      iterations++;
    }
  }

  if (numEnd <= start) {
    return null;
  }

  // Skip type suffix (e.g., "U8", "I32")
  let suffixEnd = numEnd;
  iterations = 0;
  while (
    suffixEnd < source.length &&
    ((source.charCodeAt(suffixEnd) >= 65 &&
      source.charCodeAt(suffixEnd) <= 90) || // 'A'-'Z'
      (source.charCodeAt(suffixEnd) >= 97 &&
        source.charCodeAt(suffixEnd) <= 122) || // 'a'-'z'
      (source.charCodeAt(suffixEnd) >= 48 &&
        source.charCodeAt(suffixEnd) <= 57)) && // '0'-'9'
    iterations < MAX_LOOP_ITERATIONS
  ) {
    suffixEnd++;
    iterations++;
  }

  return {
    value,
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
  let iterations = 0;

  // Parse string content until closing quote
  while (
    stringIndex < source.length &&
    source.charCodeAt(stringIndex) !== 34 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
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
    iterations++;
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
  // First character must be a letter or underscore
  if (start >= source.length) {
    return null;
  }
  const firstChar = source.charCodeAt(start);
  if (
    !(
      (firstChar >= 97 && firstChar <= 122) || // 'a'-'z'
      (firstChar >= 65 && firstChar <= 90) || // 'A'-'Z'
      firstChar === 95
    ) // '_'
  ) {
    return null;
  }

  // Subsequent characters can be letters, digits, or underscores
  let end = start + 1;
  let iterations = 0;
  while (
    end < source.length &&
    ((source.charCodeAt(end) >= 97 && source.charCodeAt(end) <= 122) || // 'a'-'z'
      (source.charCodeAt(end) >= 65 && source.charCodeAt(end) <= 90) || // 'A'-'Z'
      (source.charCodeAt(end) >= 48 && source.charCodeAt(end) <= 57) || // '0'-'9'
      source.charCodeAt(end) === 95) && // '_'
    iterations < MAX_LOOP_ITERATIONS
  ) {
    end++;
    iterations++;
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
  let iterations = 0;
  while (
    pos < source.length &&
    source.charCodeAt(pos) === 32 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    // ' '
    pos++;
    iterations++;
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

function resolveTypeAlias(typeName: string, env: Env): string {
  const typeEntry = env[typeName];
  if (typeEntry && typeEntry.type === "typeAlias") {
    const alias = typeEntry as TypeAlias;
    if (alias.aliasName) {
      return alias.aliasName;
    }
  }
  return typeName;
}

function isNumericType(typeName: string): boolean {
  return (
    typeName === "I32" ||
    typeName === "I64" ||
    typeName === "F32" ||
    typeName === "F64" ||
    typeName === "U32" ||
    typeName === "U64"
  );
}

function restoreBindings(
  env: Env,
  previousBindings: Record<string, EnvEntry | undefined>,
  previousLastFunctionRef: string | undefined,
): void {
  let restoreIterations = 0;
  for (const [name, previous] of Object.entries(previousBindings)) {
    if (restoreIterations >= MAX_LOOP_ITERATIONS) {
      break;
    }
    if (previous === undefined) {
      delete env[name];
    } else {
      env[name] = previous;
    }
    restoreIterations++;
  }
  if (previousLastFunctionRef === undefined) {
    delete (env as any).__lastFunctionRef;
  } else {
    (env as any).__lastFunctionRef = previousLastFunctionRef;
  }
}

function checkControlFlowFlags(
  env: Env,
  previousResult: number,
  stmtResult: ParserResult,
): { shouldBreak: boolean; result: number; pos: number } | null {
  if ((env as any).breakRequested) {
    return { shouldBreak: true, result: previousResult, pos: stmtResult.pos };
  }

  if ((env as any).continueRequested) {
    return { shouldBreak: true, result: previousResult, pos: stmtResult.pos };
  }

  if ((env as any).yieldRequested) {
    return {
      shouldBreak: true,
      result: (env as any).yieldValue,
      pos: stmtResult.pos,
    };
  }

  if ((env as any).returnRequested) {
    return {
      shouldBreak: true,
      result: (env as any).returnValue,
      pos: stmtResult.pos,
    };
  }

  return null;
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

  // If break or continue was requested during operand parsing, stop here
  if (
    (env as any).breakRequested ||
    (env as any).continueRequested ||
    (env as any).returnRequested
  ) {
    return left;
  }

  let result = left.value;
  pos = left.pos;

  let iterations = 0;
  while (pos < source.length && iterations < MAX_LOOP_ITERATIONS) {
    // Check for break or continue before processing operators
    if (
      (env as any).breakRequested ||
      (env as any).continueRequested ||
      (env as any).returnRequested
    ) {
      break;
    }

    const savedPos = pos;
    pos = skipWhitespace(source, pos);
    const charCode = source.charCodeAt(pos);

    let handlerIndex = -1;

    for (let i = 0; i < operatorCodes.length && i < MAX_LOOP_ITERATIONS; i++) {
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
        if (
          charCode === code &&
          !(
            (code === 38 && source.charCodeAt(pos + 1) === 38) ||
            (code === 124 && source.charCodeAt(pos + 1) === 124)
          )
        ) {
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
    iterations++;
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

function parseIsPatternWithDestructuring(
  source: string,
  pos: number,
): {
  potentialId: { name: string; end: number } | null;
  typeName: { name: string; end: number } | null;
  destructResult: { names: string[]; pos: number } | null;
  endPos: number;
} | null {
  const potentialId = parseIdentifier(source, pos);
  if (!potentialId) {
    return null;
  }

  const afterIdPos = skipWhitespace(source, potentialId.end);
  const isKeyword = skipKeyword(source, afterIdPos, "is");
  if (isKeyword === null) {
    return null;
  }

  const typePos = skipWhitespace(source, isKeyword);
  const typeName = parseIdentifier(source, typePos);
  if (!typeName) {
    return null;
  }

  let endPos = typeName.end;
  let destructResult: { names: string[]; pos: number } | null = null;

  // Check for destructuring pattern: { field1, field2 }
  const afterTypePos = skipWhitespace(source, endPos);
  if (source.charCodeAt(afterTypePos) === 123) {
    // '{'
    const destructParse = parseIdentifierList(source, afterTypePos, false);
    if (destructParse) {
      destructResult = destructParse;
      endPos = destructParse.pos;
    }
  }

  return {
    potentialId,
    typeName,
    destructResult,
    endPos,
  };
}

function parseIfConditional(
  source: string,
  pos: number,
  env: Env,
  branchParser: ParserFn,
): ParserResult {
  // Check for special case: "identifier is Type { field }" pattern with destructuring
  let thenEnv = env;
  let isDestructuringPattern = false;

  const checkPos = skipWhitespace(source, pos);
  if (source.charCodeAt(checkPos) === 40) {
    // '('  - look for destructuring pattern inside
    const insideParenPos = skipWhitespace(source, checkPos + 1);
    const patternMatch = parseIsPatternWithDestructuring(
      source,
      insideParenPos,
    );

    if (patternMatch) {
      const { potentialId, typeName, destructResult, endPos } = patternMatch;

      // Check if we can close the parenthesis
      const afterPatternPos = skipWhitespace(source, endPos);
      if (
        source.charCodeAt(afterPatternPos) === 41 &&
        destructResult &&
        potentialId &&
        typeName
      ) {
        // ')' and destructuring found - valid pattern
        // Look up the identifier to get its struct instance
        const idEntry = env[potentialId.name];

        if (idEntry && idEntry.type === "structInstance") {
          const instance = idEntry as StructInstance;
          if (instance.structName === typeName.name) {
            // Pattern matches - create environment with destructured fields
            thenEnv = { ...env };
            isDestructuringPattern = true;

            destructResult.names.forEach((fieldName) => {
              const fieldValue = instance.fieldValues[fieldName] ?? 0;
              thenEnv[fieldName] = {
                type: "variable",
                value: fieldValue,
                mutable: false,
              };
            });
          }
        }
      }
    }
  }

  const condAndPos = getIfConditionAndPos(source, pos, env);
  if (!condAndPos) {
    return { value: 0, pos };
  }

  const { condition, pos: afterCond } = condAndPos;
  pos = afterCond;

  let result = 0;

  if (condition !== 0) {
    // Execute then branch
    const branchEnv = isDestructuringPattern ? thenEnv : env;
    const thenResult = branchParser(source, pos, branchEnv);
    result = thenResult.value;
    pos = skipWhitespace(source, thenResult.pos);

    // Check for break or continue that bubbled up
    if (
      (env as any).breakRequested ||
      (env as any).continueRequested ||
      (env as any).yieldRequested
    ) {
      return { value: result, pos };
    }

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

  // Check for 'enum' keyword
  const enumPos = skipKeyword(source, pos, "enum");
  if (enumPos !== null) {
    return parseEnumDefinition(source, enumPos, env);
  }

  // Check for 'type' keyword
  const typePos = skipKeyword(source, pos, "type");
  if (typePos !== null) {
    return parseTypeAliasDefinition(source, typePos, env);
  }

  // Check for 'module' keyword
  const modulePos = skipKeyword(source, pos, "module");
  if (modulePos !== null) {
    return parseModule(source, modulePos, env);
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

function parseMatchPattern(
  source: string,
  pos: number,
  matchedStructType: string | undefined,
): {
  patternMatches: boolean;
  destructResult: { names: string[]; pos: number } | null;
  pos: number;
} {
  let patternMatches = false;
  let destructResult: { names: string[]; pos: number } | null = null;

  // Check for wildcard pattern '_'
  if (source.charCodeAt(pos) === 95) {
    // '_'
    patternMatches = true;
    pos = pos + 1;
  } else {
    // Try to parse numeric literal pattern first
    const patternLit = parseNumericLiteral(source, pos);
    if (patternLit) {
      // Pattern will be matched in parseMatch based on matchValue
      pos = patternLit.end;
    } else {
      // Try to parse identifier pattern (struct variant name)
      const patternId = parseIdentifier(source, pos);
      if (patternId) {
        pos = patternId.end;
        pos = skipWhitespace(source, pos);

        // Check for destructuring pattern: Some { field1, field2 }
        if (source.charCodeAt(pos) === 123) {
          // '{'
          destructResult = parseIdentifierList(source, pos, false);
          if (destructResult) {
            pos = destructResult.pos;
            pos = skipWhitespace(source, pos);
          }
        }

        // It's a struct variant pattern - match against the struct type
        if (matchedStructType && patternId.name === matchedStructType) {
          patternMatches = true;
        }
      }
    }
  }

  return {
    patternMatches,
    destructResult,
    pos,
  };
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

  // Get the struct type and instance of the match value
  let matchedStructType: string | undefined;
  let matchedStructInstance: StructInstance | null = null;
  const parenExpr = source.substring(
    source.lastIndexOf("(", parenResult.pos),
    parenResult.pos,
  );

  // Extract variable name from matched string (skip opening paren)
  let matchVarName = "";
  for (let i = 1; i < parenExpr.length && i < MAX_LOOP_ITERATIONS; i++) {
    const code = parenExpr.charCodeAt(i);
    if (
      (code >= 97 && code <= 122) || // a-z
      (code >= 65 && code <= 90) || // A-Z
      (code >= 48 && code <= 57) || // 0-9
      code === 95 // _
    ) {
      matchVarName += parenExpr.charAt(i);
    } else {
      break;
    }
  }

  if (matchVarName && matchVarName in env) {
    const entry = env[matchVarName];
    if (entry && entry.type === "structInstance") {
      const instance = entry as StructInstance;
      matchedStructType = instance.structName;
      matchedStructInstance = instance;
    }
  }

  // Parse cases until closing brace
  let result = 0;
  let foundMatch = false;
  let iterations = 0;
  while (
    pos < source.length &&
    source.charCodeAt(pos) !== 125 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    // charCode 125 is '}'
    pos = skipWhitespace(source, pos);

    // Check for 'case' keyword
    const casePos = skipKeyword(source, pos, "case");
    if (casePos === null) {
      break;
    }
    pos = skipWhitespace(source, casePos);

    // Try numeric literal pattern first
    const patternLit = parseNumericLiteral(source, pos);
    let patternMatches = false;
    let structPatternInfo = null;
    let destructResult: { names: string[]; pos: number } | null = null;

    if (patternLit) {
      // Numeric pattern matching
      patternMatches = !foundMatch && patternLit.value === matchValue;
      pos = patternLit.end;
    } else {
      // Try struct or wildcard patterns
      structPatternInfo = parseMatchPattern(source, pos, matchedStructType);
      pos = structPatternInfo.pos;
      patternMatches = !foundMatch && structPatternInfo.patternMatches;
      destructResult = structPatternInfo.destructResult;
    }

    pos = skipWhitespace(source, pos);

    // Expect '=>'
    if (source.charCodeAt(pos) === 61 && source.charCodeAt(pos + 1) === 62) {
      // '=>'
      pos = pos + 2;
    }
    pos = skipWhitespace(source, pos);

    // Create environment for result expression with destructured bindings
    let resultEnv = env;
    if (patternMatches && matchedStructInstance && destructResult) {
      resultEnv = { ...env };
      destructResult.names.forEach((fieldName) => {
        const fieldValue = matchedStructInstance!.fieldValues[fieldName] ?? 0;
        resultEnv[fieldName] = {
          type: "variable",
          value: fieldValue,
          mutable: false,
        };
      });
    }

    // Parse result expression
    const resultExpr = parseLogicalOr(source, pos, resultEnv);
    pos = skipWhitespace(source, resultExpr.pos);

    // If pattern matched, store result and mark as found
    if (patternMatches) {
      result = resultExpr.value;
      foundMatch = true;
    }

    // Skip semicolon
    pos = skipSemicolonAndWhitespace(source, pos);
    iterations++;
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

  // Check for range syntax '..'
  if (
    source.charCodeAt(endPos) === 46 &&
    source.charCodeAt(endPos + 1) === 46
  ) {
    // ']' - range syntax detected
    endPos = skipWhitespace(source, endPos + 2);
    const rangeEndResult = parseLogicalOr(source, endPos, env);
    endPos = skipWhitespace(source, rangeEndResult.pos);

    if (source.charCodeAt(endPos) === 93) {
      // ']'
      endPos = skipWhitespace(source, endPos + 1);
      // Store slice info in a special marker for reference operator
      const sliceInfo = {
        startIdx: Math.floor(indexResult.value),
        endIdx: Math.floor(rangeEndResult.value),
      };
      (env as any).__lastArraySlice = sliceInfo;
      (env as any).__lastArraySliceEntry = entry;
      return { value: 0, pos: endPos };
    }
  }

  // Expect ']' for regular index
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
  const parenResult = parseParenthesizedExpr(source, pos, env, parseLogicalOr);
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

function tryParseFunctionCall(
  source: string,
  afterIdPos: number,
  env: Env,
  fnEntry: FunctionDef,
): ParserResult | null {
  // Check for generic function call: functionName<Type>(args)
  let callCheckPos = afterIdPos;
  if (source.charCodeAt(callCheckPos) === 60) {
    // '<' - could be generic
    const afterTypeParams = skipTypeParameterList(source, callCheckPos);
    if (source.charCodeAt(afterTypeParams) === 40) {
      // '(' - confirmed generic function call
      const result = parseFunctionCall(source, afterTypeParams, env, fnEntry);
      return { value: result.value, pos: result.pos };
    }
  }

  // Check for regular function call
  if (source.charCodeAt(callCheckPos) === 40) {
    // '('
    const result = parseFunctionCall(source, callCheckPos, env, fnEntry);
    return { value: result.value, pos: result.pos };
  }

  return null;
}

function parseRestOfStatements(
  source: string,
  pos: number,
  endPos: number,
  env: Env,
): ParserResult {
  // Skip any closing brace that was already counted
  pos = endPos + 1;
  if (source.charCodeAt(pos) === 59) {
    // ';'
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  // Parse rest of statements
  const restResult = parseStatement(source, pos, env);
  return { value: restResult.value, pos: restResult.pos };
}

function tryParseModuleFunction(
  source: string,
  afterIdPos: number,
  env: Env,
  moduleDef: ModuleDef,
): ParserResult | null {
  let currentPos = afterIdPos;
  if (
    source.charCodeAt(currentPos) !== 58 ||
    source.charCodeAt(currentPos + 1) !== 58
  ) {
    // No :: operator
    return null;
  }

  currentPos = skipWhitespace(source, currentPos + 2);
  const functionName = parseIdentifier(source, currentPos);
  if (!functionName) {
    return null;
  }

  currentPos = skipWhitespace(source, functionName.end);

  // Check if followed by ( for function call
  if (source.charCodeAt(currentPos) !== 40) {
    // '('
    return null;
  }

  // Look up function in module environment
  const fnEntry = moduleDef.env[functionName.name];
  if (!fnEntry || fnEntry.type !== "function") {
    return null;
  }

  const fnDef = fnEntry as FunctionDef;
  const result = parseFunctionCall(source, currentPos, env, fnDef);
  return { value: result.value, pos: result.pos };
}

function tryParseEnumVariant(
  source: string,
  afterIdPos: number,
  entry: EnvEntry,
): ParserResult | null {
  if (entry.type !== "enumDef") {
    return null;
  }

  let currentPos = afterIdPos;
  if (
    source.charCodeAt(currentPos) === 58 &&
    source.charCodeAt(currentPos + 1) === 58
  ) {
    // '::'
    currentPos = skipWhitespace(source, currentPos + 2);
    const variantName = parseIdentifier(source, currentPos);
    if (variantName) {
      const enumDef = entry as EnumDef;
      const variantIndex = enumDef.variants.indexOf(variantName.name);
      if (variantIndex !== -1) {
        return { value: variantIndex, pos: variantName.end };
      }
    }
  }

  return null;
}

function tryCallChainedFunction(
  source: string,
  fnResult: ParserResult,
  env: Env,
): ParserResult | null {
  if (fnResult.value === -1 && (env as any).__lastFunctionRef) {
    const fnRefKey = (env as any).__lastFunctionRef;
    const fnRefEntry = env[fnRefKey] as FunctionRef;
    const nextPos = skipWhitespace(source, fnResult.pos);
    if (source.charCodeAt(nextPos) === 40) {
      // '(' - chained call
      const referencedFn = env[fnRefEntry.functionName];
      if (referencedFn && referencedFn.type === "function") {
        const referencedFnDef = referencedFn as FunctionDef;
        const chainedResult = parseFunctionCall(
          source,
          nextPos,
          env,
          referencedFnDef,
        );
        return chainedResult;
      }
    }
  }
  return null;
}

function tryParseFunctionCallWithChain(
  source: string,
  afterIdPos: number,
  env: Env,
  fnEntry: FunctionDef,
): ParserResult | null {
  const fnResult = tryParseFunctionCall(source, afterIdPos, env, fnEntry);
  if (!fnResult) {
    return null;
  }
  const chainedResult = tryCallChainedFunction(source, fnResult, env);
  return chainedResult ?? fnResult;
}

function handleFunctionEntry(
  source: string,
  afterIdPos: number,
  env: Env,
  identifierName: string,
  identifierEnd: number,
  entry: EnvEntry,
): ParserResult | null {
  if (entry.type === "function") {
    const fnEntry = entry as FunctionDef;
    const fnResult = tryParseFunctionCallWithChain(
      source,
      afterIdPos,
      env,
      fnEntry,
    );
    if (fnResult) {
      return fnResult;
    }
    const tempRefKey = "__fnref_" + Math.random().toString(36).substring(7);
    env[tempRefKey] = {
      type: "functionRef",
      functionName: identifierName,
    };
    (env as any).__lastFunctionRef = tempRefKey;
    (env as any).returnedFunctionRef = identifierName;
    return { value: -1, pos: identifierEnd };
  }

  if (entry.type === "functionRef") {
    const fnRef = entry as FunctionRef;
    const referencedFn = env[fnRef.functionName];
    if (referencedFn && referencedFn.type === "function") {
      const fnEntry = referencedFn as FunctionDef;
      const fnResult = tryParseFunctionCallWithChain(
        source,
        afterIdPos,
        env,
        fnEntry,
      );
      if (fnResult) {
        return fnResult;
      }
    }
    const tempRefKey = "__fnref_" + Math.random().toString(36).substring(7);
    env[tempRefKey] = {
      type: "functionRef",
      functionName: fnRef.functionName,
    };
    (env as any).__lastFunctionRef = tempRefKey;
    return { value: -1, pos: identifierEnd };
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
    // Identifier found but not in environment - this is an undefined variable error
    throw new Error(`Undefined variable: ${identifier.name}`);
  }

  const functionResult = handleFunctionEntry(
    source,
    afterIdPos,
    env,
    identifier.name,
    identifier.end,
    entry,
  );
  if (functionResult) {
    return functionResult;
  }

  // Check for enum variant access
  const enumResult = tryParseEnumVariant(source, afterIdPos, entry);
  if (enumResult) {
    return enumResult;
  }

  // Check for module function access (Module::function())
  if (entry.type === "module") {
    const moduleFnResult = tryParseModuleFunction(
      source,
      afterIdPos,
      env,
      entry as ModuleDef,
    );
    if (moduleFnResult) {
      return moduleFnResult;
    }
  }

  if (entry.type === "variable") {
    return { value: entry.value, pos: identifier.end };
  }

  if (entry.type === "structInstance") {
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

  if (entry.type === "array") {
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

  if (entry.type === "string") {
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

  if (entry.type === "pointer") {
    const pointerResult = handlePointerIndexing(source, afterIdPos, env, entry);
    if (pointerResult) {
      return pointerResult;
    }
  }

  return null;
}

function handlePointerIndexing(
  source: string,
  afterIdPos: number,
  env: Env,
  entry: EnvEntry,
): ParserResult | null {
  const pointerEntry = entry as any;

  // Check if pointer is a mutable slice - read from original array
  if (
    pointerEntry.__sliceSourceName &&
    pointerEntry.__sliceStart !== undefined
  ) {
    const sourceArray = env[pointerEntry.__sliceSourceName];
    if (sourceArray && sourceArray.type === "array") {
      const arrayDef = sourceArray as ArrayDef;
      return handleIndexing(source, afterIdPos, env, entry, (index: number) => {
        const actualIndex = pointerEntry.__sliceStart + Math.floor(index);
        return actualIndex >= 0 && actualIndex < arrayDef.elements.length
          ? (arrayDef.elements[actualIndex] ?? 0)
          : 0;
      });
    }
  }

  // Check if pointer has a stored array value for indexing
  if (pointerEntry.__arrayValue && Array.isArray(pointerEntry.__arrayValue)) {
    return handleIndexing(source, afterIdPos, env, entry, (index: number) => {
      return index >= 0 && index < pointerEntry.__arrayValue.length
        ? (pointerEntry.__arrayValue[index] ?? 0)
        : 0;
    });
  }

  // Check if pointer has a stored string value for indexing
  if (
    pointerEntry.__stringValue &&
    typeof pointerEntry.__stringValue === "string"
  ) {
    return handleIndexing(source, afterIdPos, env, entry, (index: number) => {
      return index >= 0 && index < pointerEntry.__stringValue.length
        ? pointerEntry.__stringValue.charCodeAt(index)
        : 0;
    });
  }
  return null;
}

function handlePointerTypeBinding(
  source: string,
  pos: number,
  env: Env,
  isPointerMutable: boolean,
): { entry: EnvEntry; pos: number } {
  // First, check for string literal
  const checkPos = skipWhitespace(source, pos);
  if (source.charCodeAt(checkPos) === 34) {
    // '"' - string literal
    const stringResult = parseStringLiteral(source, checkPos);
    if (stringResult) {
      return {
        entry: {
          type: "pointer",
          value: 0,
          pointsToName: undefined,
          isMutable: isPointerMutable,
          __stringValue: stringResult.value,
        } as any,
        pos: skipWhitespace(source, stringResult.end),
      };
    }
  }

  // Parse the RHS expression first
  const valueResult = parseLogicalOr(source, checkPos, env);

  // Check if pointer reference (& operator) was used
  const pointerKey = (env as any).__lastPointerRef;
  if (pointerKey && pointerKey in env) {
    // Use the pointer created by & operator
    const baseEntry = env[pointerKey] as PointerDef;
    const entry = {
      ...baseEntry,
      isMutable: Boolean(baseEntry.isMutable) && isPointerMutable,
    };
    (env as any).__lastPointerRef = undefined;
    return { entry, pos: skipWhitespace(source, valueResult.pos) };
  }

  // Regular value assignment
  return {
    entry: {
      type: "pointer",
      value: valueResult.value,
      isMutable: isPointerMutable,
    },
    pos: skipWhitespace(source, valueResult.pos),
  };
}

function handleNormalTypeBinding(
  source: string,
  pos: number,
  env: Env,
  structType: string | null,
  isMutable: boolean,
): { entry: EnvEntry; pos: number } {
  const structResult = tryParseStructInstantiation(
    source,
    pos,
    env,
    structType,
  );
  if (structResult) {
    return { entry: structResult.entry, pos: structResult.pos };
  }

  const arrayResult = tryParseArrayLiteral(source, pos, env);
  if (arrayResult) {
    return { entry: arrayResult.entry, pos: arrayResult.pos };
  }

  const stringResult = tryParseStringLiteral(source, pos, isMutable);
  if (stringResult) {
    return { entry: stringResult.entry, pos: stringResult.pos };
  }

  const result = createVariableEntry(source, pos, env, isMutable);
  return { entry: result.entry, pos: result.pos };
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

// eslint-disable-next-line no-unused-vars
type BodyStopCondition = (charCode: number, depth: number) => boolean;

function findBodyEndPosition(
  source: string,
  startPos: number,
  shouldStop: BodyStopCondition,
): number {
  let bodyEndPos = startPos;
  let depth = 0;
  let iterations = 0;

  while (bodyEndPos < source.length && iterations < MAX_LOOP_ITERATIONS) {
    const charCode = source.charCodeAt(bodyEndPos);

    if (charCode === 40 || charCode === 123) {
      // '(' or '{'
      depth++;
      bodyEndPos++;
    } else if ((charCode === 41 || charCode === 125) && depth > 0) {
      // ')' or '}'
      depth--;
      bodyEndPos++;
    } else if (shouldStop(charCode, depth)) {
      break;
    } else {
      bodyEndPos++;
    }
    iterations++;
  }

  return bodyEndPos;
}

function tryParseInlineFunction(
  source: string,
  pos: number,
  env: Env,
): { value: number; pos: number; fnRefKey: string } | null {
  pos = skipWhitespace(source, pos);

  // Check for inline function: () => expr or (params) => expr
  if (source.charCodeAt(pos) !== 40) {
    // '('
    return null;
  }

  const parenStart = pos;
  const afterOpenParen = skipBalancedBrackets(source, pos, 40, 41);
  const afterParenClean = skipWhitespace(source, afterOpenParen);

  // Check if this is followed by '=>'
  if (
    source.charCodeAt(afterParenClean) !== 61 ||
    source.charCodeAt(afterParenClean + 1) !== 62
  ) {
    return null; // Not an inline function
  }

  // Parse the parameters inside ()
  let currentPos = parenStart + 1;
  const params: string[] = [];
  let iterations = 0;

  while (
    source.charCodeAt(currentPos) !== 41 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    // ')'
    currentPos = skipWhitespace(source, currentPos);
    const paramId = parseIdentifier(source, currentPos);
    if (!paramId) {
      break; // No parameters
    }
    params.push(paramId.name);
    currentPos = skipWhitespace(source, paramId.end);

    // Skip type annotation if present
    currentPos = skipTypeAnnotation(source, currentPos);

    // Skip comma if present
    if (source.charCodeAt(currentPos) === 44) {
      currentPos = skipWhitespace(source, currentPos + 1);
    }
    iterations++;
  }

  currentPos = skipWhitespace(source, currentPos + 1); // skip ')'

  // Expect '=>'
  if (
    source.charCodeAt(currentPos) !== 61 ||
    source.charCodeAt(currentPos + 1) !== 62
  ) {
    return null;
  }

  currentPos = skipWhitespace(source, currentPos + 2); // skip '=>'

  // Find the end of the body (up to comma or closing paren)
  const bodyStartPos = currentPos;
  const bodyEndPos = findBodyEndPosition(
    source,
    currentPos,
    (code, depth) => (code === 44 || code === 41) && depth === 0,
  );

  const body = source.substring(bodyStartPos, bodyEndPos);

  // Create a temporary function for this inline function
  const fnRefKey = "__inline_" + Math.random().toString(36).substring(7);
  env[fnRefKey] = {
    type: "function",
    params,
    body,
    bodyPos: bodyStartPos,
  };

  // Return -1 and store function reference metadata
  (env as any).__lastFunctionRef = fnRefKey;

  return { value: -1, pos: bodyEndPos, fnRefKey };
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
  const argFnRefs: (string | null)[] = []; // Track function references for each argument
  let iterations = 0;

  while (source.charCodeAt(argPos) !== 41 && iterations < MAX_LOOP_ITERATIONS) {
    // Try to parse inline function first
    const inlineResult = tryParseInlineFunction(source, argPos, env);
    if (inlineResult) {
      args.push(inlineResult.value);
      argFnRefs.push(inlineResult.fnRefKey);
      argPos = skipWhitespace(source, inlineResult.pos);
    } else {
      // Parse regular argument
      const argResult = parseLogicalOr(source, argPos, env);
      args.push(argResult.value);
      argFnRefs.push(null); // No function reference
      argPos = skipWhitespace(source, argResult.pos);
    }

    if (source.charCodeAt(argPos) === 44) {
      argPos = skipWhitespace(source, argPos + 1);
    }
    iterations++;
  }

  argPos = skipWhitespace(source, argPos + 1);

  const callEnv: Env = env;
  const previousBindings: Record<string, EnvEntry | undefined> = {};
  const previousLastFunctionRef = (callEnv as any).__lastFunctionRef;
  const previousAllowShadowing = (callEnv as any).__allowShadowing;
  delete (callEnv as any).__lastFunctionRef;
  // Set flag to allow shadowing in function local scope
  (callEnv as any).__allowShadowing = true;

  // Bind 'this' parameter if provided
  if (
    thisValue !== null &&
    fnEntry.params.length > 0 &&
    fnEntry.params[0] === "this"
  ) {
    previousBindings["this"] = callEnv["this"];
    callEnv["this"] = {
      type: "variable",
      value: thisValue,
      mutable: false,
    };
  }

  // Bind other parameters
  const argStartIndex =
    thisValue !== null && fnEntry.params[0] === "this" ? 1 : 0;
  for (
    let i = argStartIndex;
    i < fnEntry.params.length &&
    i - argStartIndex < args.length &&
    i - argStartIndex < MAX_LOOP_ITERATIONS;
    i++
  ) {
    const paramName = fnEntry.params[i];
    if (paramName !== undefined) {
      const argIndex = i - argStartIndex;
      previousBindings[paramName] = callEnv[paramName];
      // If argument is a function reference, bind it as FunctionRef
      if (argFnRefs[argIndex]) {
        callEnv[paramName] = {
          type: "functionRef",
          functionName: argFnRefs[argIndex]!,
        };
      } else {
        // Regular argument - bind as variable
        callEnv[paramName] = {
          type: "variable",
          value: args[argIndex]!,
          mutable: false,
        };
      }
    }
  }

  const bodyResult = parseAssignmentOrExpression(
    source,
    fnEntry.bodyPos,
    callEnv,
  );

  // Check if body returned a function reference
  if ((callEnv as any).__lastFunctionRef) {
    const fnRefKey = (callEnv as any).__lastFunctionRef;
    const fnRefEntry = callEnv[fnRefKey] as FunctionRef;
    if (fnRefEntry) {
      const tempRefKey = "__fnref_" + Math.random().toString(36).substring(7);
      env[tempRefKey] = {
        type: "functionRef",
        functionName: fnRefEntry.functionName,
      };
      (env as any).__lastFunctionRef = tempRefKey;
      const chainedResult = tryCallChainedFunction(
        source,
        { value: -1, pos: argPos },
        env,
      );
      const finalResult = chainedResult ?? { value: -1, pos: argPos };

      // Restore bindings
      restoreBindings(callEnv, previousBindings, previousLastFunctionRef);
      if (previousAllowShadowing !== undefined) {
        (callEnv as any).__allowShadowing = previousAllowShadowing;
      } else {
        delete (callEnv as any).__allowShadowing;
      }

      return finalResult;
    }
  }

  // Restore bindings after call
  restoreBindings(callEnv, previousBindings, previousLastFunctionRef);
  if (previousAllowShadowing !== undefined) {
    (callEnv as any).__allowShadowing = previousAllowShadowing;
  } else {
    delete (callEnv as any).__allowShadowing;
  }

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
  const result = parseFunctionCall(
    source,
    afterMethodPos,
    env,
    fnEntry,
    thisValue,
  );
  return { value: result.value, pos: result.pos };
}

function createPointerReference(
  env: Env,
  isMutable: boolean,
  pointsToName?: string,
  arrayValue?: number[],
  sliceSourceName?: string,
  sliceStart?: number,
  sliceEnd?: number,
): string {
  const pointerRefKey = "__ptrref_" + Math.random().toString(36).substring(7);
  const pointerDef: any = {
    type: "pointer",
    value: 0,
    pointsToName,
    isMutable,
  };

  if (arrayValue) {
    pointerDef.__arrayValue = arrayValue;
  }

  if (isMutable && sliceSourceName) {
    pointerDef.__sliceSourceName = sliceSourceName;
    pointerDef.__sliceStart = sliceStart;
    pointerDef.__sliceEnd = sliceEnd;
  }

  env[pointerRefKey] = pointerDef;
  return pointerRefKey;
}

function tryParseReferenceOperator(
  source: string,
  trimmedPos: number,
  env: Env,
): ParserResult | null {
  if (source.charCodeAt(trimmedPos) !== 38) {
    // '&'
    return null;
  }

  let currentPos = skipWhitespace(source, trimmedPos + 1);
  let isMutableRef = false;
  const mutPos = skipKeyword(source, currentPos, "mut");
  if (mutPos !== null) {
    isMutableRef = true;
    currentPos = skipWhitespace(source, mutPos);
  }
  const identifier = parseIdentifier(source, currentPos);
  if (identifier && identifier.name in env) {
    const variable = env[identifier.name];
    if (variable && variable.type === "variable") {
      if (isMutableRef && !variable.mutable) {
        return null;
      }
      const pointerRefKey = createPointerReference(
        env,
        isMutableRef,
        identifier.name,
      );
      // Store reference for later retrieval
      (env as any).__lastPointerRef = pointerRefKey;
      return { value: Math.random(), pos: identifier.end }; // Return unique value
    } else if (variable && variable.type === "array") {
      // Handle array reference with potential slicing
      let refEndPos = identifier.end;

      // Check if this is followed by array indexing with slicing
      if (source.charCodeAt(refEndPos) === 91) {
        // '[' - potential slice
        const arrayIndexResult = handleIndexing(
          source,
          refEndPos,
          env,
          variable,
          () => 0, // getValue not used for slicing detection
        );

        if (arrayIndexResult) {
          // Check if a slice was detected
          const sliceInfo = (env as any).__lastArraySlice;
          if (sliceInfo) {
            const arrayDef = variable as ArrayDef;
            // Create sliced array
            const sliceStart = sliceInfo.startIdx;
            const sliceEnd = sliceInfo.endIdx;
            const slicedElements = arrayDef.elements.slice(
              sliceStart,
              sliceEnd,
            );

            // For mutable slices, store reference to original array
            const pointerRefKey = createPointerReference(
              env,
              isMutableRef,
              undefined,
              isMutableRef ? undefined : slicedElements,
              isMutableRef ? identifier.name : undefined,
              isMutableRef ? sliceStart : undefined,
              isMutableRef ? sliceEnd : undefined,
            );

            // Clean up slice info
            delete (env as any).__lastArraySlice;
            delete (env as any).__lastArraySliceEntry;

            // Store reference for later retrieval
            (env as any).__lastPointerRef = pointerRefKey;
            return { value: Math.random(), pos: arrayIndexResult.pos };
          }
        }
      }
    }
  }

  return null;
}

function tryParseDereferenceOperator(
  source: string,
  trimmedPos: number,
  env: Env,
): ParserResult | null {
  if (source.charCodeAt(trimmedPos) !== 42) {
    // '*'
    return null;
  }

  const identifier = parseIdentifierAfterOperator(source, trimmedPos);
  if (identifier && identifier.name in env) {
    const entry = env[identifier.name];
    if (entry && entry.type === "pointer") {
      const ptr = entry as PointerDef;
      if (ptr.pointsToName && ptr.pointsToName in env) {
        const targetVar = env[ptr.pointsToName];
        if (targetVar && targetVar.type === "variable") {
          return {
            value: (targetVar as Variable).value,
            pos: identifier.end,
          };
        }
      }
    }
  }

  return null;
}

function parseIdentifierAfterOperator(
  source: string,
  operatorPos: number,
): { name: string; end: number } | null {
  let currentPos = skipWhitespace(source, operatorPos + 1);
  return parseIdentifier(source, currentPos);
}

function parsePrimary(source: string, pos: number, env: Env): ParserResult {
  const trimmedPos = skipWhitespace(source, pos);

  // Check for reference operator (&)
  const refResult = tryParseReferenceOperator(source, trimmedPos, env);
  if (refResult) {
    return refResult;
  }

  // Check for dereference operator (*)
  const derefResult = tryParseDereferenceOperator(source, trimmedPos, env);
  if (derefResult) {
    return derefResult;
  }

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

function skipFunctionTypeAnnotation(
  source: string,
  pos: number,
): number | null {
  if (source.charCodeAt(pos) !== 40) {
    return null;
  }
  const afterParen = skipBalancedBrackets(source, pos, 40, 41);
  const afterParenClean = skipWhitespace(source, afterParen);
  if (
    source.charCodeAt(afterParenClean) === 61 &&
    source.charCodeAt(afterParenClean + 1) === 62
  ) {
    let currentPos = skipWhitespace(source, afterParenClean + 2);
    const returnType = parseIdentifier(source, currentPos);
    if (returnType) {
      currentPos = skipWhitespace(source, returnType.end);
    }
    return currentPos;
  }
  return null;
}

function skipTypeAnnotation(source: string, pos: number): number {
  // Skip type annotation (: TypeName or : [Type; N; M])
  const typePos = parseTypeAnnotationColon(source, pos);
  if (typePos === null) {
    return pos;
  }
  pos = typePos;

  const functionTypePos = skipFunctionTypeAnnotation(source, pos);
  if (functionTypePos !== null) {
    return functionTypePos;
  }

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
  let iterations = 0;

  while (pos < source.length && depth > 0 && iterations < MAX_LOOP_ITERATIONS) {
    const code = source.charCodeAt(pos);
    if (code === openChar) {
      depth++;
    } else if (code === closeChar) {
      depth--;
    }
    pos++;
    iterations++;
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

function skipTypeParameterList(source: string, pos: number): number {
  pos = skipWhitespace(source, pos);
  if (source.charCodeAt(pos) !== 60) {
    // '<'
    return pos;
  }

  pos = pos + 1;
  let angleDepth = 1;
  let iterations = 0;

  while (
    pos < source.length &&
    angleDepth > 0 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    const code = source.charCodeAt(pos);
    if (code === 60) {
      // '<'
      angleDepth++;
    } else if (code === 62) {
      // '>'
      angleDepth--;
    }
    pos++;
    iterations++;
  }

  return skipWhitespace(source, pos);
}

function parseModule(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);

  // Parse module name
  const moduleName = parseIdentifier(source, pos);
  if (!moduleName) {
    return { value: 0, pos };
  }

  pos = skipWhitespace(source, moduleName.end);

  // Expect opening brace
  if (source.charCodeAt(pos) !== 123) {
    // '{'
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 1);

  // Find the end of the module body (balanced braces)
  const bodyStartPos = pos;
  let bodyEndPos = pos;
  let depth = 1; // We've already seen the opening brace
  let iterations = 0;

  while (
    bodyEndPos < source.length &&
    depth > 0 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    const charCode = source.charCodeAt(bodyEndPos);
    if (charCode === 123) {
      // '{'
      depth++;
    } else if (charCode === 125) {
      // '}'
      depth--;
    }
    if (depth > 0) {
      bodyEndPos++;
    }
    iterations++;
  }

  const body = source.substring(bodyStartPos, bodyEndPos);

  // Create module environment and execute body in it
  // Parse the body and then adjust all bodyPos values
  const moduleEnv: Env = {};
  parseStatement(body, 0, moduleEnv);

  // Adjust all bodyPos values in moduleEnv to be relative to original source
  iterations = 0;
  for (const entry of Object.values(moduleEnv)) {
    if (iterations >= MAX_LOOP_ITERATIONS) {
      break;
    }
    if (
      entry &&
      typeof entry === "object" &&
      (entry as any).type === "function"
    ) {
      const fnDef = entry as FunctionDef;
      fnDef.bodyPos = (fnDef.bodyPos ?? 0) + bodyStartPos;
    }
    iterations++;
  }

  // Store module definition
  env[moduleName.name] = {
    type: "module",
    body,
    bodyPos: bodyStartPos,
    env: moduleEnv,
  };

  // Parse rest of statements using helper
  return parseRestOfStatements(source, pos, bodyEndPos, env);
}

function parseFunction(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);
  let iterations = 0;

  // Parse function name
  const fnName = parseIdentifier(source, pos);
  if (!fnName) {
    return { value: 0, pos };
  }

  // Skip generic type parameters if present: <T>, <T, U>, etc.
  pos = skipTypeParameterList(source, fnName.end);

  pos = skipOpeningParen(source, pos);
  if (pos === -1) {
    return { value: 0, pos: fnName.end };
  }

  // Parse parameters
  const params: string[] = [];
  while (source.charCodeAt(pos) !== 41 && iterations < MAX_LOOP_ITERATIONS) {
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
    iterations++;
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
  const bodyEndPos = findBodyEndPosition(
    source,
    pos,
    (code, depth) => code === 59 && depth === 0, // 59 = ';'
  );

  const body = source.substring(bodyStartPos, bodyEndPos);

  // Store function in environment
  env[fnName.name] = {
    type: "function",
    params,
    body,
    bodyPos: bodyStartPos,
  };

  // Parse rest of statements using helper
  return parseRestOfStatements(source, bodyEndPos, bodyEndPos, env);
}

function parseIdentifierList(
  source: string,
  pos: number,
  skipTypeAnnotations: boolean = false,
): { names: string[]; pos: number } | null {
  let iterations = 0;
  // Expect '{'
  const openPos = skipToOpenBrace(source, pos);
  if (openPos === null) {
    return null;
  }
  pos = openPos;

  // Parse identifier names
  const names: string[] = [];
  while (source.charCodeAt(pos) !== 125 && iterations < MAX_LOOP_ITERATIONS) {
    // '}'
    const name = parseIdentifier(source, pos);
    if (!name) {
      return null;
    }
    names.push(name.name);
    pos = skipWhitespace(source, name.end);

    // Skip type annotation if requested
    if (skipTypeAnnotations) {
      pos = skipTypeAnnotation(source, pos);
    }

    // Skip semicolon or comma if present
    if (source.charCodeAt(pos) === 59) {
      // ';'
      pos = skipWhitespace(source, pos + 1);
    } else if (source.charCodeAt(pos) === 44) {
      // ','
      pos = skipWhitespace(source, pos + 1);
    }
    iterations++;
  }

  pos = skipWhitespace(source, pos + 1); // skip '}'
  pos = skipSemicolonAndWhitespace(source, pos);

  return { names, pos };
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

  // Skip generic type parameters if present: <T>, <T, U>, etc.
  pos = skipTypeParameterList(source, pos);

  // Parse field names with type annotations
  const result = parseIdentifierList(source, pos, true);
  if (!result) {
    return { value: 0, pos };
  }

  pos = result.pos;

  // Store struct definition in environment
  env[structName.name] = {
    type: "structDef",
    fields: result.names,
    body: "",
    bodyPos: 0,
  };

  // Parse rest of statements
  const restResult = parseStatement(source, pos, env);
  return { value: restResult.value, pos: restResult.pos };
}

function parseEnumDefinition(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);

  // Parse enum name
  const enumName = parseIdentifier(source, pos);
  if (!enumName) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, enumName.end);

  // Parse variant names (without type annotations)
  const result = parseIdentifierList(source, pos, false);
  if (!result) {
    return { value: 0, pos };
  }

  pos = result.pos;

  // Store enum definition in environment
  env[enumName.name] = {
    type: "enumDef",
    variants: result.names,
  };

  // Parse rest of statements
  const restResult = parseStatement(source, pos, env);
  return { value: restResult.value, pos: restResult.pos };
}

function parseTypeAliasDefinition(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  pos = skipWhitespace(source, pos);
  let iterations = 0;

  // Parse type alias name
  const aliasName = parseIdentifier(source, pos);
  if (!aliasName) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, aliasName.end);

  // Expect '='
  if (source.charCodeAt(pos) !== 61) {
    // '='
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, pos + 1);

  // Parse first type name
  const firstType = parseIdentifier(source, pos);
  if (!firstType) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, firstType.end);

  const types: string[] = [firstType.name];

  // Check for union types (separated by |)
  iterations = 0;
  while (source.charCodeAt(pos) === 124 && iterations < MAX_LOOP_ITERATIONS) {
    // '|'
    pos = skipWhitespace(source, pos + 1);
    const nextType = parseIdentifier(source, pos);
    if (!nextType) {
      break;
    }
    types.push(nextType.name);
    pos = skipWhitespace(source, nextType.end);
    iterations++;
  }

  // Skip semicolon and whitespace
  pos = skipSemicolonAndWhitespace(source, pos);

  // Store type alias in environment
  if (types.length === 1) {
    env[aliasName.name] = {
      type: "typeAlias",
      aliasName: types[0],
    };
  } else {
    env[aliasName.name] = {
      type: "typeAlias",
      unionTypes: types,
    };
  }

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
): {
  structType: string | null;
  isFunctionType: boolean;
  isPointerType: boolean;
  isPointerMutable: boolean;
  pos: number;
} {
  let structType: string | null = null;
  let isFunctionType = false;
  let isPointerType = false;
  let isPointerMutable = false;
  let iterations = 0;
  const typePos = parseTypeAnnotationColon(source, pos);
  if (typePos === null) {
    return { structType, isFunctionType, isPointerType, isPointerMutable, pos };
  }

  let currentPos = typePos;
  iterations = 0;
  while (
    source.charCodeAt(currentPos) === 42 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    // '*' - pointer
    isPointerType = true;
    currentPos = skipWhitespace(source, currentPos + 1);
    iterations++;
  }

  if (isPointerType) {
    const mutPos = skipKeyword(source, currentPos, "mut");
    if (mutPos !== null) {
      isPointerMutable = true;
      currentPos = skipWhitespace(source, mutPos);
    }
  }

  const functionTypePos = skipFunctionTypeAnnotation(source, currentPos);
  if (functionTypePos !== null) {
    isFunctionType = true;
    currentPos = functionTypePos;
  } else if (source.charCodeAt(currentPos) !== 91) {
    const typeId = parseIdentifier(source, currentPos);
    if (typeId) {
      // Skip generic type parameters if present: <I32>, etc.
      let afterTypeParams = skipTypeParameterList(source, typeId.end);

      // Resolve type aliases
      let resolvedTypeName = resolveTypeAlias(typeId.name, env);

      if (
        resolvedTypeName in env &&
        (env[resolvedTypeName] as EnvEntry).type === "structDef"
      ) {
        structType = resolvedTypeName;
      }
      currentPos = skipWhitespace(source, afterTypeParams);
    }
  } else {
    currentPos = skipBalancedBrackets(source, currentPos, 91, 93);
    currentPos = skipWhitespace(source, currentPos);
  }

  return {
    structType,
    isFunctionType,
    isPointerType,
    isPointerMutable,
    pos: currentPos,
  };
}

function tryParseStructInstantiation(
  source: string,
  pos: number,
  env: Env,
  structType: string | null,
): { entry: EnvEntry; pos: number } | null {
  let iterations = 0;
  const structInstId = parseIdentifier(source, pos);
  if (!structInstId) {
    return null;
  }

  // Skip generic type parameters if present: <I32>, <String, I32>, etc.
  let afterTypeParams = skipTypeParameterList(source, structInstId.end);

  // Check if the struct name is valid
  // If structType is provided (simple type), check if it matches
  // If structType is null (union type or no annotation), accept any valid struct
  if (structType !== null) {
    // Simple type annotation - struct name must match
    if (structInstId.name !== structType) {
      return null;
    }
  } else {
    // No specific type annotation - the struct name must be defined
    const potentialStructDef = env[structInstId.name];
    if (!potentialStructDef || potentialStructDef.type !== "structDef") {
      return null;
    }
  }

  afterTypeParams = skipWhitespace(source, afterTypeParams);
  if (source.charCodeAt(afterTypeParams) !== 123) {
    // '{'
    return null;
  }

  const actualStructType = structType || structInstId.name;
  const structDef = env[actualStructType] as StructDef;
  let fieldPos = skipWhitespace(source, afterTypeParams + 1);
  const fieldValues: Record<string, number> = {};
  let fieldIndex = 0;
  iterations = 0;

  while (
    source.charCodeAt(fieldPos) !== 125 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    // '}'
    const fieldResult = parseLogicalOr(source, fieldPos, env);
    if (fieldIndex < structDef.fields.length) {
      fieldValues[structDef.fields[fieldIndex]!] = fieldResult.value;
      fieldIndex++;
    }
    fieldPos = skipWhitespace(source, fieldResult.pos);

    if (source.charCodeAt(fieldPos) === 44) {
      // ','
      fieldPos = skipWhitespace(source, fieldPos + 1);
    }
    iterations++;
  }

  fieldPos = skipWhitespace(source, fieldPos + 1); // skip '}'
  return {
    entry: {
      type: "structInstance",
      structName: actualStructType,
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
  let iterations = 0;
  if (source.charCodeAt(pos) !== 91) {
    return null;
  }

  let bracketPos = skipWhitespace(source, pos + 1);
  const elements: number[] = [];
  iterations = 0;

  while (
    source.charCodeAt(bracketPos) !== 93 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    const elemResult = parseLogicalOr(source, bracketPos, env);
    elements.push(elemResult.value);
    bracketPos = skipWhitespace(source, elemResult.pos);

    if (source.charCodeAt(bracketPos) === 44) {
      bracketPos = skipWhitespace(source, bracketPos + 1);
    }
    iterations++;
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

function handleEntryBinding(
  source: string,
  pos: number,
  env: Env,
  isMutable: boolean,
  structType: string | null,
  isFunctionType: boolean,
  isPointerType: boolean,
  isPointerMutable: boolean,
): { entry: EnvEntry; pos: number } {
  let entry: EnvEntry;

  // Handle pointer types
  if (isPointerType) {
    const pointerResult = handlePointerTypeBinding(
      source,
      pos,
      env,
      isPointerMutable,
    );
    entry = pointerResult.entry;
    pos = pointerResult.pos;
  } // Check if this is a function reference assignment
  else if (isFunctionType) {
    const functionNameId = parseIdentifier(source, pos);
    if (functionNameId && functionNameId.name in env) {
      const potentialFn = env[functionNameId.name];
      if (potentialFn && potentialFn.type === "function") {
        // This is a function reference - create FunctionRef entry
        entry = {
          type: "functionRef",
          functionName: functionNameId.name,
        };
        pos = skipWhitespace(source, functionNameId.end);
      } else {
        // Not a function, fall through to normal parsing
        const result = createVariableEntry(source, pos, env, isMutable);
        entry = result.entry;
        pos = result.pos;
      }
    } else {
      // Function not found, fall through to normal parsing
      const result = createVariableEntry(source, pos, env, isMutable);
      entry = result.entry;
      pos = result.pos;
    }
  } else {
    // Not a function type, parse normally
    const normalResult = handleNormalTypeBinding(
      source,
      pos,
      env,
      structType,
      isMutable,
    );
    entry = normalResult.entry;
    pos = normalResult.pos;
  }

  return { entry, pos };
}

function parseLetBinding(source: string, pos: number, env: Env): ParserResult {
  pos = skipWhitespace(source, pos);
  let iterations = 0;

  // Check for 'mut' keyword
  let isMutable = false;
  const mutPos = skipKeyword(source, pos, "mut");
  if (mutPos !== null) {
    isMutable = true;
    pos = skipWhitespace(source, mutPos);
  }

  // Check for destructuring pattern: { field1, field2, ... }
  let destructureFields: string[] | null = null;
  if (source.charCodeAt(pos) === 123) {
    // '{'
    const destructList = parseIdentifierList(source, pos, false);
    if (destructList) {
      destructureFields = destructList.names;
      pos = skipWhitespace(source, destructList.pos);
    }
  }

  // Parse variable name (skip if we're doing destructuring)
  let identifier: { name: string; end: number } | null = null;
  if (!destructureFields) {
    identifier = parseIdentifier(source, pos);
    if (!identifier) {
      return { value: 0, pos };
    }
    // Check for shadowing - variable already exists in current environment
    // Allow shadowing across function boundaries
    if (identifier.name in env) {
      // Check if this looks like we're in a function body by seeing if __isFunctionContext flag is set
      if (!(env as any).__allowShadowing) {
        throw new Error(`Variable already declared: ${identifier.name}`);
      }
    }
    pos = skipWhitespace(source, identifier.end);
  }

  const typeInfo = parseLetTypeAnnotation(source, pos, env);
  let structType: string | null = typeInfo.structType;
  const isFunctionType = typeInfo.isFunctionType;
  const isPointerType = typeInfo.isPointerType;
  const isPointerMutable = typeInfo.isPointerMutable;
  pos = typeInfo.pos;

  // Skip '='
  pos = skipWhitespace(source, pos);
  if (source.charCodeAt(pos) === 61) {
    // '='
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  let entry: EnvEntry;

  // Use helper to create the entry
  const entryResult = handleEntryBinding(
    source,
    pos,
    env,
    isMutable,
    structType,
    isFunctionType,
    isPointerType,
    isPointerMutable,
  );
  entry = entryResult.entry;
  pos = entryResult.pos;

  pos = skipSemicolonAndWhitespace(source, pos);

  // Create new environment with the binding(s)
  let newEnv: Env = { ...env };

  if (destructureFields && entry.type === "structInstance") {
    // Destructuring: extract fields from struct instance
    const instance = entry as StructInstance;
    destructureFields.forEach((fieldName) => {
      const fieldValue = instance.fieldValues[fieldName] ?? 0;
      newEnv[fieldName] = {
        type: "variable",
        value: fieldValue,
        mutable: isMutable,
      };
    });
  } else if (identifier) {
    // Regular binding
    newEnv = { ...env, [identifier.name]: entry };
  }

  // Parse body statement(s) - may contain multiple statements after the let binding
  let bodyResult = parseStatement(source, pos, newEnv);
  let currentPos = skipWhitespace(source, bodyResult.pos);
  // Continue parsing additional statements until EOF
  while (
    currentPos < source.length &&
    source.charCodeAt(currentPos) !== 125 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    bodyResult = parseStatement(source, currentPos, newEnv); // Keep the last value
    currentPos = skipWhitespace(source, bodyResult.pos);
    iterations++;
  }
  return { value: bodyResult.value, pos: currentPos };
}

function parseBlock(source: string, pos: number, env: Env): ParserResult {
  let result = 0;
  pos = skipWhitespace(source, pos);

  // Parse statements until we hit closing brace
  let iterations = 0;
  while (
    pos < source.length &&
    source.charCodeAt(pos) !== 125 &&
    iterations < MAX_LOOP_ITERATIONS
  ) {
    // charCode 125 is '}'
    const previousResult = result;
    const stmtResult = parseStatement(source, pos, env);

    // Check control flow flags
    const flagCheck = checkControlFlowFlags(env, previousResult, stmtResult);
    if (flagCheck) {
      result = flagCheck.result;
      pos = flagCheck.pos;
      break;
    }

    result = stmtResult.value;
    pos = skipWhitespace(source, stmtResult.pos);
    iterations++;
  }

  return { value: result, pos };
}

function skipStatement(source: string, pos: number): number {
  pos = skipWhitespace(source, pos);

  // Skip past the next statement-like construct
  // This is a simple approach: find the next semicolon or closing brace
  // Also stops at 'else' keyword to handle if-else chains
  let depth = 0;
  let iterations = 0;
  while (pos < source.length && iterations < MAX_LOOP_ITERATIONS) {
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
    iterations++;
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
  while (iterations < MAX_LOOP_ITERATIONS) {
    // Re-evaluate the condition each iteration
    const condCheckResult = parseIfCondition(source, pos, env);
    if (!condCheckResult || condCheckResult.condition === 0) {
      break;
    }

    // Execute body
    const bodyResult = parseStatement(source, bodyStartPos, env);
    value = bodyResult.value;
    let bodyEndPos = skipWhitespace(source, bodyResult.pos);

    // Check for break statement
    if ((env as any).breakRequested) {
      (env as any).breakRequested = false;
      break;
    }

    // Check for continue statement
    if ((env as any).continueRequested) {
      (env as any).continueRequested = false;
      iterations++;
      continue;
    }

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

  // Loop through the range
  for (
    let i = rangeStart;
    i < rangeEnd && iterations < MAX_LOOP_ITERATIONS;
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
  let iterations = 0;
  while (source.charCodeAt(pos) === 59 && iterations < MAX_LOOP_ITERATIONS) {
    // ';'
    pos = skipWhitespace(source, pos + 1);
    iterations++;
  }

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

  // Check for 'break' keyword
  const breakPos = skipKeyword(source, pos, "break");
  if (breakPos !== null) {
    // Set breakRequested flag in environment
    (env as any).breakRequested = true;
    pos = skipWhitespace(source, breakPos);
    // Skip semicolon after break
    if (source.charCodeAt(pos) === 59) {
      // ';'
      pos = pos + 1;
    }
    return { value: 0, pos };
  }

  // Check for 'continue' keyword
  const continuePos = skipKeyword(source, pos, "continue");
  if (continuePos !== null) {
    // Set continueRequested flag in environment
    (env as any).continueRequested = true;
    pos = skipWhitespace(source, continuePos);
    // Skip semicolon after continue
    if (source.charCodeAt(pos) === 59) {
      // ';'
      pos = pos + 1;
    }
    return { value: 0, pos };
  }

  // Check for 'yield' keyword
  const yieldPos = skipKeyword(source, pos, "yield");
  if (yieldPos !== null) {
    return parseYieldOrReturn(source, yieldPos, env, "yield");
  }

  // Check for 'return' keyword
  const returnPos = skipKeyword(source, pos, "return");
  if (returnPos !== null) {
    return parseYieldOrReturn(source, returnPos, env, "return");
  }

  // Try to parse assignment or expression
  return parseAssignmentOrExpression(source, pos, env);
}

function parseYieldOrReturn(
  source: string,
  pos: number,
  env: Env,
  type: "yield" | "return",
): ParserResult {
  pos = skipWhitespace(source, pos);
  const exprResult = parseLogicalOr(source, pos, env);
  const flagName = type === "yield" ? "yieldRequested" : "returnRequested";
  const valueName = type === "yield" ? "yieldValue" : "returnValue";
  (env as any)[flagName] = true;
  (env as any)[valueName] = exprResult.value;
  pos = skipWhitespace(source, exprResult.pos);
  if (source.charCodeAt(pos) === 59) pos = pos + 1;
  return { value: exprResult.value, pos };
}

function parseComparison(source: string, pos: number, env: Env): ParserResult {
  // Special handling for "identifier is Type" pattern
  const trimmedPos = skipWhitespace(source, pos);
  const potentialId = parseIdentifier(source, trimmedPos);

  if (potentialId) {
    const afterIdPos = skipWhitespace(source, potentialId.end);
    const isKeyword = skipKeyword(source, afterIdPos, "is");

    if (isKeyword !== null) {
      // This is an "identifier is Type" pattern
      const typePos = skipWhitespace(source, isKeyword);
      const typeName = parseIdentifier(source, typePos);

      if (typeName) {
        // Look up the identifier to get its struct type if any
        const idEntry = env[potentialId.name];
        let checkResult = 0;
        let structName: string | undefined;
        let endPos = typeName.end;
        let resolvedTypeName = resolveTypeAlias(typeName.name, env);

        if (idEntry && idEntry.type === "structInstance") {
          // Direct struct instance entry
          const instance = idEntry as StructInstance;
          structName = instance.structName;
        } else if (idEntry && idEntry.type === "variable") {
          // Variable with struct type
          const variable = idEntry as Variable;
          structName = variable.structType;
        }

        if (structName) {
          // Variable/instance holds a struct - check if type matches
          if (structName === resolvedTypeName) {
            checkResult = 1;
          } else {
            // Check if typeName is a union type alias containing this struct
            const typeEntry = env[resolvedTypeName];
            if (typeEntry && typeEntry.type === "typeAlias") {
              const alias = typeEntry as TypeAlias;
              if (alias.unionTypes && alias.unionTypes.includes(structName)) {
                checkResult = 1;
              }
            }
          }
        } else {
          if (isNumericType(resolvedTypeName)) {
            checkResult = 1;
          }
        }

        // Skip destructuring pattern if present: { field1, field2 }
        const afterTypePos = skipWhitespace(source, endPos);
        if (source.charCodeAt(afterTypePos) === 123) {
          // '{'
          const destructResult = parseIdentifierList(
            source,
            afterTypePos,
            false,
          );
          if (destructResult) {
            endPos = destructResult.pos;
          }
        }

        return { value: checkResult, pos: endPos };
      }
    }
  }

  // Standard comparison parsing for other expressions
  const result = parseBinaryOperator(
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

  // Handle 'is' operator as postfix for non-variable expressions (like literals)
  let currentResult = result;
  let iterations = 0;
  while (iterations < MAX_LOOP_ITERATIONS) {
    const keywordPos = skipWhitespace(source, currentResult.pos);
    const isKeyword = skipKeyword(source, keywordPos, "is");

    if (isKeyword === null) {
      break;
    }

    const typePos = skipWhitespace(source, isKeyword);
    const typeName = parseIdentifier(source, typePos);

    if (!typeName) {
      break;
    }

    let resolvedTypeName = resolveTypeAlias(typeName.name, env);

    // Check if resolved type is numeric (I32, etc)
    const checkResult = isNumericType(resolvedTypeName) ? 1 : 0;
    currentResult = { value: checkResult, pos: typeName.end };
    iterations++;
  }

  return currentResult;
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

function parseIdentifierWithPosition(
  source: string,
  pos: number,
): { identifier: { name: string; end: number } | null; pos: number } {
  const identifier = parseIdentifier(source, pos);
  if (!identifier) {
    return { identifier: null, pos };
  }
  const afterIdPos = skipWhitespace(source, identifier.end);
  return { identifier, pos: afterIdPos };
}

function tryParsePointerAssignment(
  source: string,
  pos: number,
  env: Env,
): ParserResult | null {
  const startPos = skipWhitespace(source, pos);
  if (source.charCodeAt(startPos) !== 42) {
    // '*'
    return null;
  }

  const identifier = parseIdentifierAfterOperator(source, startPos);
  if (!identifier) {
    return null;
  }

  const afterIdPos = skipWhitespace(source, identifier.end);
  if (source.charCodeAt(afterIdPos) !== 61) {
    // '='
    return null;
  }

  const entry = env[identifier.name];
  if (!entry || entry.type !== "pointer") {
    return null;
  }

  const assignPos = skipWhitespace(source, afterIdPos + 1);
  const rhsResult = parseLogicalOr(source, assignPos, env);
  const pointerEntry = entry as PointerDef;

  if (pointerEntry.pointsToName && pointerEntry.pointsToName in env) {
    const targetEntry = env[pointerEntry.pointsToName];
    if (targetEntry && targetEntry.type === "variable") {
      const targetVar = targetEntry as Variable;
      if (pointerEntry.isMutable && targetVar.mutable) {
        targetVar.value = rhsResult.value;
      }
    }
  }

  const endPos = skipSemicolonAndWhitespace(source, rhsResult.pos);
  return { value: rhsResult.value, pos: endPos };
}

function tryParseArraySliceAssignment(
  source: string,
  pos: number,
  env: Env,
): ParserResult | null {
  const startPos = skipWhitespace(source, pos);

  // Try to parse identifier
  const { identifier, pos: afterIdPos } = parseIdentifierWithPosition(
    source,
    startPos,
  );
  if (!identifier) {
    return null;
  }

  // Check if followed by '['
  if (source.charCodeAt(afterIdPos) !== 91) {
    return null;
  }

  // Check if this identifier is a mutable slice pointer
  const entry = env[identifier.name];
  if (!entry || entry.type !== "pointer") {
    return null;
  }

  const pointerEntry = entry as any;
  if (
    !pointerEntry.isMutable ||
    !pointerEntry.__sliceSourceName ||
    pointerEntry.__sliceStart === undefined
  ) {
    return null;
  }

  // Parse the index
  let indexPos = skipWhitespace(source, afterIdPos + 1);
  const indexResult = parseLogicalOr(source, indexPos, env);
  indexPos = skipWhitespace(source, indexResult.pos);

  // Expect ']'
  if (source.charCodeAt(indexPos) !== 93) {
    return null;
  }

  const afterBracketPos = skipWhitespace(source, indexPos + 1);

  // Expect '='
  if (source.charCodeAt(afterBracketPos) !== 61) {
    return null;
  }

  // Parse RHS
  const assignPos = skipWhitespace(source, afterBracketPos + 1);
  const rhsResult = parseLogicalOr(source, assignPos, env);

  // Update the original array
  const sourceArray = env[pointerEntry.__sliceSourceName];
  if (sourceArray && sourceArray.type === "array") {
    const arrayDef = sourceArray as ArrayDef;
    const sliceIndex = Math.floor(indexResult.value);
    const actualIndex = pointerEntry.__sliceStart + sliceIndex;

    if (actualIndex >= 0 && actualIndex < arrayDef.elements.length) {
      arrayDef.elements[actualIndex] = rhsResult.value;
    }
  }

  const endPos = skipSemicolonAndWhitespace(source, rhsResult.pos);
  return { value: rhsResult.value, pos: endPos };
}

function parseAssignmentOrExpression(
  source: string,
  pos: number,
  env: Env,
): ParserResult {
  const startPos = pos;
  pos = skipWhitespace(source, startPos);

  const pointerAssignResult = tryParsePointerAssignment(source, pos, env);
  if (pointerAssignResult) {
    return pointerAssignResult;
  }

  const arraySliceAssignResult = tryParseArraySliceAssignment(source, pos, env);
  if (arraySliceAssignResult) {
    return arraySliceAssignResult;
  }

  // Try to parse an identifier (potential assignment target)
  const identifier = parseIdentifier(source, pos);
  if (identifier) {
    const afterIdPos = skipWhitespace(source, identifier.end);
    const nextCode = source.charCodeAt(afterIdPos);
    const varName = identifier.name;

    // Check if this is an assignment attempt
    const isCompoundAssignment =
      (nextCode === 43 ||
        nextCode === 45 ||
        nextCode === 42 ||
        nextCode === 47) &&
      source.charCodeAt(afterIdPos + 1) === 61;
    // Simple assignment is '=' but not '==' or '=>' or other operators ending in '='
    const isSimpleAssignment =
      nextCode === 61 && source.charCodeAt(afterIdPos + 1) !== 61;

    if (isCompoundAssignment || isSimpleAssignment) {
      // This is an assignment - check if variable exists and is mutable
      const entry = varName in env ? env[varName] : null;
      if (!entry) {
        throw new Error(`Undefined variable: ${varName}`);
      }
      if (entry.type !== "variable") {
        throw new Error(`Cannot assign to non-variable: ${varName}`);
      }
      if (!entry.mutable) {
        throw new Error(`Cannot reassign immutable variable: ${varName}`);
      }

      // Variable is mutable, process the assignment
      if (isCompoundAssignment) {
        // Compound assignment operators: +=, -=, *=, /=
        const assignPos = skipWhitespace(source, afterIdPos + 2);
        const rhsResult = parseLogicalOr(source, assignPos, env);
        const rhsValue = rhsResult.value;
        const currentValue = entry.value;

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
      } else {
        // Simple assignment
        const assignPos = skipWhitespace(source, afterIdPos + 1);
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

  // Check for unary MINUS operator (-)
  if (source.charCodeAt(pos) === 45) {
    // '-'
    pos = skipWhitespace(source, pos + 1);
    const result = parseUnary(source, pos, env); // Allow chaining of unary operators
    return { value: -result.value, pos: result.pos };
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

  const globalEnv: Env = {};
  let result = parseStatement(source, 0, globalEnv);
  let pos = skipWhitespace(source, result.pos);

  // Continue parsing additional top-level statements/expressions until EOF
  let iterations = 0;
  while (pos < source.length && iterations < MAX_LOOP_ITERATIONS) {
    result = parseStatement(source, pos, globalEnv);
    pos = skipWhitespace(source, result.pos);
    iterations++;
  }

  // Normalize -0 to +0 for consistency
  return result.value === 0 ? 0 : result.value;
}
