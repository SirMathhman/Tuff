import { type Instruction, OpCode, Variant } from "./vm";
import { findChar, isIdentifierChar } from "./parser";
import {
  buildLoadDirect,
  buildStoreDirect,
  buildStoreAndHalt,
} from "./instruction-primitives";

function findCompoundOperator(
  source: string,
  equalsIndex: number,
): { operator: string; opIndex: number } | undefined {
  if (equalsIndex === -1) return undefined;

  // Check if there's an operator before the '='
  if (equalsIndex === 0) return undefined;

  const charBefore = source[equalsIndex - 1];
  if (
    charBefore === "+" ||
    charBefore === "-" ||
    charBefore === "*" ||
    charBefore === "/"
  ) {
    return { operator: charBefore, opIndex: equalsIndex - 1 };
  }

  return undefined;
}

function extractReassignmentBase(source: string):
  | {
      bindingScope: string;
      remaining: string;
      equalsIndex: number;
      isCompound: boolean;
      compoundOp?: string;
    }
  | undefined {
  const trimmed = source.trim();
  const firstSemicolonIndex = findChar(trimmed, ";");
  if (firstSemicolonIndex === -1) return undefined;

  const bindingScope = trimmed.substring(0, firstSemicolonIndex);
  const equalsIndex = findChar(bindingScope, "=");
  if (equalsIndex === -1) return undefined;

  // Check for compound operator (+=, -=, *=, /=)
  const compound = findCompoundOperator(bindingScope, equalsIndex);
  const isCompound = compound !== undefined;

  const remaining = trimmed.substring(firstSemicolonIndex + 1).trim();
  return {
    bindingScope,
    remaining,
    equalsIndex,
    isCompound,
    compoundOp: compound?.operator,
  };
}

function isValidIdentifier(name: string): boolean {
  if (name.length === 0) return false;
  for (let i = 0; i < name.length; i++) {
    const char = name[i];
    if (!char || !isIdentifierChar(char, i === 0)) return false;
  }
  return true;
}

function extractLeftAndExprParts(
  base: ReturnType<typeof extractReassignmentBase>,
): { leftSide: string; exprPart: string; remaining: string } | undefined {
  if (!base) return undefined;
  const { bindingScope, remaining, equalsIndex, isCompound, compoundOp } = base;

  // For compound operators, the left side ends at the operator, not the equals
  const leftEndIndex = isCompound ? equalsIndex - 1 : equalsIndex;
  const leftSide = bindingScope.substring(0, leftEndIndex).trim();
  const rightStartIndex = equalsIndex + 1;
  const exprPart = bindingScope.substring(rightStartIndex).trim();

  // If compound, wrap the expression as: leftSide op exprPart
  if (isCompound && compoundOp) {
    const wrappedExpr = `${leftSide} ${compoundOp} ${exprPart}`;
    return { leftSide, exprPart: wrappedExpr, remaining };
  }

  return { leftSide, exprPart, remaining };
}

export function parseReassignmentComponents(source: string):
  | {
      varName: string;
      exprPart: string;
      remaining: string;
    }
  | undefined {
  const base = extractReassignmentBase(source);
  const parts = extractLeftAndExprParts(base);
  if (!parts) return undefined;

  if (!isValidIdentifier(parts.leftSide)) return undefined;

  return {
    varName: parts.leftSide,
    exprPart: parts.exprPart,
    remaining: parts.remaining,
  };
}

export function parseDereferenceReassignmentComponents(source: string):
  | {
      pointerName: string;
      exprPart: string;
      remaining: string;
    }
  | undefined {
  const base = extractReassignmentBase(source);
  const parts = extractLeftAndExprParts(base);
  if (!parts) return undefined;

  if (!parts.leftSide.startsWith("*")) return undefined;

  const pointerName = parts.leftSide.substring(1).trim();

  if (!isValidIdentifier(pointerName)) return undefined;

  return { pointerName, exprPart: parts.exprPart, remaining: parts.remaining };
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

export function buildDereferenceReassignmentInstructions(
  exprInstructions: Instruction[],
  pointerAddress: number,
): Instruction[] {
  return [
    ...exprInstructions.slice(0, -1),
    buildLoadDirect(1, 900),
    buildLoadDirect(0, pointerAddress),
    buildStoreDirect(0, 902),
    {
      opcode: OpCode.Store,
      variant: Variant.Indirect,
      operand1: 1,
      operand2: 902,
    },
  ];
}

export function buildDereferenceInstructions(
  varAddress: number,
): Instruction[] {
  return [
    buildLoadDirect(0, varAddress),
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 0,
      operand2: 0,
    },
    ...buildStoreAndHalt(),
  ];
}

export function buildDereferenceInstructionsForExpr(
  varAddress: number,
): Instruction[] {
  return [
    buildLoadDirect(0, varAddress),
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 0,
      operand2: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 900,
    },
  ];
}

function extractArrayIndexFromLeftSide(
  leftSide: string,
): { arrayName: string; indexExpr: string } | undefined {
  // leftSide should be "arrayName[indexExpr]"
  let i = 0;
  let arrayName = "";

  // Extract array name
  while (i < leftSide.length) {
    const char = leftSide[i];
    if (!char || !isIdentifierChar(char, i === 0)) break;
    arrayName += char;
    i++;
  }

  if (i >= leftSide.length || leftSide[i] !== "[") return undefined;

  // Find matching bracket
  const bracketStart = i;
  let bracketEnd = -1;
  let depth = 1;

  for (let j = i + 1; j < leftSide.length; j++) {
    if (leftSide[j] === "[") depth++;
    if (leftSide[j] === "]") depth--;
    if (depth === 0) {
      bracketEnd = j;
      break;
    }
  }

  if (bracketEnd === -1 || bracketEnd !== leftSide.length - 1) return undefined;

  const indexExpr = leftSide.substring(bracketStart + 1, bracketEnd).trim();

  return { arrayName, indexExpr };
}

export function parseArrayIndexReassignmentComponents(source: string):
  | {
      arrayName: string;
      indexExpr: string;
      exprPart: string;
      remaining: string;
    }
  | undefined {
  const base = extractReassignmentBase(source);
  const parts = extractLeftAndExprParts(base);
  if (!parts) return undefined;

  const arrayIndex = extractArrayIndexFromLeftSide(parts.leftSide);
  if (!arrayIndex) return undefined;

  return {
    arrayName: arrayIndex.arrayName,
    indexExpr: arrayIndex.indexExpr,
    exprPart: parts.exprPart,
    remaining: parts.remaining,
  };
}
