import {
  isValidCharBeforeDot,
  isValidCharAfterDot,
  isValidCharBeforeOperator,
  isPositionInsideBrackets,
} from "./operator-utils";

export function findArrayIndexOperator(
  s: string,
): { index: number } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    if (s[i] === "]") {
      // Find matching opening bracket
      let bracketDepth = 1;
      let j = i - 1;
      while (j >= 0 && bracketDepth > 0) {
        const char = s[j];
        if (char === "]") bracketDepth++;
        else if (char === "[") bracketDepth--;
        j--;
      }
      if (bracketDepth === 0) {
        // Found matching [, check if it's array indexing (preceded by identifier/)/]/"/')
        const beforeBracket = j;
        if (beforeBracket >= 0) {
          const ch = s[beforeBracket];
          if (ch) {
            if (
              (ch >= "a" && ch <= "z") ||
              (ch >= "A" && ch <= "Z") ||
              ch === "_" ||
              ch === ")" ||
              ch === "]"
            ) {
              return { index: j + 1 };
            }
            // Handle string literals: closing quote
            if (ch === '"') {
              // Find matching opening quote, accounting for escapes
              let k = beforeBracket - 1;
              let escapedCount = 0;
              while (k >= 0) {
                if (s[k] === "\\") {
                  escapedCount++;
                  k--;
                } else if (s[k] === '"' && escapedCount % 2 === 0) {
                  return { index: j + 1 };
                } else {
                  escapedCount = 0;
                  k--;
                }
              }
            }
            // Handle char literals: closing quote
            if (ch === "'") {
              // For char literals, check simple pattern
              if (beforeBracket >= 2 && s[beforeBracket - 2] === "'") {
                return { index: j + 1 };
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

export function findFieldAccessOperator(
  s: string,
): { index: number } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    if (s[i] === ".") {
      const prev = s[i - 1];
      const next = s[i + 1];
      if (
        prev &&
        isValidCharBeforeDot(prev) &&
        next &&
        isValidCharAfterDot(next)
      ) {
        return { index: i };
      }
      // Handle string literal: closing quote
      if (prev === '"') {
        // Find matching opening quote, accounting for escapes
        let j = i - 2;
        let escapedCount = 0;
        while (j >= 0) {
          if (s[j] === "\\") {
            escapedCount++;
            j--;
          } else if (s[j] === '"' && escapedCount % 2 === 0) {
            if (next && isValidCharAfterDot(next)) {
              return { index: i };
            }
            break;
          } else {
            escapedCount = 0;
            j--;
          }
        }
      }
      // Handle char literal: closing quote
      if (prev === "'") {
        // For char literals, they're always 1 char, so check simpler pattern
        if (i >= 3 && s[i - 3] === "'") {
          if (next && isValidCharAfterDot(next)) {
            return { index: i };
          }
        }
      }
    }
  }
  return undefined;
}

export function findLogicalAnd(s: string): { index: number } | undefined {
  for (let i = s.length - 2; i >= 1; i--) {
    const twoChar = s.slice(i, i + 2);
    if (twoChar === "&&") {
      const prev = s[i - 1];
      if (!prev || prev === " " || isValidCharBeforeOperator(prev)) {
        return { index: i };
      }
    }
  }
  return undefined;
}

export function findIsOperator(s: string): { index: number } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    if (
      s[i - 1] === " " &&
      s[i] === "i" &&
      s[i + 1] === "s" &&
      (i + 2 >= s.length || s[i + 2] === " ")
    ) {
      const prev = s[i - 2];
      if (prev && isValidCharBeforeOperator(prev)) {
        return { index: i - 1 };
      }
    }
  }
  return undefined;
}

function findBinaryOperator(
  s: string,
  ...ops: string[]
): { index: number; operator: string } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    const ch = s[i]!;
    if (ops.includes(ch)) {
      if (isPositionInsideBrackets(s, i)) continue;
      const prev = s[i - 1];
      if (
        prev &&
        ((prev >= "0" && prev <= "9") || prev === " " || prev === ")")
      ) {
        return { index: i, operator: ch };
      }
    }
  }
  return undefined;
}

export function findAddSubOperator(
  s: string,
): { index: number; operator: string } | undefined {
  return findBinaryOperator(s, "+", "-");
}

export function findMulDivOperator(
  s: string,
): { index: number; operator: string } | undefined {
  return findBinaryOperator(s, "*", "/");
}
