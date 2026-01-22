import { type Instruction, OpCode, Variant } from "./vm";
import {
  parseNumberWithSuffix,
  isDereferenceOperator,
  extractDereferenceTarget,
  isArrayIndexing,
  extractArrayIndexComponents,
} from "./parser";
import { buildStoreHaltInstructions } from "./types";
import { type VariableContext } from "./variable-types";
import { resolveVariable } from "./let-binding";
import { splitByAddOperator } from "./operator-parsing";

function resolveArrayIndexing(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  const comp = extractArrayIndexComponents(part);
  if (!comp) return undefined;

  const arrayAddr = resolveVariable(context, comp.arrayName);
  if (arrayAddr === undefined) return undefined;

  const indexNum = parseNumberWithSuffix(comp.indexExpr);
  if (indexNum === undefined) return undefined;

  const indexRegister = targetRegister === 1 ? 2 : 3;

  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: targetRegister,
      operand2: arrayAddr,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: indexRegister,
      operand2: indexNum,
    },
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: targetRegister,
      operand2: indexRegister,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: targetRegister === 1 ? 903 : 902,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: targetRegister,
      operand2: targetRegister === 1 ? 903 : 902,
    },
  ];
}

function resolveDereference(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  const varName = extractDereferenceTarget(part);
  const varAddress = resolveVariable(context, varName);
  if (varAddress === undefined) return undefined;

  const tempAddress = targetRegister === 1 ? 900 : 902;

  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 0,
      operand2: varAddress,
    },
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
      operand2: tempAddress,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: tempAddress,
    },
  ];
}

export function tryResolveVariableAtom(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  if (isArrayIndexing(part)) {
    return resolveArrayIndexing(part, context, targetRegister);
  }

  if (isDereferenceOperator(part)) {
    return resolveDereference(part, context, targetRegister);
  }

  const varAddress = resolveVariable(context, part);
  if (varAddress === undefined) return undefined;

  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: varAddress,
    },
  ];
}

export function parseAddExpressionWithContext(
  source: string,
  context: VariableContext,
): Instruction[] | undefined {
  const parts = splitByAddOperator(source);
  if (!parts) return undefined;

  const { leftPart, rightPart } = parts;

  // Try to resolve left as a variable
  const leftVarInstructions = tryResolveVariableAtom(leftPart, context, 1);
  if (leftVarInstructions) {
    // Left is a variable, try to resolve right as variable or number
    const rightVarInstructions = tryResolveVariableAtom(rightPart, context, 0);
    if (rightVarInstructions) {
      return [
        ...leftVarInstructions,
        ...rightVarInstructions,
        ...buildStoreHaltInstructions(OpCode.Add),
      ];
    }

    const rightNum = parseNumberWithSuffix(rightPart);
    if (rightNum !== undefined) {
      return [
        ...leftVarInstructions,
        {
          opcode: OpCode.Load,
          variant: Variant.Immediate,
          operand1: 0,
          operand2: rightNum,
        },
        ...buildStoreHaltInstructions(OpCode.Add),
      ];
    }
  }

  return undefined;
}
