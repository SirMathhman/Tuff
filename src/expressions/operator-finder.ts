import {
  isValidCharBeforeDot,
  isValidCharAfterDot,
  isValidCharBeforeOperator,
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
        // Found matching [, check if it's array indexing (preceded by identifier/)]
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

export function findComparisonOperator(
  s: string,
): { index: number; operator: string } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    const twoChar = s.slice(i - 1, i + 1);
    if (
      twoChar === "<=" ||
      twoChar === ">=" ||
      twoChar === "==" ||
      twoChar === "!="
    ) {
      const prev = s[i - 2];
      if (
        !prev ||
        (prev >= "0" && prev <= "9") ||
        prev === " " ||
        prev === ")" ||
        prev === "}"
      ) {
        return { index: i - 1, operator: twoChar };
      }
    }

    const ch = s[i];
    if (ch === "<" || ch === ">") {
      const nextCh = s[i + 1];
      if (nextCh !== "=" && nextCh !== ">") {
        const prev = s[i - 1];
        if (
          prev &&
          ((prev >= "0" && prev <= "9") ||
            prev === " " ||
            prev === ")" ||
            prev === "}")
        ) {
          return { index: i, operator: ch };
        }
      }
    }
  }
  return undefined;
}

export function findAddSubOperator(
  s: string,
): { index: number; operator: string } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    const ch = s[i];
    if (ch === "+" || ch === "-") {
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

export function findMulDivOperator(
  s: string,
): { index: number; operator: string } | undefined {
  for (let i = s.length - 1; i >= 1; i--) {
    const ch = s[i];
    if (ch === "*" || ch === "/") {
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
