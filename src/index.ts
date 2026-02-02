function parseNumericLiteral(source: string, start: number): { value: number; end: number } | null {
  let numEnd = start;
  while (
    numEnd < source.length &&
    source.charCodeAt(numEnd) >= 48 && // '0'
    source.charCodeAt(numEnd) <= 57    // '9'
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
    (
      (source.charCodeAt(suffixEnd) >= 65 && source.charCodeAt(suffixEnd) <= 90) || // 'A'-'Z'
      (source.charCodeAt(suffixEnd) >= 97 && source.charCodeAt(suffixEnd) <= 122) || // 'a'-'z'
      (source.charCodeAt(suffixEnd) >= 48 && source.charCodeAt(suffixEnd) <= 57)    // '0'-'9'
    )
  ) {
    suffixEnd++;
  }
  return {
    value: parseInt(source.substring(start, numEnd), 10),
    end: suffixEnd
  };
}

function skipWhitespace(source: string, pos: number): number {
  while (pos < source.length && source.charCodeAt(pos) === 32) { // ' '
    pos++;
  }
  return pos;
}

export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }

  let pos = skipWhitespace(source, 0);
  const first = parseNumericLiteral(source, pos);
  if (!first) {
    return parseInt(source, 10);
  }

  let result = first.value;
  pos = skipWhitespace(source, first.end);

  // Loop to handle chained operations
  while (pos < source.length) {
    // Check for addition or subtraction operator
    if (source.charCodeAt(pos) === 43) { // '+'
      pos = skipWhitespace(source, pos + 1);
      const operand = parseNumericLiteral(source, pos);
      if (operand) {
        result = result + operand.value;
        pos = skipWhitespace(source, operand.end);
      } else {
        break;
      }
    } else if (source.charCodeAt(pos) === 45) { // '-'
      pos = skipWhitespace(source, pos + 1);
      const operand = parseNumericLiteral(source, pos);
      if (operand) {
        result = result - operand.value;
        pos = skipWhitespace(source, operand.end);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return result;
}
