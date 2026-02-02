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

function parsePrimary(
  source: string,
  pos: number,
  env: Record<string, number>,
): { value: number; pos: number } {
  pos = skipWhitespace(source, pos);

  // Check for opening parenthesis
  if (source.charCodeAt(pos) === 40) {
    // '('
    pos = skipWhitespace(source, pos + 1);
    const result = parseAdditive(source, pos, env);
    pos = skipWhitespace(source, result.pos);
    if (source.charCodeAt(pos) === 41) {
      // ')'
      pos = pos + 1;
    }
    return { value: result.value, pos };
  }

  // Check for opening curly brace
  if (source.charCodeAt(pos) === 123) {
    // '{'
    pos = skipWhitespace(source, pos + 1);
    const result = parseBlock(source, pos, env);
    pos = skipWhitespace(source, result.pos);
    if (source.charCodeAt(pos) === 125) {
      // '}'
      pos = pos + 1;
    }
    return { value: result.value, pos };
  }

  // Check for 'let' keyword
  const letPos = skipKeyword(source, pos, 'let');
  if (letPos !== null) {
    return parseLetBinding(source, letPos, env);
  }

  // Check for identifier (variable lookup)
  const identifier = parseIdentifier(source, pos);
  if (identifier && identifier.name in env) {
    return { value: env[identifier.name] ?? 0, pos: identifier.end };
  }

  // Otherwise parse numeric literal
  const numLiteral = parseNumericLiteral(source, pos);
  if (numLiteral) {
    return { value: numLiteral.value, pos: numLiteral.end };
  }

  return { value: 0, pos };
}

function parseLetBinding(
  source: string,
  pos: number,
  env: Record<string, number>,
): { value: number; pos: number } {
  pos = skipWhitespace(source, pos);

  // Parse variable name
  const identifier = parseIdentifier(source, pos);
  if (!identifier) {
    return { value: 0, pos };
  }
  pos = skipWhitespace(source, identifier.end);

  // Skip ':'
  if (source.charCodeAt(pos) === 58) {
    // ':'
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  // Skip type name (e.g., "U8", "I32")
  const typeId = parseIdentifier(source, pos);
  if (typeId) {
    pos = skipWhitespace(source, typeId.end);
  }

  // Skip '='
  if (source.charCodeAt(pos) === 61) {
    // '='
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  // Parse initializer expression
  const initResult = parseAdditive(source, pos, env);
  const value = initResult.value;
  pos = skipWhitespace(source, initResult.pos);

  // Skip ';'
  if (source.charCodeAt(pos) === 59) {
    // ';'
    pos = pos + 1;
  }
  pos = skipWhitespace(source, pos);

  // Create new environment with the binding
  const newEnv = { ...env, [identifier.name]: value };

  // Parse body expression
  const bodyResult = parseAdditive(source, pos, newEnv);
  return { value: bodyResult.value, pos: bodyResult.pos };
}

function parseBlock(
  source: string,
  pos: number,
  env: Record<string, number>,
): { value: number; pos: number } {
  return parseAdditive(source, pos, env);
}

function parseMultiplicative(
  source: string,
  pos: number,
  env: Record<string, number>,
): { value: number; pos: number } {
  const left = parsePrimary(source, pos, env);
  let result = left.value;
  pos = left.pos;

  while (pos < source.length) {
    pos = skipWhitespace(source, pos);
    const charCode = source.charCodeAt(pos);
    if (charCode === 42) {
      // '*'
      pos = skipWhitespace(source, pos + 1);
      const right = parsePrimary(source, pos, env);
      result = result * right.value;
      pos = right.pos;
    } else if (charCode === 47) {
      // '/'
      pos = skipWhitespace(source, pos + 1);
      const right = parsePrimary(source, pos, env);
      result = result / right.value;
      pos = right.pos;
    } else {
      break;
    }
  }

  return { value: result, pos };
}

function parseAdditive(
  source: string,
  pos: number,
  env: Record<string, number>,
): { value: number; pos: number } {
  const left = parseMultiplicative(source, pos, env);
  let result = left.value;
  pos = left.pos;

  while (pos < source.length) {
    const charCode = source.charCodeAt(pos);
    if (charCode === 43) {
      // '+'
      pos = skipWhitespace(source, pos + 1);
      const right = parseMultiplicative(source, pos, env);
      result = result + right.value;
      pos = right.pos;
    } else if (charCode === 45) {
      // '-'
      pos = skipWhitespace(source, pos + 1);
      const right = parseMultiplicative(source, pos, env);
      result = result - right.value;
      pos = right.pos;
    } else {
      break;
    }
  }

  return { value: result, pos };
}

export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }

  let pos = skipWhitespace(source, 0);

  // Check for top-level 'let' keyword
  const letPos = skipKeyword(source, pos, 'let');
  if (letPos !== null) {
    const result = parseLetBinding(source, letPos, {});
    return result.value;
  }

  const result = parseAdditive(source, 0, {});
  return result.value;
}
