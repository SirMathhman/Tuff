import { type Instruction, OpCode } from "../../core/vm";
import { parseNumberWithSuffix, parseSpaceSeparatedTokens } from "../../parsing/parser";
import {
  buildReadComparisonRead,
  buildReadComparisonConstant,
} from "../../support/helpers";
import { splitByComparisonOperator } from "../../parsing/operator-parsing";

function extractReadType(readExpr: string): string | undefined {
  const parts = parseSpaceSeparatedTokens(readExpr);
  if (parts.length === 2 && parts[0] === "read") {
    return parts[1];
  }
  return undefined;
}

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
  } else if (operator === "<=") {
    opcode = OpCode.LessThanOrEqual;
  } else if (operator === ">=") {
    opcode = OpCode.GreaterThanOrEqual;
  } else {
    return undefined;
  }

  // For now, only support "read U8 == read U8" pattern
  if (leftPart.startsWith("read") && rightPart.startsWith("read")) {
    const leftType = extractReadType(leftPart);
    const rightType = extractReadType(rightPart);
    if (leftType !== rightType) {
      return undefined;
    }
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
