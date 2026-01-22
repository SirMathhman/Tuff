import { type Instruction, OpCode, Variant } from "./vm";
import {
  parseNumberWithSuffix,
  parseReadInstruction,
  isParenthesizedExpression,
  extractParenthesizedContent,
  isBracedExpression,
  extractBracedContent,
  parseSimpleAtom,
  parseRightAtom,
  parseMulExpression,
  parseDivExpression,
  buildMulOrDivResult,
  splitByOperator,
} from "./parser";
import {
  checkTypeOverflow,
  checkNegativeUnsignedError,
  buildMulOrDivHalt,
  buildStoreHaltInstructions,
} from "./types";
import {
  buildAddInstructions,
  buildReadAddConstantInstructions,
  buildConstantAddReadInstructions,
  buildChainedReadAddExpression,
  buildReadAddMulInstructions,
  buildNumberLiteral,
} from "./helpers";
import { splitByAddOperator } from "./operator-parsing";

export function parseSubExpressionLeftPart(
  part: string,
): Instruction[] | undefined {
  let result = parseAddExpression(part);
  if (result) return result;
  result = parseSubExpression(part);
  if (result) return result;
  if (part.startsWith("read")) return parseReadInstruction(part);

  const num = parseNumberWithSuffix(part);
  if (num !== undefined) {
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 1,
        operand2: num,
      },
      {
        opcode: OpCode.Store,
        variant: Variant.Direct,
        operand1: 1,
        operand2: 901,
      },
    ];
  }

  return undefined;
}

export function parseSubExpressionRightPart(
  part: string,
): Instruction[] | undefined {
  if (part.startsWith("read")) return parseReadInstruction(part);

  const num = parseNumberWithSuffix(part);
  if (num !== undefined) {
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 0,
        operand2: num,
      },
    ];
  }

  return undefined;
}

export function parseSubExpression(source: string): Instruction[] | undefined {
  let minusIndex = -1;
  for (let i = 1; i < source.length; i++) {
    if (source[i] === "-") {
      minusIndex = i;
      break;
    }
  }
  if (minusIndex === -1) return undefined;

  const leftPart = source.substring(0, minusIndex).trim();
  const rightPart = source.substring(minusIndex + 1).trim();

  const leftInstructions = parseSubExpressionLeftPart(leftPart);
  if (!leftInstructions) return undefined;

  const rightInstructions = parseSubExpressionRightPart(rightPart);
  if (!rightInstructions) return undefined;

  return [
    ...leftInstructions.slice(0, -1),
    ...rightInstructions.slice(0, -1),
    ...buildStoreHaltInstructions(OpCode.Sub),
  ];
}

export function parseGroupedAtom(
  source: string,
  targetRegister: number,
): Instruction[] | undefined {
  let innerExpr: string | undefined;

  if (isParenthesizedExpression(source)) {
    innerExpr = extractParenthesizedContent(source);
  } else if (isBracedExpression(source)) {
    innerExpr = extractBracedContent(source);
  } else {
    return undefined;
  }

  const innerResult =
    parseAddExpression(innerExpr) || parseSubExpression(innerExpr);
  if (!innerResult) return undefined;

  return [
    ...innerResult.slice(0, -1),
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: 900,
    },
  ];
}

export function parseAddExpression(source: string): Instruction[] | undefined {
  const parts = splitByAddOperator(source);
  if (!parts) return undefined;

  const { leftPart, rightPart } = parts;

  // Check if left is "read U8"
  const isLeftRead = leftPart.startsWith("read");

  if (!isLeftRead) {
    return parseAddExpressionConstantLeft(leftPart, rightPart);
  }

  return parseAddExpressionReadLeft(leftPart, rightPart);
}

export function parseLeftMulDivAtom(
  leftPart: string,
): Instruction[] | undefined {
  if (isParenthesizedExpression(leftPart) || isBracedExpression(leftPart)) {
    return parseGroupedAtom(leftPart, 1);
  }
  return parseSimpleAtom(leftPart);
}

export function parseRightMulDivAtom(
  rightPart: string,
): Instruction[] | undefined {
  const rightMulDiv =
    parseMulOrDivExpressionWithParens(rightPart, OpCode.Mul, "*") ||
    parseMulOrDivExpressionWithParens(rightPart, OpCode.Div, "/");
  if (rightMulDiv) return rightMulDiv;

  if (isParenthesizedExpression(rightPart) || isBracedExpression(rightPart)) {
    return parseGroupedAtom(rightPart, 0);
  }
  return parseRightAtom(rightPart);
}

export function parseMulOrDivExpressionWithParens(
  source: string,
  opcode: OpCode,
  operator: string,
): Instruction[] | undefined {
  // Quick check: if source has no parentheses or braces, use the parser.ts version
  if (!source.includes("(") && !source.includes("{")) {
    return opcode === OpCode.Mul
      ? parseMulExpression(source)
      : parseDivExpression(source);
  }

  const parts = splitByOperator(source, operator);
  if (!parts) return undefined;

  const leftInstructions = parseLeftMulDivAtom(parts.leftPart);
  if (!leftInstructions) return undefined;

  const rightInstructions = parseRightMulDivAtom(parts.rightPart);
  if (!rightInstructions) return undefined;

  return buildMulOrDivResult(leftInstructions, rightInstructions, opcode);
}

export function parseRightMulOrDivWithParens(
  rightPart: string,
): Instruction[] | undefined {
  const mulResult = parseMulOrDivExpressionWithParens(
    rightPart,
    OpCode.Mul,
    "*",
  );
  if (mulResult) return mulResult;
  return parseMulOrDivExpressionWithParens(rightPart, OpCode.Div, "/");
}

interface ParseLetExpressionFn {
  (
    source: string,
    context: unknown,
  ): { instructions: Instruction[]; newContext: unknown } | undefined;
}

export function tryLetInBraces(
  rightPart: string,
  leftInstructions: Instruction[],
  parseLetExpressionFn: ParseLetExpressionFn,
): Instruction[] | undefined {
  if (!isBracedExpression(rightPart)) return undefined;

  const unwrappedRightPart = extractBracedContent(rightPart).trim();
  const letResult = parseLetExpressionFn(unwrappedRightPart, []);
  if (!letResult) return undefined;

  // Let expression compiled successfully - combine with left
  // Left side has value in memory[901]
  // Let result has value in memory[900]
  return [
    ...leftInstructions.slice(0, -1), // Exclude halt from left, value in 901
    ...letResult.instructions.slice(0, -1), // Exclude halt from let, value in 900
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 900,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 901,
    },
    ...buildStoreHaltInstructions(OpCode.Add),
  ];
}

function parseAddReadLeftMulDiv(
  leftInstructions: Instruction[],
  rightPart: string,
): Instruction[] | undefined {
  const unwrappedRightPart = isBracedExpression(rightPart)
    ? extractBracedContent(rightPart).trim()
    : rightPart;

  const mulDivResult = parseRightMulOrDivWithParens(unwrappedRightPart);
  if (mulDivResult) {
    return [
      ...leftInstructions.slice(0, -1), // Exclude halt from left, leaves value in memory[901]
      ...mulDivResult, // Result is in memory[902], no halt to exclude
      ...buildReadAddMulInstructions(),
    ];
  }

  return undefined;
}

function parseAddReadLeftConstant(
  leftInstructions: Instruction[],
  rightPart: string,
): Instruction[] | undefined {
  const unwrappedRightPart = isBracedExpression(rightPart)
    ? extractBracedContent(rightPart).trim()
    : rightPart;

  const rightNum = parseNumberWithSuffix(unwrappedRightPart);
  if (rightNum !== undefined) {
    return buildReadAddConstantInstructions(rightNum);
  }

  return undefined;
}

function parseAddReadLeftContinuation(
  leftInstructions: Instruction[],
  rightPart: string,
): Instruction[] | undefined {
  const unwrappedRightPart = isBracedExpression(rightPart)
    ? extractBracedContent(rightPart).trim()
    : rightPart;

  const chainedAddition = parseAddExpression(unwrappedRightPart);
  if (chainedAddition) {
    return buildChainedReadAddExpression(chainedAddition);
  }

  return undefined;
}

export function parseAddExpressionReadLeft(
  leftPart: string,
  rightPart: string,
  parseLetExpressionFn?: ParseLetExpressionFn,
): Instruction[] | undefined {
  // Parse left side as read
  const leftInstructions = parseReadInstruction(leftPart);
  if (!leftInstructions) return undefined;

  // Try parsing braced let expression first
  if (parseLetExpressionFn) {
    const letResult = tryLetInBraces(
      rightPart,
      leftInstructions,
      parseLetExpressionFn,
    );
    if (letResult) return letResult;
  }

  // Try parsing right side as multiplication or division (higher precedence)
  const mulDivResult = parseAddReadLeftMulDiv(leftInstructions, rightPart);
  if (mulDivResult) return mulDivResult;

  // Try parsing right side as another addition expression (for chaining)
  const contResult = parseAddReadLeftContinuation(leftInstructions, rightPart);
  if (contResult) return contResult;

  // Try parsing as a number constant
  const constResult = parseAddReadLeftConstant(leftInstructions, rightPart);
  if (constResult) return constResult;

  // Try parsing as read instruction
  const unwrappedRightPart = isBracedExpression(rightPart)
    ? extractBracedContent(rightPart).trim()
    : rightPart;
  const rightInstructions = parseReadInstruction(unwrappedRightPart);
  if (!rightInstructions) return undefined;

  // Both are reads
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 901,
    },
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    ...buildAddInstructions(),
  ];
}

export function parseAddExpressionConstantLeft(
  leftPart: string,
  rightPart: string,
): Instruction[] | undefined {
  // Left side is not "read", try to parse it as a number
  const leftNum = parseNumberWithSuffix(leftPart);
  if (leftNum === undefined) return undefined;

  // Check if right is "read U8"
  if (rightPart.startsWith("read")) {
    const rightInstructions = parseReadInstruction(rightPart);
    if (!rightInstructions) return undefined;

    // Constant on left, read on right
    return buildConstantAddReadInstructions(leftNum);
  }

  // Try to parse right as a constant or arithmetic expression
  const rightNum = parseNumberWithSuffix(rightPart);
  if (rightNum !== undefined) {
    // Both are constants - compile as 5I32 + 2I32
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 1,
        operand2: leftNum,
      },
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 0,
        operand2: rightNum,
      },
      ...buildStoreHaltInstructions(OpCode.Add),
    ];
  }

  return undefined;
}

export function parseArithmeticOrLiteral(
  trimmed: string,
): Instruction[] | undefined {
  const arithResult = parseAddExpression(trimmed);
  if (arithResult) {
    return arithResult;
  }

  const subResult = parseSubExpression(trimmed);
  if (subResult) {
    return subResult;
  }

  const divResult = parseMulOrDivExpressionWithParens(trimmed, OpCode.Div, "/");
  if (divResult) {
    return [...divResult, ...buildMulOrDivHalt(OpCode.Halt, 902)];
  }

  const mulResult = parseMulOrDivExpressionWithParens(trimmed, OpCode.Mul, "*");
  if (mulResult) {
    return [...mulResult, ...buildMulOrDivHalt(OpCode.Halt, 902)];
  }

  if (trimmed.startsWith("read")) {
    const readResult = parseReadInstruction(trimmed);
    if (readResult) {
      return readResult;
    }
  }

  // Parse literals (numbers and booleans)
  const num = parseNumberWithSuffix(trimmed);
  if (num !== undefined) {
    return buildNumberLiteral(num);
  }

  return undefined;
}

export function compileNoContext(source: string): Instruction[] | undefined {
  const trimmed = source.trim();

  if (!trimmed) {
    return [];
  }

  const negError = checkNegativeUnsignedError(trimmed);
  if (negError) {
    return undefined;
  }

  const overflowError = checkTypeOverflow(trimmed);
  if (overflowError) {
    return undefined;
  }

  if (isParenthesizedExpression(trimmed)) {
    const innerExpr = extractParenthesizedContent(trimmed);
    return compileNoContext(innerExpr);
  }

  if (isBracedExpression(trimmed)) {
    const innerExpr = extractBracedContent(trimmed);
    return compileNoContext(innerExpr);
  }

  return parseArithmeticOrLiteral(trimmed);
}
