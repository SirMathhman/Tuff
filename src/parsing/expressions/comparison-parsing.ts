import { type Instruction, OpCode, Variant } from "../../core/vm";
import { type VariableContext } from "../../types/variable-types";
import { findComparisonOperatorIndex, splitByComparisonOperator } from "../operator-parsing";
import { buildStoreAndHalt, buildIn } from "../../compilation/instruction-primitives";
import { tryResolveVariableAtom } from "../expression-with-context";
import { parseNumberWithSuffix } from "../parser";

type CompileFunc = (
  expr: string,
  ctx: VariableContext,
) =>
  | {
      instructions: Instruction[];
      context: VariableContext;
      functionContext: unknown;
    }
  | undefined;

function getComparisonOpcode(operator: string): OpCode | undefined {
  switch (operator) {
    case "==":
      return OpCode.Equal;
    case "<":
      return OpCode.LessThan;
    case ">":
      return OpCode.GreaterThan;
    case "<=":
      return OpCode.LessThanOrEqual;
    case ">=":
      return OpCode.GreaterThanOrEqual;
    default:
      return undefined;
  }
}

function tryResolveReadExpression(rightPart: string): Instruction[] | undefined {
  if (!rightPart.startsWith("read ")) return undefined;
  // Read into r0
  return [buildIn(0)];
}

function tryResolveRightOperand(
  rightPart: string,
  context: VariableContext,
): Instruction[] | undefined {
  // Try to resolve as a number constant
  const rightNum = parseNumberWithSuffix(rightPart);
  if (rightNum !== undefined) {
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 0,
        operand2: rightNum,
      },
    ];
  }

  // Try to resolve as a variable
  const rightVar = tryResolveVariableAtom(rightPart, context, 0);
  if (rightVar) return rightVar;

  // Try to resolve as a read expression
  const readInstr = tryResolveReadExpression(rightPart);
  if (readInstr) return readInstr;

  return undefined;
}

export function tryComparisonExpression(
  source: string,
  context: VariableContext,
  _compileFunc: CompileFunc,
): Instruction[] | undefined {
  const comparisonIndex = findComparisonOperatorIndex(source);
  if (comparisonIndex === -1) return undefined;

  const parts = splitByComparisonOperator(source);
  if (!parts) return undefined;

  const { leftPart, operator, rightPart } = parts;
  const opcode = getComparisonOpcode(operator);
  if (!opcode) return undefined;

  // Try to resolve left operand
  const leftInstructions = tryResolveVariableAtom(leftPart, context, 1);
  if (!leftInstructions) return undefined;

  // Try to resolve right operand
  const rightInstructions = tryResolveRightOperand(rightPart, context);
  if (!rightInstructions) return undefined;

  return [
    ...leftInstructions,
    ...rightInstructions,
    {
      opcode,
      variant: Variant.Immediate,
      operand1: 1,
      operand2: 0,
    },
    ...buildStoreAndHalt(),
  ];
}
