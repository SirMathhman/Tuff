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
): { value: number; pos: number } {
  pos = skipWhitespace(source, pos);

  // Check for opening parenthesis
  if (source.charCodeAt(pos) === 40) {
    // '('
    pos = skipWhitespace(source, pos + 1);
    const result = parseAdditive(source, pos);
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
    const result = parseAdditive(source, pos);
    pos = skipWhitespace(source, result.pos);
    if (source.charCodeAt(pos) === 125) {
      // '}'
      pos = pos + 1;
    }
    return { value: result.value, pos };
  }

  // Otherwise parse numeric literal
  const numLiteral = parseNumericLiteral(source, pos);
  if (numLiteral) {
    return { value: numLiteral.value, pos: numLiteral.end };
  }

  return { value: 0, pos };
}

function parseMultiplicative(
  source: string,
  pos: number,
): { value: number; pos: number } {
  const left = parsePrimary(source, pos);
  let result = left.value;
  pos = left.pos;

  while (pos < source.length) {
    pos = skipWhitespace(source, pos);
    const charCode = source.charCodeAt(pos);
    if (charCode === 42) {
      // '*'
      pos = skipWhitespace(source, pos + 1);
      const right = parsePrimary(source, pos);
      result = result * right.value;
      pos = right.pos;
    } else if (charCode === 47) {
      // '/'
      pos = skipWhitespace(source, pos + 1);
      const right = parsePrimary(source, pos);
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
): { value: number; pos: number } {
  const left = parseMultiplicative(source, pos);
  let result = left.value;
  pos = left.pos;

  while (pos < source.length) {
    const charCode = source.charCodeAt(pos);
    if (charCode === 43) {
      // '+'
      pos = skipWhitespace(source, pos + 1);
      const right = parseMultiplicative(source, pos);
      result = result + right.value;
      pos = right.pos;
    } else if (charCode === 45) {
      // '-'
      pos = skipWhitespace(source, pos + 1);
      const right = parseMultiplicative(source, pos);
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

  const result = parseAdditive(source, 0);
  return result.value;
}
