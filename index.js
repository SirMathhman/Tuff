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

export function compile(source) {
  const trimmed = source.trim();
  if (trimmed === "") return "return 0;";

  let idxRef = { current: 0 };

  // Check for statements (semicolons or newlines separating multiple expressions/statements)
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
