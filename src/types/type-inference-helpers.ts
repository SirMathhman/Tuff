import {
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
} from "../parsing/parser";

function validateNumericPrefix(expr: string, allowTypeChars: boolean): boolean {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return false;

  let i = 0;
  if (trimmed[i] === "-") i++;

  if (i >= trimmed.length) return false;

  for (; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === undefined) return false;

    const isDigit = char >= "0" && char <= "9";
    const isTypeChar = char >= "A" && char <= "Z";

    const isValidChar = allowTypeChars ? isDigit || isTypeChar : isDigit;
    if (!isValidChar) return false;
  }

  return true;
}

export function isBareNumber(expr: string): boolean {
  return validateNumericPrefix(expr, false);
}

export function isNumberLiteral(expr: string): boolean {
  return validateNumericPrefix(expr, true);
}

export function extractArithmeticTypes(
  exprPart: string,
  extractExpressionType: (expr: string) => string | undefined,
): string[] | undefined {
  const trimmed = exprPart.trim();

  const opIndex = findTopLevelOperator(trimmed);

  if (opIndex === -1) return undefined;

  const leftPart = trimmed.substring(0, opIndex).trim();
  const rightPart = trimmed.substring(opIndex + 1).trim();

  const leftType = extractExpressionType(leftPart);
  const rightType = extractExpressionType(rightPart);

  if (!leftType || !rightType) return undefined;

  return [leftType, rightType];
}

function findTopLevelOperator(trimmed: string): number {
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = 1; i < trimmed.length; i++) {
    const char = trimmed[i];

    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    const isOperator =
      char === "+" || char === "-" || char === "*" || char === "/";
    const isTopLevel = parenDepth === 0 && braceDepth === 0;

    if (isOperator && isTopLevel) {
      return i;
    }
  }

  return -1;
}

export function hasArithmeticMismatch(
  exprPart: string,
  extractExpressionType: (expr: string) => string | undefined,
): boolean {
  let unwrapped = exprPart;

  if (isParenthesizedExpression(exprPart)) {
    unwrapped = extractParenthesizedContent(exprPart);
  } else if (isBracedExpression(exprPart)) {
    unwrapped = extractBracedContent(exprPart);
  }

  const types = extractArithmeticTypes(unwrapped, extractExpressionType);
  if (!types || types.length < 2) return false;

  const firstType = types[0];
  return types.some((t) => t !== firstType);
}
