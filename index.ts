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

export function compileTuffToJS(source: string) {
  if (source === "") {
    return "";
  }
  const jsSource = compileSourceToJS(source);
  return "process.exit(" + jsSource + ")";
}
