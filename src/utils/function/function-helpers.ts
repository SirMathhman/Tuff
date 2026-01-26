import { parseGenericParams } from "../generic-params";

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
  const { name, params } = parseGenericParams(s);
  return { name, generics: params };
}
