import { type Instruction, OpCode, Variant } from "./vm";
import { parseNumberWithSuffix } from "./parser";
import { buildStoreHaltInstructions } from "./types";
import { type VariableContext, resolveVariable } from "./let-binding";

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
  // Look for + operator
  let plusIndex = -1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "+") {
      plusIndex = i;
      break;
    }
  }
  if (plusIndex === -1) return undefined;

  const leftPart = source.substring(0, plusIndex).trim();
  const rightPart = source.substring(plusIndex + 1).trim();

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
