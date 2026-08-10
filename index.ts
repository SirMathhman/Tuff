function isBalanced(source: string, open: string, close: string): boolean {
  let count = 0;
  for (const ch of source) {
    if (ch === open) count++;
    else if (ch === close) count--;
    if (count < 0) return false;
  }
  return count === 0;
}

export function compileTuffToJS(source: string) {
  if (source === "") {
    return "";
  }
  if (!isBalanced(source, "{", "}") || !isBalanced(source, "(", ")")) {
    throw new Error("Source contains invalid Tuff syntax");
  }
  const jsSource = source.replace(/{/g, "(").replace(/}/g, ")");
  if (/^[\d\s\+\-\*\/\(\)]+$/.test(jsSource)) {
    return "process.exit(" + jsSource + ")";
  }
  throw new Error("Source contains invalid Tuff syntax");
}
