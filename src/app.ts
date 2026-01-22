import { execute, type Instruction, OpCode, Variant } from "./vm";
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
  type CompileError,
  checkTypeOverflow,
  checkNegativeUnsignedError,
  buildMulOrDivHalt,
} from "./types";

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<X> {
  ok: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<X>(error: X): Err<X> {
  return { ok: false, error };
}

function buildStoreHaltInstructions(opcode: OpCode): Instruction[] {
  return [
    {
      opcode,
      variant: Variant.Immediate,
      operand1: 1,
      operand2: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 900,
    },
  ];
}

function buildAddInstructions(): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 901,
    },
    ...buildStoreHaltInstructions(OpCode.Add),
  ];
}

function buildReadAddConstantInstructions(constant: number): Instruction[] {
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
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: constant,
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

function buildConstantAddReadInstructions(constant: number): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: constant,
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
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 901,
    },
    ...buildStoreHaltInstructions(OpCode.Add),
  ];
}

function parseSubExpression(source: string): Instruction[] | undefined {
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

  const leftInstructions = parseLeftForSub(leftPart);
  if (!leftInstructions) return undefined;

  const rightInstructions = parseRightForSub(rightPart);
  if (!rightInstructions) return undefined;

  return [
    ...leftInstructions.slice(0, -1),
    ...rightInstructions.slice(0, -1),
    ...buildStoreHaltInstructions(OpCode.Sub),
  ];
}

function parseLeftForSub(part: string): Instruction[] | undefined {
  let result = parseAddExpression(part);
  if (result) return result;

  result = parseSubExpression(part);
  if (result) return result;

  if (part.startsWith("read")) {
    return parseReadInstruction(part);
  }

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

function parseRightForSub(part: string): Instruction[] | undefined {
  if (part.startsWith("read")) {
    return parseReadInstruction(part);
  }

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

function parseGroupedAtom(
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

function parseParenthesizedAtom(
  source: string,
  targetRegister: number,
): Instruction[] | undefined {
  return parseGroupedAtom(source, targetRegister);
}

function parseAddExpression(source: string): Instruction[] | undefined {
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

  // Check if left is "read U8"
  const isLeftRead = leftPart.startsWith("read");

  if (!isLeftRead) {
    return parseAddExpressionConstantLeft(leftPart, rightPart);
  }

  return parseAddExpressionReadLeft(leftPart, rightPart);
}

function buildChainedReadAddExpression(
  chainedAddition: Instruction[],
): Instruction[] {
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
      operand2: 902,
    },
    ...chainedAddition.slice(0, -1), // Process chain, exclude halt
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
      operand2: 902,
    },
    ...buildStoreHaltInstructions(OpCode.Add),
  ];
}

function buildReadAddMulInstructions(): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 902,
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

function parseLeftMulDivAtom(leftPart: string): Instruction[] | undefined {
  if (isParenthesizedExpression(leftPart) || isBracedExpression(leftPart)) {
    return parseParenthesizedAtom(leftPart, 1);
  }
  return parseSimpleAtom(leftPart);
}

function parseRightMulDivAtom(rightPart: string): Instruction[] | undefined {
  const rightMulDiv =
    parseMulExpressionWithParens(rightPart) ||
    parseDivExpressionWithParens(rightPart);
  if (rightMulDiv) return rightMulDiv;

  if (isParenthesizedExpression(rightPart) || isBracedExpression(rightPart)) {
    return parseParenthesizedAtom(rightPart, 0);
  }
  return parseRightAtom(rightPart);
}

function parseMulOrDivExpressionWithParens(
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

function parseMulExpressionWithParens(
  source: string,
): Instruction[] | undefined {
  return parseMulOrDivExpressionWithParens(source, OpCode.Mul, "*");
}

function parseDivExpressionWithParens(
  source: string,
): Instruction[] | undefined {
  return parseMulOrDivExpressionWithParens(source, OpCode.Div, "/");
}

function parseRightMulOrDivWithParens(
  rightPart: string,
): Instruction[] | undefined {
  const mulResult = parseMulExpressionWithParens(rightPart);
  if (mulResult) return mulResult;
  return parseDivExpressionWithParens(rightPart);
}

function parseAddExpressionReadLeft(
  leftPart: string,
  rightPart: string,
): Instruction[] | undefined {
  // Parse left side as read
  const leftInstructions = parseReadInstruction(leftPart);
  if (!leftInstructions) return undefined;

  // Unwrap braces if present
  let unwrappedRightPart = rightPart;
  if (isBracedExpression(rightPart)) {
    unwrappedRightPart = extractBracedContent(rightPart);
  }

  // First, try parsing right side as multiplication or division (higher precedence)
  const mulDivResult = parseRightMulOrDivWithParens(unwrappedRightPart);
  if (mulDivResult) {
    return [
      ...leftInstructions.slice(0, -1), // Exclude halt from left, leaves value in memory[901]
      ...mulDivResult, // Result is in memory[902], no halt to exclude
      ...buildReadAddMulInstructions(),
    ];
  }

  // Try parsing right side as another addition expression (for chaining)
  const chainedAddition = parseAddExpression(unwrappedRightPart);
  if (chainedAddition) {
    return buildChainedReadAddExpression(chainedAddition);
  }

  // Try parsing as a number constant
  const rightNum = parseNumberWithSuffix(unwrappedRightPart);
  if (rightNum !== undefined) {
    // Right side is a number constant
    return buildReadAddConstantInstructions(rightNum);
  }

  // Try parsing as read instruction
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

function parseAddExpressionConstantLeft(
  leftPart: string,
  rightPart: string,
): Instruction[] | undefined {
  // Left side is not "read", try to parse it as a number
  const leftNum = parseNumberWithSuffix(leftPart);
  if (leftNum === undefined) return undefined;

  // Check if right is "read U8"
  if (!rightPart.startsWith("read")) return undefined;

  const rightInstructions = parseReadInstruction(rightPart);
  if (!rightInstructions) return undefined;

  // Constant on left, read on right
  return buildConstantAddReadInstructions(leftNum);
}

function parseNumberLiteral(source: string): Instruction[] | undefined {
  const num = parseNumberWithSuffix(source);
  if (num === undefined) return undefined;

  // Store the number in memory at address 900
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: num,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 900,
    },
  ];
}

export function compile(source: string): Result<Instruction[], CompileError> {
  const trimmed = source.trim();

  if (!trimmed) {
    return ok([]);
  }

  const negError = checkNegativeUnsignedError(trimmed);
  if (negError) {
    return err(negError);
  }

  const overflowError = checkTypeOverflow(trimmed);
  if (overflowError) {
    return err(overflowError);
  }

  if (isParenthesizedExpression(trimmed)) {
    const innerExpr = extractParenthesizedContent(trimmed);
    return compile(innerExpr);
  }

  if (isBracedExpression(trimmed)) {
    const innerExpr = extractBracedContent(trimmed);
    return compile(innerExpr);
  }

  const arithResult = parseAddExpression(trimmed);
  if (arithResult) {
    return ok(arithResult);
  }

  const subResult = parseSubExpression(trimmed);
  if (subResult) {
    return ok(subResult);
  }

  const divResult = parseDivExpressionWithParens(trimmed);
  if (divResult) {
    return ok([...divResult, ...buildMulOrDivHalt(OpCode.Halt, 902)]);
  }

  const mulResult = parseMulExpressionWithParens(trimmed);
  if (mulResult) {
    return ok([...mulResult, ...buildMulOrDivHalt(OpCode.Halt, 902)]);
  }

  if (trimmed.startsWith("read")) {
    const readResult = parseReadInstruction(trimmed);
    if (readResult) {
      return ok(readResult);
    }
  }

  const numResult = parseNumberLiteral(trimmed);
  if (numResult) {
    return ok(numResult);
  }

  return ok([]);
}

export function executeWithArray(
  instructions: Instruction[],
  stdIn: number[],
): number {
  return execute(
    instructions,
    () => {
      // Read from stdIn
      return stdIn.shift() ?? 0;
    },
    (value: number) => {
      // Write to stdouts
      console.log("Output:", value);
    },
  );
}
