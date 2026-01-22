import { type CompileError, getTypeBits, isSignedType } from "./types";
import {
  parseLetComponents,
  extractExpressionType,
  type VariableContext,
  isBareNumber,
  isNumberLiteral,
} from "./let-binding";
import {
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
} from "./parser";

function isTypeCompatible(declaredType: string, exprType: string): boolean {
  if (declaredType === exprType) return true;

  // Bool type only matches Bool
  if (declaredType === "Bool" || exprType === "Bool") return false;

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

function unwrapExpression(expr: string): string {
  const trimmed = expr.trim();
  if (isParenthesizedExpression(trimmed)) {
    return extractParenthesizedContent(trimmed);
  }
  if (isBracedExpression(trimmed)) {
    return extractBracedContent(trimmed);
  }
  return trimmed;
}

function findTopLevelOperatorIndex(expr: string): number {
  let parenDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    // Skip checking operators inside parentheses/braces or on first character
    if (i === 0 || parenDepth !== 0 || braceDepth !== 0) continue;

    if (char === "+" || char === "-" || char === "*" || char === "/") {
      return i;
    }
  }

  return -1;
}

type OperandChecker = (
  left: string,
  right: string,
  context?: VariableContext,
) => boolean;

function checkOperandsRecursive(
  exprPart: string,
  checker: OperandChecker,
  context?: VariableContext,
): boolean {
  const toCheck = unwrapExpression(exprPart);
  const firstOpIndex = findTopLevelOperatorIndex(toCheck);

  if (firstOpIndex === -1) return false;

  const leftPart = toCheck.substring(0, firstOpIndex).trim();
  const rightPart = toCheck.substring(firstOpIndex + 1).trim();

  return (
    checker(leftPart, rightPart, context) ||
    checkOperandsRecursive(leftPart, checker, context) ||
    checkOperandsRecursive(rightPart, checker, context)
  );
}

function checkArithmeticMismatchRecursive(exprPart: string): boolean {
  const checker: OperandChecker = (left, right) => {
    const leftType = extractExpressionType(left);
    const rightType = extractExpressionType(right);
    return !!(leftType && rightType && leftType !== rightType);
  };

  return checkOperandsRecursive(exprPart, checker);
}

function checkBooleanArithmetic(
  exprPart: string,
  context?: VariableContext,
): boolean {
  const checker: OperandChecker = (left, right, ctx) => {
    const leftType = extractExpressionType(left, ctx);
    const rightType = extractExpressionType(right, ctx);
    return leftType === "Bool" || rightType === "Bool";
  };

  return checkOperandsRecursive(exprPart, checker, context);
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

function isSimpleConstantExpression(expr: string): boolean {
  const trimmed = expr.trim();
  // A simple constant can be:
  // 1. A bare number like "1" or "-5"
  // 2. A typed number like "1U8" or "5I16"

  if (isBareNumber(trimmed)) {
    return true;
  }

  // Check for typed number (e.g., "1U8", "-5I16")
  return isNumberLiteral(trimmed);
}

function processLetBindingValidation(
  exprPart: string,
  typeAnnotation: string | undefined,
  variableTypes: VariableContext,
): CompileError | undefined {
  const exprType = extractExpressionType(exprPart, variableTypes);

  if (!typeAnnotation) {
    // No annotation, infer from expression
    if (!exprType && !isSimpleConstantExpression(exprPart)) {
      // No inferred type and no annotation - untyped expression
      return {
        cause: `Expression has no inferred type and no type annotation provided`,
        reason: `Bare numbers and untyped expressions require explicit type annotations`,
        fix: `Add a type annotation like ': U8' or use a typed literal like '1U8'`,
        first: { line: 0, column: 0, length: exprPart.length },
      };
    }
    return undefined;
  }

  // Has annotation, check compatibility
  if (exprType) {
    // Both have types, check compatibility
    if (!isTypeCompatible(typeAnnotation, exprType)) {
      return buildTypeError(typeAnnotation, exprType, exprPart);
    }
  } else if (!isSimpleConstantExpression(exprPart)) {
    // No type and not a simple constant - variable or complex expr
    return {
      cause: `Expression type cannot be determined`,
      reason: `Cannot assign untyped expression to ${typeAnnotation}`,
      fix: `Use a typed expression or variable`,
      first: { line: 0, column: 0, length: exprPart.length },
    };
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

  // Check for boolean values in arithmetic expressions
  if (checkBooleanArithmetic(exprPart, variableTypes)) {
    return {
      error: {
        cause: "Boolean values cannot be used in arithmetic expressions",
        reason:
          "Arithmetic operators (+, -, *, /) are not supported for Bool type",
        fix: "Remove the arithmetic operation or use numeric types instead",
        first: { line: 0, column: 0, length: exprPart.length },
      },
    };
  }

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

  // Validate type annotation if present
  const validationError = processLetBindingValidation(
    exprPart,
    typeAnnotation,
    variableTypes,
  );
  if (validationError) {
    return { error: validationError };
  }

  // Extract type and add to context
  const exprType = extractExpressionType(exprPart, variableTypes);
  const finalType = typeAnnotation || exprType;

  if (finalType) {
    variableTypes.push({ name: varName, memoryAddress: 0, type: finalType });
  }

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

  // Check any remaining expression (after all let bindings)
  if (
    remaining.length > 0 &&
    checkBooleanArithmetic(remaining, variableTypes)
  ) {
    return {
      cause: "Boolean values cannot be used in arithmetic expressions",
      reason:
        "Arithmetic operators (+, -, *, /) are not supported for Bool type",
      fix: "Remove the arithmetic operation or use numeric types instead",
      first: { line: 0, column: 0, length: remaining.length },
    };
  }

  return undefined;
}

function extractComparisonTypes(
  source: string,
): { left: string; right: string } | undefined {
  // Find comparison operator
  let comparisonIndex = -1;
  let operator = "";

  for (let i = 0; i < source.length; i++) {
    if (source[i] === "=" && source[i + 1] === "=") {
      comparisonIndex = i;
      operator = "==";
      break;
    }
    if (source[i] === "<" || source[i] === ">") {
      comparisonIndex = i;
      operator = source[i];
      break;
    }
  }

  if (comparisonIndex === -1) return undefined;

  const leftPart = source.substring(0, comparisonIndex).trim();
  const rightPart = source.substring(comparisonIndex + operator.length).trim();

  const leftType = extractExpressionType(leftPart);
  const rightType = extractExpressionType(rightPart);

  if (!leftType || !rightType) return undefined;

  return { left: leftType, right: rightType };
}

export function detectComparisonTypeMismatch(
  source: string,
): CompileError | undefined {
  const types = extractComparisonTypes(source);
  if (!types) return undefined;

  if (types.left !== types.right) {
    return {
      cause: `Type mismatch in comparison: ${types.left} compared to ${types.right}`,
      reason: "Comparisons require both operands to have the same type",
      fix: "Ensure both sides of the comparison have matching types",
      first: { line: 0, column: 0, length: source.length },
    };
  }

  return undefined;
}
