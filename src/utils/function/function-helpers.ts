export function findMatchingCloseParen(s: string, openIndex: number): number {
  let depth = 1;
  for (let i = openIndex + 1; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function parseCallArgsAndRest(
  trimmed: string,
  openParenIndex: number,
): { closeParenIndex: number; argsStr: string; rest: string } | undefined {
  const closeParenIndex = findMatchingCloseParen(trimmed, openParenIndex);
  if (closeParenIndex === -1) return undefined;
  const argsStr = trimmed.slice(openParenIndex + 1, closeParenIndex).trim();
  const rest = trimmed.slice(closeParenIndex + 1).trim();
  return { closeParenIndex, argsStr, rest };
}

export function extractFunctionName(s: string): {
  name: string;
  generics: string[];
} {
  const angleStart = s.indexOf("<");
  if (angleStart === -1) return { name: s, generics: [] };
  const angleEnd = s.indexOf(">");
  if (angleEnd === -1) return { name: s, generics: [] };
  const name = s.slice(0, angleStart).trim();
  const paramStr = s.slice(angleStart + 1, angleEnd).trim();
  const generics = paramStr.split(",").map((p) => p.trim());
  return { name, generics };
}
