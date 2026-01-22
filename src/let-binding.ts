import { type Instruction, OpCode } from "./vm";
import {
  findChar,
  extractVariableName,
  getTypeSuffix,
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
  parseBooleanLiteral,
  findConditionParentheses,
  findElseKeyword,
  isIdentifierChar,
} from "./parser";
import {
  buildLoadDirect,
  buildStoreDirect,
  buildStoreAndHalt,
} from "./instruction-primitives";

export interface VariableBinding {
  name: string;
  memoryAddress: number;
  type?: string;
  mutable?: boolean;
}

export type VariableContext = VariableBinding[];

export function allocateVariable(
  context: VariableContext,
  varName: string,
  varType?: string,
  mutable?: boolean,
): { context: VariableContext; address: number } {
  const address = 904 + context.length;
  return {
    context: [
      ...context,
      { name: varName, memoryAddress: address, type: varType, mutable },
    ],
    address,
  };
}

export function resolveVariable(
  context: VariableContext,
  varName: string,
): number | undefined {
  const binding = context.find((b) => b.name === varName);
  return binding?.memoryAddress;
}

export function isVariableShadowed(
  context: VariableContext,
  varName: string,
): boolean {
  return context.some((b) => b.name === varName);
}

export function parseLetComponents(source: string):
  | {
      varName: string;
      exprPart: string;
      remaining: string;
      typeAnnotation?: string;
      mutable: boolean;
    }
  | undefined {
  const isMutable = source.substring(3, 6).trim() === "mut";
  const varName = extractVariableName(source);
  if (varName.length === 0) return undefined;

  // Find the first semicolon to limit search scope
  const firstSemicolonIndex = findChar(source, ";");
  if (firstSemicolonIndex === -1) return undefined;

  // Only search within the current let binding (before the semicolon)
  const bindingScope = source.substring(0, firstSemicolonIndex);

  const colonIndex = findChar(bindingScope, ":");
  const equalsIndex = findChar(bindingScope, "=");
  if (equalsIndex === -1) return undefined;

  // If there's a colon, it must come before the equals sign
  if (colonIndex !== -1 && colonIndex >= equalsIndex) return undefined;

  const exprPart = bindingScope.substring(equalsIndex + 1).trim();
  const remaining = source.substring(firstSemicolonIndex + 1).trim();

  // Extract type annotation if present
  let typeAnnotation: string | undefined;
  if (colonIndex !== -1) {
    const typePartEnd = equalsIndex;
    const typePart = bindingScope.substring(colonIndex + 1, typePartEnd).trim();
    typeAnnotation = typePart;
  }

  return { varName, exprPart, remaining, typeAnnotation, mutable: isMutable };
}

export function isReadExpressionPattern(exprPart: string): boolean {
  return (
    exprPart === "read U8" ||
    exprPart === "read U16" ||
    exprPart === "read I8" ||
    exprPart === "read I16" ||
    exprPart === "read Bool"
  );
}

function extractIfExpressionType(
  source: string,
  context?: VariableContext,
): string | undefined {
  const branches = extractIfBranchTypes(source, context);
  if (!branches) {
    return undefined;
  }

  const { thenType, elseType } = branches;

  // If both branches have types and match, return that type
  if (thenType && elseType && thenType === elseType) {
    return thenType;
  }

  // If one is undefined, return the other if it exists
  if (thenType && !elseType) {
    return thenType;
  }
  if (elseType && !thenType) {
    return elseType;
  }

  return undefined;
}

export function extractIfBranchTypes(
  source: string,
  context?: VariableContext,
): { thenType: string | undefined; elseType: string | undefined } | undefined {
  if (!source.startsWith("if")) {
    return undefined;
  }

  const parens = findConditionParentheses(source, 2);
  if (!parens) {
    return undefined;
  }

  const elseIndex = findElseKeyword(source, parens.end + 1);
  if (elseIndex === -1) {
    return undefined;
  }

  const thenExpr = source.substring(parens.end + 1, elseIndex).trim();
  const elseExpr = source.substring(elseIndex + 4).trim();

  const thenType = extractExpressionType(thenExpr, context);
  const elseType = extractExpressionType(elseExpr, context);

  return { thenType, elseType };
}

export function extractExpressionType(
  exprPart: string,
  context?: VariableContext,
): string | undefined {
  const trimmed = exprPart.trim();

  // For if-expressions, extract the type from branches
  if (trimmed.startsWith("if")) {
    return extractIfExpressionType(trimmed, context);
  }

  // For braced expressions, unwrap and extract from inner content
  if (isBracedExpression(trimmed)) {
    const innerExpr = extractBracedContent(trimmed);
    return extractExpressionType(innerExpr, context);
  }

  // For read expressions, extract the type directly
  if (trimmed.startsWith("read ")) {
    const parts = trimmed.split(" ");
    if (parts.length === 2) {
      return parts[1];
    }
  }

  // For boolean literals, return Bool type
  const boolValue = parseBooleanLiteral(trimmed);
  if (boolValue !== undefined) {
    return "Bool";
  }

  // For number literals, extract type suffix
  const suffix = getTypeSuffix(trimmed);
  if (suffix) {
    return suffix;
  }

  // For bare numbers without type suffix, infer a default type
  const isBareLiteral = isBareNumber(trimmed);
  if (isBareLiteral) {
    // Bare numbers default to I32 for compatibility with signed/unsigned and various sizes
    return "I32";
  }

  // For variable references, look up in context
  if (context) {
    const binding = context.find((b) => b.name === trimmed);
    if (binding && binding.type) {
      return binding.type;
    }
  }

  // If no type suffix and not a read expression, return undefined
  return undefined;
}

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

export function extractArithmeticTypes(exprPart: string): string[] | undefined {
  const trimmed = exprPart.trim();

  // Check if contains operators: + - * / (scanning at depth 0 only)
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

    // Track depth of parentheses and braces
    if (char === "(") parenDepth++;
    if (char === ")") parenDepth--;
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth--;

    // Check for operators at depth 0 only
    const isOperator =
      char === "+" || char === "-" || char === "*" || char === "/";
    const isTopLevel = parenDepth === 0 && braceDepth === 0;

    if (isOperator && isTopLevel) {
      return i;
    }
  }

  return -1;
}

export function hasArithmeticMismatch(exprPart: string): boolean {
  let unwrapped = exprPart;

  // Unwrap parentheses if the entire expression is wrapped
  if (isParenthesizedExpression(exprPart)) {
    unwrapped = extractParenthesizedContent(exprPart);
  } else if (isBracedExpression(exprPart)) {
    unwrapped = extractBracedContent(exprPart);
  }

  const types = extractArithmeticTypes(unwrapped);
  if (!types || types.length < 2) return false;

  // All operands must have the same type
  const firstType = types[0];
  return types.some((t) => t !== firstType);
}

export function adjustReadInstructions(
  instructions: Instruction[],
  exprPart: string,
): Instruction[] {
  if (!isReadExpressionPattern(exprPart)) return instructions;

  // Remap Store(901) to Store(903) to avoid conflicts
  return instructions.map((inst) => {
    if (inst.opcode === OpCode.Store && inst.operand2 === 901) {
      return { ...inst, operand2: 903 };
    }
    return inst;
  });
}

export function buildLetFinalInstructions(address: number): Instruction[] {
  return [buildLoadDirect(1, address), ...buildStoreAndHalt()];
}

export function buildLetStoreInstructions(
  adjustedInstructions: Instruction[],
  resultAddress: number,
  address: number,
): Instruction[] {
  return [
    ...adjustedInstructions,
    buildLoadDirect(1, resultAddress),
    buildStoreDirect(1, address),
  ];
}

export function buildVarRefInstructions(varAddress: number): Instruction[] {
  return [buildLoadDirect(1, varAddress), ...buildStoreAndHalt()];
}

export function parseReassignmentComponents(source: string):
  | {
      varName: string;
      exprPart: string;
      remaining: string;
    }
  | undefined {
  const trimmed = source.trim();
  const firstSemicolonIndex = findChar(trimmed, ";");
  if (firstSemicolonIndex === -1) return undefined;

  const bindingScope = trimmed.substring(0, firstSemicolonIndex);
  const equalsIndex = findChar(bindingScope, "=");
  if (equalsIndex === -1) return undefined;

  const varName = bindingScope.substring(0, equalsIndex).trim();
  const exprPart = bindingScope.substring(equalsIndex + 1).trim();
  const remaining = trimmed.substring(firstSemicolonIndex + 1).trim();

  // Validate varName is a valid identifier
  if (varName.length === 0) return undefined;
  for (let i = 0; i < varName.length; i++) {
    const char = varName[i];
    if (!char || !isIdentifierChar(char, i === 0)) return undefined;
  }

  return { varName, exprPart, remaining };
}

export function buildReassignmentInstructions(
  exprInstructions: Instruction[],
  varAddress: number,
): Instruction[] {
  return [
    ...exprInstructions.slice(0, -1),
    buildLoadDirect(1, 900),
    buildStoreDirect(1, varAddress),
  ];
}
