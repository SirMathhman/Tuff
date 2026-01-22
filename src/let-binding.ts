import { type Instruction, OpCode } from "./vm";
import { findChar, extractVariableName } from "./parser";
import {
  buildLoadDirect,
  buildStoreDirect,
  buildStoreAndHalt,
} from "./instruction-primitives";

export interface VariableBinding {
  name: string;
  memoryAddress: number;
}

export type VariableContext = VariableBinding[];

export function allocateVariable(
  context: VariableContext,
  varName: string,
): { context: VariableContext; address: number } {
  const address = 904 + context.length;
  return {
    context: [...context, { name: varName, memoryAddress: address }],
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

export function parseLetComponents(
  source: string,
): { varName: string; exprPart: string; remaining: string } | undefined {
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

  return { varName, exprPart, remaining };
}

export function isReadExpressionPattern(exprPart: string): boolean {
  return (
    exprPart === "read U8" ||
    exprPart === "read U16" ||
    exprPart === "read I8" ||
    exprPart === "read I16"
  );
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
