function isBalanced(source: string, open: string, close: string): boolean {
  let count = 0;
  for (const ch of source) {
    if (ch === open) count++;
    else if (ch === close) count--;
    if (count < 0) return false;
  }
  return count === 0;
}

function findBlockEnd(source: string, start: number): number {
  let depth = 1;
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("Source contains invalid Tuff syntax: " + source);
}

function compileBlock(blockContent: string): string {
  const statements = blockContent.split(";").map(s => s.trim());
  const lastStatement = statements.pop()!;
  const body = statements.map(s => s + ";").join("") + "return " + lastStatement + ";";
  return "(function(){" + body + "})()";
}

const VALID_CHARS = /^[\d\s\+\-\*\/\(\)\{\}\;\=\w]*$/;

function compileSourceToJS(source: string): string {
  if (source === "") return "";
  if (!VALID_CHARS.test(source)) {
    throw new Error("Source contains invalid Tuff syntax: " + source);
  }
  if (!isBalanced(source, "{", "}") || !isBalanced(source, "(", ")")) {
    throw new Error("Source contains invalid Tuff syntax: " + source);
  }
  let result = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "{") {
      const end = findBlockEnd(source, i);
      const blockContent = source.slice(i + 1, end);
      result += compileBlock(blockContent);
      i = end + 1;
    } else {
      result += source[i];
      i++;
    }
  }
  return result;
}

function hasTopLevelLet(source: string): boolean {
  let braceDepth = 0;
  for (let i = 0; i < source.length - 3; i++) {
    if (source[i] === "{") braceDepth++;
    else if (source[i] === "}") braceDepth--;
    if (braceDepth === 0 && source[i] === "l" && source[i + 1] === "e" && source[i + 2] === "t" && (source[i + 3] === " " || source[i + 3] === "\t")) {
      return true;
    }
  }
  return false;
}

function splitTopLevelStatements(source: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    if (depth === 0 && source[i] === ";") {
      statements.push(current.trim());
      current = "";
    } else {
      current += source[i];
    }
  }
  const last = current.trim();
  if (last !== "") statements.push(last);
  return statements;
}

function compileTopLevelStatements(source: string): string {
  const statements = splitTopLevelStatements(source).map(s => s.trim()).filter(s => s !== "");
  const lastStatement = statements.pop()!;
  const body = statements.map(s => s + ";").join("") + "return " + lastStatement + ";";
  return "(function(){" + body + "})()";
}

export function compileTuffToJS(source: string) {
  if (source === "") {
    return "";
  }
  const jsSource = compileSourceToJS(source);
  if (hasTopLevelLet(source)) {
    return "process.exit(" + compileTopLevelStatements(jsSource) + ")";
  }
  return "process.exit(" + jsSource + ")";
}
