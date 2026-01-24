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
  return (
    (ch >= "0" && ch <= "9") ||
    ch === ")" ||
    ch === "}" ||
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_"
  );
}
