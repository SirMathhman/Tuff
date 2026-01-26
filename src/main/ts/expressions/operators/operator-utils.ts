// Utility functions for operator detection to avoid having overly large operator files

export function isValidCharBeforeDot(ch: string): boolean {
  return (
    (ch >= "0" && ch <= "9") ||
    ch === ")" ||
    ch === "}" ||
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_"
  );
}

export function isValidCharAfterDot(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

export function isIdentifierChar(ch: string): boolean {
  return (
    (ch >= "0" && ch <= "9") ||
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_"
  );
}

export function isValidCharBeforeOperator(ch: string): boolean {
  return isValidCharBeforeDot(ch);
}
export function isPositionInsideBrackets(s: string, pos: number): boolean {
  let depth = 0;
  for (let i = 0; i < pos; i++) {
    const ch = s[i];
    // Skip over string literals
    if (ch === '"') {
      i++;
      while (i < pos && s[i] !== '"') {
        if (s[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < pos && s[i] !== "'") {
        if (s[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
  }
  return depth > 0;
}
