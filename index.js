function replaceRead(source, idxRef) {
  let result = "";
  let pos = 0;
  for (const match of String(source).matchAll(/read\(\)/g)) {
    result += source.slice(pos, match.index);
    result += `parseInt(stdIn.split(' ')[${idxRef.current}], 10)`;
    idxRef.current++;
    pos = match.index + match[0].length;
  }
  if (pos < source.length) {
    result += source.slice(pos);
  }
  return result;
}

function findMatchingBrace(source, start) {
  let depth = 1;
  let j = start;
  while (j < source.length && depth > 0) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}") depth--;
    j++;
  }
  return j - 1; // index of matching '}'
}

function buildIIFE(innerContent) {
  const parts = innerContent
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  let body = "";
  for (let k = 0; k < parts.length - 1; k++) {
    body += parts[k] + ";";
  }
  body += "return " + parts[parts.length - 1] + ";";
  return "(function(){" + body + "})()";
}

function processBlocks(source) {
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] !== "{") {
      result += source[i];
      i++;
      continue;
    }
    const endIdx = findMatchingBrace(source, i + 1);
    const innerContent = processBlocks(source.slice(i + 1, endIdx));
    if (innerContent.includes(";")) {
      result += buildIIFE(innerContent);
    } else {
      result += "(" + innerContent.trim() + ")";
    }
    i = endIdx + 1;
  }
  return result;
}

export function compile(source) {
  let trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  // Reject bare identifiers that aren't valid Tuff constructs
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    throw new Error("Invalid syntax: unknown identifier '" + trimmed + "'");
  }

  // Process curly brace blocks first
  trimmed = processBlocks(trimmed);

  let idxRef = { current: 0 };

  const parts = trimmed
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length > 1) {
    let body = "";
    for (let i = 0; i < parts.length - 1; i++) {
      body += replaceRead(parts[i], idxRef).trim() + ";\n";
    }
    const lastPart = replaceRead(parts[parts.length - 1], idxRef);
    body += "return " + lastPart.trim() + ";";
    return body;
  }

  const compiled = replaceRead(trimmed, idxRef);
  return "return " + compiled.trim() + ";";
}
