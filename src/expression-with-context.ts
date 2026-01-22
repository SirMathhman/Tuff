import { type Instruction, OpCode, Variant } from "./vm";
import { parseNumberWithSuffix } from "./parser";
import { buildStoreHaltInstructions } from "./types";
import { type VariableContext, resolveVariable } from "./let-binding";
import { splitByAddOperator } from "./operator-parsing";

export function tryResolveVariableAtom(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
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
