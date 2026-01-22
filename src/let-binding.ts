import { type Instruction, OpCode } from "./vm";
import {
  findChar,
  extractVariableName,
  getTypeSuffix,
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
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
}

export type VariableContext = VariableBinding[];

export function allocateVariable(
  context: VariableContext,
  varName: string,
  varType?: string,
): { context: VariableContext; address: number } {
  const address = 904 + context.length;
  return {
    context: [
      ...context,
      { name: varName, memoryAddress: address, type: varType },
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
    }
  | undefined {
  const varName = extractVariableName(source);
  if (varName.length === 0) return undefined;

  const colonIndex = findChar(source, ":");
  const equalsIndex = findChar(source, "=");
  if (equalsIndex === -1) return undefined;

  // If there's a colon, it must come before the equals sign
  if (colonIndex !== -1 && colonIndex >= equalsIndex) return undefined;

  const semicolonIndex = findChar(source, ";", equalsIndex + 1);
  if (semicolonIndex === -1) return undefined;

  const exprPart = source.substring(equalsIndex + 1, semicolonIndex).trim();
  const remaining = source.substring(semicolonIndex + 1).trim();

  // Extract type annotation if present
  let typeAnnotation: string | undefined;
  if (colonIndex !== -1) {
    const typePartEnd = equalsIndex;
    const typePart = source.substring(colonIndex + 1, typePartEnd).trim();
    typeAnnotation = typePart;
  }

  return { varName, exprPart, remaining, typeAnnotation };
}

export function isReadExpressionPattern(exprPart: string): boolean {
  return (
    exprPart === "read U8" ||
    exprPart === "read U16" ||
    exprPart === "read I8" ||
    exprPart === "read I16"
  );
}

export function extractExpressionType(
  exprPart: string,
  context?: VariableContext,
): string | undefined {
  const trimmed = exprPart.trim();

  // For read expressions, extract the type directly
  if (trimmed.startsWith("read ")) {
    const parts = trimmed.split(" ");
    if (parts.length === 2) {
      return parts[1];
    }
  }

  // For number literals, extract type suffix
  const suffix = getTypeSuffix(trimmed);
  if (suffix) {
    return suffix;
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
