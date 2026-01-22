import { type Instruction, OpCode } from "./vm";
import {
  parseNumberWithSuffix,
} from "./parser";
import {
  buildReadComparisonRead,
  buildReadComparisonConstant,
} from "./helpers";
import { splitByComparisonOperator } from "./operator-parsing";

export function parseComparisonExpression(
  source: string,
): Instruction[] | undefined {
  const parts = splitByComparisonOperator(source);
  if (!parts) return undefined;

  const { leftPart, operator, rightPart } = parts;

  let opcode: OpCode;
  if (operator === "==") {
    opcode = OpCode.Equal;
  } else if (operator === "<") {
    opcode = OpCode.LessThan;
  } else if (operator === ">") {
    opcode = OpCode.GreaterThan;
  } else if (operator === "<=" || operator === ">=") {
    // Not yet implemented
    return undefined;
  } else {
    return undefined;
  }

  // For now, only support "read U8 == read U8" pattern
  if (leftPart.startsWith("read") && rightPart.startsWith("read")) {
    return buildReadComparisonRead(opcode);
  }

  // Try "read U8 == constant" pattern
  if (leftPart.startsWith("read")) {
    const rightNum = parseNumberWithSuffix(rightPart);
    if (rightNum !== undefined) {
      return buildReadComparisonConstant(rightNum, opcode);
    }
  }

  return undefined;
}
