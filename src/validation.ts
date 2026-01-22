import { type CompileError, getTypeBits, isSignedType } from "./types";
import {
  parseLetComponents,
  extractExpressionType,
  type VariableContext,
} from "./let-binding";
import {
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
} from "./parser";

function isTypeCompatible(declaredType: string, exprType: string): boolean {
  if (declaredType === exprType) return true;

  const declaredBits = getTypeBits(declaredType);
  const exprBits = getTypeBits(exprType);

  if (declaredBits === undefined || exprBits === undefined) return false;

  const declaredSigned = isSignedType(declaredType);
  const exprSigned = isSignedType(exprType);

  // Allow widening: expr type can fit in declared type
  // For unsigned: U8 (8 bits) -> U16 (16 bits), U8 -> I16 (16 bits, signed)
  // For signed: I8 (8 bits) -> I16 (16 bits)
  // For mixed: U8 (8 bits) -> I16 (16 bits - room for sign and value)

  // If expr is unsigned and declared is unsigned, allow if expr bits <= declared bits
  if (!exprSigned && !declaredSigned) {
    return exprBits <= declaredBits;
  }

  // If expr is signed and declared is signed, allow if expr bits <= declared bits
  if (exprSigned && declaredSigned) {
    return exprBits <= declaredBits;
  }

  // If expr is unsigned and declared is signed, allow if expr fits in signed range
  // U8 (0-255) fits in I16 (-32768 to 32767) but not I8 (-128 to 127)
  if (!exprSigned && declaredSigned) {
    return exprBits < declaredBits;
  }

  // If expr is signed and declared is unsigned, disallow (can't fit negative)
  return false;
}

function buildTypeError(
  typeAnnotation: string,
  exprType: string,
  exprPart: string,
): CompileError {
  return {
    cause: `Type mismatch: expected ${typeAnnotation} but got ${exprType}`,
    reason: `The expression type ${exprType} does not match the declared type ${typeAnnotation}`,
    fix: "Change the type annotation or the expression to match",
    first: { line: 0, column: 0, length: exprPart.length },
  };
}

function checkArithmeticMismatchRecursive(exprPart: string): boolean {
  const trimmed = exprPart.trim();

  // First, unwrap any outer grouping
  let toCheck = trimmed;
  if (isParenthesizedExpression(trimmed)) {
    toCheck = extractParenthesizedContent(trimmed);
  } else if (isBracedExpression(trimmed)) {
    toCheck = extractBracedContent(trimmed);
  }

  // Check for arithmetic operators at depth 0
  let parenDepth = 0;
  let braceDepth = 0;
  let firstOpIndex = -1;

  for (let i = 0; i < toCheck.length; i++) {
    const char = toCheck[i];

    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    // Skip checking operators inside parentheses or on first character
    if (i === 0 || parenDepth !== 0 || braceDepth !== 0) continue;

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      firstOpIndex = i;
      break;
    }
  }

  // If there's an operator at this level, check if operands have consistent types
  if (firstOpIndex !== -1) {
    const leftPart = toCheck.substring(0, firstOpIndex).trim();
    const rightPart = toCheck.substring(firstOpIndex + 1).trim();

    const leftType = extractExpressionType(leftPart);
    const rightType = extractExpressionType(rightPart);

    // If both parts have types and they differ, we have a mismatch
    if (leftType && rightType && leftType !== rightType) {
      return true;
    }

    // Recursively check left and right parts for nested mismatches
    if (checkArithmeticMismatchRecursive(leftPart)) {
      return true;
    }
    if (checkArithmeticMismatchRecursive(rightPart)) {
      return true;
    }

    return false;
  }

  // No operators at this level, nothing to check
  return false;
}

export function detectVariableShadowing(
  source: string,
): CompileError | undefined {
  const variables = new Set<string>();
  let remaining = source;

  while (remaining.startsWith("let")) {
    const components = parseLetComponents(remaining);
    if (!components) break;

    const { varName, remaining: nextRemaining } = components;

    if (variables.has(varName)) {
      return {
        cause: `Variable '${varName}' is shadowed`,
        reason: "A variable with this name was already declared in this scope",
        fix: "Use a different variable name",
        first: { line: 0, column: 0, length: varName.length },
      };
    }

    variables.add(varName);
    remaining = nextRemaining;
  }

  return undefined;
}

function findFirstSemicolon(str: string): number {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ";") {
      return i;
    }
  }
  return -1;
}

function processLetBinding(
  thisLet: string,
  variableTypes: VariableContext,
): { error?: CompileError; added?: boolean } {
  const components = parseLetComponents(thisLet);
  if (!components) return {};

  const { varName, typeAnnotation, exprPart } = components;

  // Check for mixed-type arithmetic expressions (recursively at all levels)
  if (checkArithmeticMismatchRecursive(exprPart)) {
    return {
      error: {
        cause: "Mixed-type arithmetic expression",
        reason:
          "All operands in an arithmetic expression must have the same type",
        fix: "Use the same type for all operands",
        first: { line: 0, column: 0, length: exprPart.length },
      },
    };
  }

  const exprType = extractExpressionType(exprPart, variableTypes);

  if (!typeAnnotation) {
    // No annotation, infer from expression
    if (exprType) {
      variableTypes.push({ name: varName, memoryAddress: 0, type: exprType });
    }
    return { added: true };
  }

  // Has annotation, check compatibility
  if (exprType && !isTypeCompatible(typeAnnotation, exprType)) {
    return { error: buildTypeError(typeAnnotation, exprType, exprPart) };
  }

  // Store the annotated type for this variable
  variableTypes.push({ name: varName, memoryAddress: 0, type: typeAnnotation });
  return { added: true };
}

export function detectTypeIncompatibility(
  source: string,
): CompileError | undefined {
  let remaining = source;
  const variableTypes: VariableContext = [];

  while (remaining.startsWith("let")) {
    const semicolonIndex = findFirstSemicolon(remaining);
    if (semicolonIndex === -1) break;

    const thisLet = remaining.substring(0, semicolonIndex + 1);
    const result = processLetBinding(thisLet, variableTypes);

    if (result.error) {
      return result.error;
    }

    remaining = remaining.substring(semicolonIndex + 1).trim();
  }

  return undefined;
}
