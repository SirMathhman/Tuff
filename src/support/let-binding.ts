import { type Instruction, OpCode, Variant } from "../core/vm";
import {
  findChar,
  extractVariableName,
  getTypeSuffix,
  isBracedExpression,
  extractBracedContent,
  parseBooleanLiteral,
  findConditionParentheses,
  findElseKeyword,
  isReferenceOperator,
  extractReferenceTarget,
  isMutableReference,
  isArrayIndexing,
} from "../parsing/parser";
import { isArrayLiteral } from "../parsing/array-parsing";
import {
  parseArraySize,
  extractArrayLiteralType,
  extractArrayIndexType,
} from "../types/array-helpers";
import { isBareNumber } from "../types/type-inference-helpers";
import { type VariableContext } from "../types/variable-types";
export type { VariableBinding, VariableContext } from "../types/variable-types";
import {
  buildLoadDirect,
  buildLoadImmediate,
  buildStoreDirect,
  buildStoreAndHalt,
} from "../compilation/instruction-primitives";

function getVariableMemorySize(type: string | undefined): number {
  if (!type) return 1;
  if (type.startsWith("[")) {
    const size = parseArraySize(type);
    if (size !== undefined) return size;
  }
  return 1;
}

export function allocateVariable(
  context: VariableContext,
  varName: string,
  varType?: string,
  mutable?: boolean,
  declarationOnly?: boolean,
  sourceArrayName?: string,
): { context: VariableContext; address: number } {
  // Calculate start address based on all previous variables' memory usage
  let address = 904;
  for (const binding of context) {
    const size = getVariableMemorySize(binding.type);
    address += size;
  }

  return {
    context: [
      ...context,
      {
        name: varName,
        memoryAddress: address,
        type: varType,
        mutable,
        declarationOnly,
        sourceArrayName,
      },
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

export function isVariableMutable(
  context: VariableContext,
  varName: string,
): boolean {
  const binding = context.find((b) => b.name === varName);
  return binding?.mutable ?? false;
}

export function buildContextFromLetBindings(source: string): VariableContext {
  const context: VariableContext = [];
  let remaining = source;
  let addressOffset = 0;

  while (remaining.length > 0) {
    remaining = remaining.trim();
    if (!remaining.startsWith("let")) break;

    const comp = parseLetComponents(remaining);
    if (!comp) break;

    let varType = comp.typeAnnotation;
    if (!varType) {
      varType = extractExpressionType(comp.exprPart, context);
    }

    // Declaration-only variables (exprPart === "")
    // Their mutability is determined by whether they have the 'mut' keyword
    // NOT implicitly made mutable just because they're declaration-only
    const isDeclarationOnly = comp.exprPart === "";

    const binding = {
      name: comp.varName,
      memoryAddress: 904 + addressOffset,
      type: varType,
      mutable: comp.mutable,
      declarationOnly: isDeclarationOnly,
    };

    context.push(binding);

    // Account for array size in next variable allocation
    const varSize = getVariableMemorySize(varType);
    addressOffset += varSize;

    remaining = comp.remaining;
  }

  return context;
}

function findSemicolonOutsideBrackets(source: string): number {
  let bracketDepth = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "[") bracketDepth++;
    if (char === "]") bracketDepth--;
    if (char === ";" && bracketDepth === 0) return i;
  }
  return -1;
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
  const afterLet = source.substring(3).trim();
  const isMutable = afterLet.startsWith("mut");
  const varName = extractVariableName(source);
  if (varName.length === 0) return undefined;

  // Find the first semicolon outside brackets to limit search scope
  const firstSemicolonIndex = findSemicolonOutsideBrackets(source);
  if (firstSemicolonIndex === -1) return undefined;

  // Only search within the current let binding (before the semicolon)
  const bindingScope = source.substring(0, firstSemicolonIndex);

  const colonIndex = findChar(bindingScope, ":");
  const equalsIndex = findChar(bindingScope, "=");

  // Extract type annotation if present
  let typeAnnotation: string | undefined;
  if (colonIndex !== -1) {
    const typePartEnd = equalsIndex === -1 ? bindingScope.length : equalsIndex;
    const typePart = bindingScope.substring(colonIndex + 1, typePartEnd).trim();
    typeAnnotation = typePart;
  }

  // If there's no equals sign, it's a declaration-only let binding (requires type annotation)
  if (equalsIndex === -1) {
    if (!typeAnnotation) return undefined;
    return {
      varName,
      exprPart: "",
      remaining: source.substring(firstSemicolonIndex + 1).trim(),
      typeAnnotation,
      mutable: isMutable,
    };
  }

  // If there's a colon, it must come before the equals sign
  if (colonIndex !== -1 && colonIndex >= equalsIndex) return undefined;

  const exprPart = bindingScope.substring(equalsIndex + 1).trim();
  const remaining = source.substring(firstSemicolonIndex + 1).trim();

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

function extractReferenceType(
  trimmed: string,
  context?: VariableContext,
): string | undefined {
  const varName = extractReferenceTarget(trimmed);
  if (!context) return undefined;

  const binding = context.find((b) => b.name === varName);
  if (!binding || !binding.type) return undefined;

  const isMut = isMutableReference(trimmed);
  const baseType = binding.type;

  // If referencing an array, convert to slice type
  if (baseType.startsWith("[") && baseType.includes(";")) {
    // Extract element type from [ElementType; init; total]
    const elementType = extractArrayElementTypeFromBinding(baseType);
    if (elementType) {
      const sliceType = `*[${elementType}]`;
      return isMut ? `*mut [${elementType}]` : sliceType;
    }
  }

  return isMut ? `*mut ${baseType}` : `*${baseType}`;
}

function extractArrayElementTypeFromBinding(
  arrayType: string,
): string | undefined {
  // Format: [ElementType; init; total]
  if (!arrayType.startsWith("[") || !arrayType.endsWith("]")) return undefined;
  const inner = arrayType.substring(1, arrayType.length - 1);
  const parts = inner.split(";");
  if (parts.length !== 3) return undefined;
  return parts[0]?.trim();
}

export function extractExpressionType(
  exprPart: string,
  context?: VariableContext,
): string | undefined {
  const trimmed = exprPart.trim();

  if (trimmed.startsWith("if")) {
    return extractIfExpressionType(trimmed, context);
  }

  if (isBracedExpression(trimmed)) {
    const innerExpr = extractBracedContent(trimmed);
    return extractExpressionType(innerExpr, context);
  }

  if (isArrayLiteral(trimmed)) {
    return extractArrayLiteralType(trimmed, context, extractExpressionType);
  }

  if (isArrayIndexing(trimmed)) {
    return extractArrayIndexType(trimmed, context);
  }

  if (isReferenceOperator(trimmed)) {
    return extractReferenceType(trimmed, context);
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

export function buildReferenceAddressInstructions(
  varAddress: number,
): Instruction[] {
  // For a reference (&x), we want the ADDRESS to be stored, not the value
  // We load the address as an immediate value
  return [buildLoadImmediate(1, varAddress), ...buildStoreAndHalt()];
}

export function buildVarRefInstructionsForBinding(
  varAddress: number,
): Instruction[] {
  return [
    buildLoadDirect(1, varAddress),
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Immediate,
      operand1: 900,
    },
  ];
}
