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
    // Match fn name(params) => body; or fn name() => body;
    const match = part.match(/^fn\s+(\w+)\s*\(([^)]*)\)\s*=>\s*(.+)$/);
    if (match) {
      const funcName = match[1];
      const paramsStr = match[2].trim();
      let funcBody = replaceRead(match[3]);
      funcDecls +=
        "function " +
        funcName +
        "(" +
        paramsStr +
        "){return " +
        funcBody.trim() +
        ";}\n";
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

function validateLiterals(source) {
  const matches = source.matchAll(/(?<!\w)(-?\d+)(U|I)(\d+)/g);
  for (const match of matches) {
    const value = parseInt(match[1], 10);
    const signedness = match[2]; // 'U' or 'I'
    const bits = parseInt(match[3], 10);
    let minVal, maxVal;
    if (signedness === "U") {
      minVal = 0;
      maxVal = Math.pow(2, bits) - 1;
    } else {
      minVal = -Math.pow(2, bits - 1);
      maxVal = Math.pow(2, bits - 1) - 1;
    }
    if (value > maxVal || value < minVal) {
      throw new Error("Literal " + match[1] + " out of range for U" + bits);
    }
  }
}

function parseAliases(source) {
  const simpleAliases = {};
  const genericAliases = {};

  for (const match of source.matchAll(/\btype\s+(\w+)<(\w+)>\s*=\s*(\w+)/g)) {
    genericAliases[match[1]] = { param: match[2], body: match[3] };
  }

  for (const match of source.matchAll(/\btype\s+(\w+)\s*=\s*(U|I)(\d+)\b/g)) {
    simpleAliases[match[1]] = match[2] + match[3];
  }

  return { simpleAliases, genericAliases };
}

function replaceGenericAlias(
  typeStr,
  alias,
  info,
  simpleAliases,
  genericAliases,
) {
  const resolvedInner = resolveType(
    info.param === info.body ? typeStr : info.param,
    simpleAliases,
    genericAliases,
  );
  return info.body === info.param
    ? resolvedInner
    : info.body.replace(info.param, resolvedInner);
}

function tryResolveGeneric(typeStr, simpleAliases, genericAliases) {
  for (const [alias, info] of Object.entries(genericAliases)) {
    const regex = new RegExp(`\\b${alias}<(\\w+)>`);
    if (!regex.test(typeStr)) continue;
    return typeStr.replace(regex, (_m, innerType) =>
      replaceGenericAlias(
        innerType,
        alias,
        info,
        simpleAliases,
        genericAliases,
      ),
    );
  }
  return null; // no match
}

function tryResolveSimple(typeStr, simpleAliases, genericAliases) {
  for (const [alias, actualType] of Object.entries(simpleAliases)) {
    if (typeStr !== alias) continue;
    return resolveType(actualType, simpleAliases, genericAliases);
  }
  return null; // no match
}

function resolveType(typeStr, simpleAliases, genericAliases) {
  let changed = true;
  while (changed) {
    const resolvedGeneric = tryResolveGeneric(
      typeStr,
      simpleAliases,
      genericAliases,
    );
    if (resolvedGeneric !== null) {
      typeStr = resolvedGeneric;
      continue;
    }

    const resolvedSimple = tryResolveSimple(
      typeStr,
      simpleAliases,
      genericAliases,
    );
    if (resolvedSimple !== null) {
      typeStr = resolvedSimple;
      continue;
    }

    changed = false;
  }

  return typeStr;
}

function replaceAnnotations(result, parts, simpleAliases, genericAliases) {
  for (const part of parts) {
    if (/^type\s+\w+/.test(part)) continue; // skip the declaration itself

    let processedPart = part;
    const annotMatch = processedPart.match(/:\s*(\S+)/);
    if (!annotMatch) continue;

    const resolvedType = resolveType(
      annotMatch[1],
      simpleAliases,
      genericAliases,
    );
    const escapedType = annotMatch[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    processedPart = processedPart.replace(
      new RegExp(`:\\s*${escapedType}`),
      `: ${resolvedType}`,
    );

    result = result.replace(part, processedPart);
  }
  return result;
}

function resolveAliases(source) {
  const { simpleAliases, genericAliases } = parseAliases(source);

  let result = source;
  const parts = result
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  result = replaceAnnotations(result, parts, simpleAliases, genericAliases);

  return { resolvedSource: result };
}

function stripTypes(source) {
  let result = source;

  // Strip type suffixes from numeric literals (U8, U16, U32, I8, etc.)
  result = result.replace(/(?<!\w)(-?\d+)([UI]\d+)/g, "$1");

  // Strip typed array annotations: let x : [Type; size] => let x
  result = result.replace(/\b(\w+)\s*:\s*\[(U|I)\d+\s*;\s*\d+\]/g, "$1");

  // Strip type annotations from variable declarations: let x : Type => let x
  result = result.replace(/\b(\w+)\s*:\s*(U|I)\d+\b/g, "$1");

  // Strip generic arguments from function calls: read<Type> => read
  result = result.replace(/(\w+)<(U|I)\d+>/g, "$1");

  // Remove type alias declarations (they're only needed at compile time)
  const parts2 = result.split(";").map((p) => p.trim()).filter(Boolean);
  return parts2.filter((p) => !/^type\s+\w+/.test(p)).join(";");
}

function checkNarrowingConversions(source) {
  const declMatches = source.matchAll(
    /let\s+(?:mut\s+)?\w+\s*:\s*(U|I)(\d+)\s*=\s*\w+<(U|I)(\d+)>\(\)/g,
  );
  for (const match of declMatches) {
    const varBits = parseInt(match[2], 10);
    const readBits = parseInt(match[4], 10);
    if (readBits > varBits) {
      throw new Error(
        "Cannot assign read<" +
          match[3] +
          match[4] +
          "> to variable of type " +
          match[1] +
          match[2],
      );
    }
  }
}

export function compile(source) {
  let trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  // Resolve type aliases first
  const { resolvedSource } = resolveAliases(trimmed);
  trimmed = resolvedSource;

  // Validate numeric literals with type suffixes
  validateLiterals(trimmed);

  // Check for narrowing conversions: read<LargeType> assigned to SmallType variable
  checkNarrowingConversions(trimmed);

  // Strip all compile-time type syntax (suffixes, annotations, generics, alias decls)
  trimmed = stripTypes(trimmed);

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
