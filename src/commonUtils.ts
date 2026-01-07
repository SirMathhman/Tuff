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

export function findMatching(
  tokens: Token[],
  start: number,
  openType: string,
  openVal: string,
  closeVal: string
): number {
  if (
    !tokens[start] ||
    tokens[start].type !== openType ||
    tokens[start].value !== openVal
  )
    return -1;
  let depth = 0;
  for (let i = start; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type === openType) {
      if (tk.value === openVal) depth++;
      else if (tk.value === closeVal) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

export function findMatchingBrace(tokens: Token[], start: number): number {
  return findMatching(tokens, start, "punct", "{", "}");
}
