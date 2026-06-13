/** Parse declaration with types, pointers, aliases, refinements. */
export function parseDeclaration(
  input: string,
): { name: string; typeAnnot?: string; rhs: string } | null {
  // Non-zero refinement: `let x : U8 != 0 = ...`
  const nzMatch = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*(\*?)?([A-Za-z]\w*)(?:<[^>]+>)?\s*!=\s*0\s*=\s*(.+)$/,
  );
  if (nzMatch && nzMatch[1] && nzMatch[4]) {
    const pointerPrefix = nzMatch[2]; // "*" or undefined
    const baseType = nzMatch[3]; // "U8", "I32", etc.
    return {
      name: nzMatch[1],
      typeAnnot: `${(pointerPrefix ?? "") + (baseType ?? "")} != 0`,
      rhs: nzMatch[4],
    };
  }

  // Try pattern with a colon-prefixed type, optionally generic like Temp<I32>, and optionally prefixed with * for pointer types.
  // Use balanced bracket tracking to handle nested generics like Temp<Temp<I32>>.
  const declPrefix = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*(\*?)?([A-Za-z]\w*)/,
  );
  if (declPrefix && declPrefix[1]) {
    const name = declPrefix[1];
    const pointerPrefix = declPrefix[2] ?? "";
    let baseType = declPrefix[3]!;
    // Continue scanning after the matched prefix to capture any generic params with balanced < > tracking
    let pos = declPrefix[0].length;
    while (pos < input.length) {
      const ch = input[pos];
      if (ch === "<") {
        // Collect everything inside balanced angle brackets, including the brackets themselves
        const genericStart = pos;
        let depth = 1;
        pos++;
        while (pos < input.length && depth > 0) {
          if (input[pos] === "<") depth++;
          else if (input[pos] === ">") depth--;
          pos++;
        }
        baseType += input.slice(genericStart, pos);
      } else {
        break;
      }
    }
    // Skip whitespace and look for `!=` (non-zero refinement) or plain `=`
    while (pos < input.length && /\s/.test(input[pos]!)) pos++;
    let isNonZero = false;
    if (input[pos] === "!" && input[pos + 1] === "=") {
      // Skip past `!= 0`
      isNonZero = true;
      while (pos < input.length && /\s/.test(input[pos]!)) pos++;
      pos += 2; // skip `!=`
      while (pos < input.length && /\s/.test(input[pos]!)) pos++;
      if (input[pos] === "0") pos++; // skip `0`
      while (pos < input.length && /\s/.test(input[pos]!)) pos++;
    }
    if (pos < input.length && input[pos] === "=") {
      const rhs = input.slice(pos + 1).trim();
      return {
        name,
        typeAnnot: pointerPrefix + baseType + (isNonZero ? " != 0" : ""),
        rhs,
      };
    }
  }

  // Try pattern without a colon-prefixed type (no explicit annotation)
  const simpleMatch = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*=\s*(.+)$/,
  );
  if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
    return { name: simpleMatch[1], typeAnnot: undefined, rhs: simpleMatch[2] };
  }

  // Try refinement type: `let x : 5U8 = ...` (numeric literal with optional suffix as type annotation)
  const refMatch = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*(-?[0-9]+(?:\.[0-9]+)?)([A-Za-z]\w*)?\s*=\s*(.+)$/,
  );
  if (refMatch && refMatch[1] && refMatch[4]) {
    const numPart = refMatch[2]; // "5", "-3.14", etc.
    const suffixPart = refMatch[3]; // "U8", "I32", or undefined
    return {
      name: refMatch[1],
      typeAnnot: `${numPart}${suffixPart ?? ""}`,
      rhs: refMatch[4],
    };
  }

  // Fallback for struct-typed declarations like `let point : { x : I32, y : I32 } = ...`
  const structPrefix = input.match(
    /^(?:let|const|var)\s+(?:(?:mut)\s+)?(\w+)\s*:\s*\{/,
  );
  if (!structPrefix) return null;

  // Simpler approach: find first `=` outside of braces, starting after the prefix match
  const remainder = input.slice(structPrefix[0].length);
  let braceDepth = 1;
  for (let i = 0; i < remainder.length; i++) {
    if (remainder[i] === "{") braceDepth++;
    else if (remainder[i] === "}") braceDepth--;
    else if (remainder[i] === "=" && braceDepth === 0) {
      const rhs = remainder.slice(i + 1).trim();
      return {
        name: structPrefix[1]!,
        typeAnnot: undefined /* struct types not validated yet */,
        rhs,
      };
    }
  }

  return null;
}
