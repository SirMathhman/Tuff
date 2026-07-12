function isValidChar(ch) {
  if (ch >= "0" && ch <= "9") return true;
  const allowed = " \t\n\r+-*/(){ }";
  return allowed.indexOf(ch) !== -1;
}

function validateSource(source) {
  let i = 0;
  while (i < source.length) {
    if (source.substring(i, i + 6) === "read()") {
      i += 6;
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

function transformBlocks(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "{") {
      const endIdx = findMatchingBrace(source, i);
      const inner = source.substring(i + 1, endIdx);
      result += "(" + transformBlocks(inner) + ")";
      i = endIdx + 1;
    } else {
      result += source[i];
      i++;
    }
  }
  return result;
}

export function compile(source) {
  if (source === "") {
    return "return 0;";
  }

  if (!validateSource(source)) {
    throw new Error("Invalid source: " + source);
  }

  const transformed = transformBlocks(source);

  return (
    "var _tokens = stdIn.split(/\\s+/);\n" +
    "function read() { return parseInt(_tokens.shift()); }\n" +
    "return " +
    transformed +
    ";"
  );
}
