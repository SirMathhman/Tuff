import { Token } from "./tokenize";

export function indexUntilSemicolon(tokensArr: Token[], start: number): number {
  let j = start;
  let parenDepth = 0;
  let braceDepth = 0;
  while (j < tokensArr.length) {
    const tk = tokensArr[j];
    if (tk.type === "paren") {
      parenDepth += tk.value === "(" ? 1 : -1;
    } else if (tk.type === "punct") {
      if (tk.value === "{") braceDepth++;
      else if (tk.value === "}") braceDepth--;
      else if (tk.value === ";" && parenDepth === 0 && braceDepth === 0)
        return j;
    }
    j++;
  }
  return j;
}

export function findMatchingBrace(tokens: Token[], start: number): number {
  if (
    !tokens[start] ||
    tokens[start].type !== "punct" ||
    tokens[start].value !== "{"
  )
    return -1;
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === "punct") {
      if (tk.value === "{") depth++;
      else if (tk.value === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}
