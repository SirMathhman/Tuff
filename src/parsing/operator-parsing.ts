import { findOperatorIndex } from "../parsing/parser";

export function splitByAddOperator(
  source: string,
): { leftPart: string; rightPart: string } | undefined {
  const plusIndex = findOperatorIndex(source, "+");
  if (plusIndex === -1) return undefined;

  const leftPart = source.substring(0, plusIndex).trim();
  const rightPart = source.substring(plusIndex + 1).trim();

  return { leftPart, rightPart };
}

function isTwoCharOperator(twoChar: string): boolean {
  return twoChar === "==" || twoChar === "<=" || twoChar === ">=";
}

function isSingleCharOperator(char: string): boolean {
  return char === "<" || char === ">";
}

function checkTwoCharOperator(source: string, index: number): number {
  if (index >= source.length - 1) return -1;
  const twoChar = source.substring(index, index + 2);
  return isTwoCharOperator(twoChar) ? index : -1;
}

export function findComparisonOperatorIndex(source: string): number {
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    // Skip checking operators inside parentheses/braces
    if (parenDepth !== 0 || braceDepth !== 0) continue;

    // Check for two-character operators first
    const twoCharResult = checkTwoCharOperator(source, i);
    if (twoCharResult !== -1) return twoCharResult;

    // Check for single-character operators
    if (isSingleCharOperator(char)) {
      return i;
    }
  }

  return -1;
}

export function splitByComparisonOperator(
  source: string,
): { leftPart: string; operator: string; rightPart: string } | undefined {
  const opIndex = findComparisonOperatorIndex(source);
  if (opIndex === -1) return undefined;

  // Determine which operator we found
  let operator = "";
  let operatorLength = 1;

  if (opIndex < source.length - 1) {
    const twoChar = source.substring(opIndex, opIndex + 2);
    if (isTwoCharOperator(twoChar)) {
      operator = twoChar;
      operatorLength = 2;
    }
  }

  if (!operator) {
    operator = source[opIndex] ?? "";
  }

  const leftPart = source.substring(0, opIndex).trim();
  const rightPart = source.substring(opIndex + operatorLength).trim();

  return { leftPart, operator, rightPart };
}
