function replaceRead(source) {
  let result = "";
  let pos = 0;
  for (const match of String(source).matchAll(/read\(\)/g)) {
    result += source.slice(pos, match.index);
    result += "nextToken()";
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

function checkPartMutability(part, mutableVars) {
  if (/^let\s+mut\b/.test(part)) {
    const mutMatch = part.match(/^let\s+mut\s+(\w+)/);
    mutableVars.add(mutMatch[1]);
    return;
  }
  // Check for reassignment to immutable variable
  const assignMatch = part.match(/^(\w+)\s*=/);
  if (!assignMatch || mutableVars.has(assignMatch[1])) {
    return;
  }
  throw new Error(
    "Cannot reassign immutable variable '" + assignMatch[1] + "'",
  );
}

function checkMutability(parts) {
  const mutableVars = new Set();
  for (const part of parts) {
    checkPartMutability(part, mutableVars);
  }
}

function buildBody(parts) {
  let body = "";
  for (let i = 0; i < parts.length - 1; i++) {
    body += replaceRead(parts[i]).trim() + ";\n";
  }
  const lastPart = replaceRead(parts[parts.length - 1]);
  body += "return " + lastPart.trim() + ";";
  return body;
}

function compileExpression(trimmed) {
  const compiled = replaceRead(trimmed);
  return "return " + compiled.trim() + ";";
}

function processFunctions(parts) {
  let funcDecls = "";
  const remainingParts = [];
  for (const part of parts) {
    // Match fn name() => body;
    const match = part.match(/^fn\s+(\w+)\s*\(\)\s*=>\s*(.+)$/);
    if (match) {
      const funcName = match[1];
      let funcBody = replaceRead(match[2]);
      funcDecls +=
        "function " + funcName + "(){return " + funcBody.trim() + ";}\n";
    } else {
      remainingParts.push(part);
    }
  }
  return { funcDecls, remainingParts };
}

function buildTokenIterator() {
  return (
    "let tokens=stdIn.split(' ');let idx=0;" +
    "function nextToken(){return parseInt(tokens[idx++],10);}"
  );
}

function buildOutput(funcDecls, finalParts, trimmed) {
  const body =
    finalParts.length > 1 ? buildBody(finalParts) : compileExpression(trimmed);

  let output = "";
  if (funcDecls.trim()) {
    output += funcDecls + "\n";
  }
  output += body;

  return buildTokenIterator() + output;
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

  const parts = trimmed
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  // Extract function declarations and replace read() in them
  const { funcDecls, remainingParts } = processFunctions(parts);

  // Track mutable vs immutable variables for reassignment checks
  checkMutability(remainingParts);

  // Replace `let mut` with `let` (JS doesn't have immutable let)
  trimmed = remainingParts
    .map((p) => p.replace(/^let\s+mut\b/g, "let"))
    .join(";");

  const finalParts = trimmed
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  return buildOutput(funcDecls, finalParts, trimmed);
}
