import { execute, type Instruction, OpCode, Variant } from "./vm";

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<X> {
  ok: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export interface Error {
  // What went wrong
  cause: string;

  // Why it went wrong
  reason: string;

  // How to fix it
  fix: string;
}

export interface Location {
  line: number;
  column: number;
  length: number;
}

export interface CompileError extends Error {
  first: Location;

  // Sometimes, we might have two different places that conflict with each other
  second?: Location;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<X>(error: X): Err<X> {
  return { ok: false, error };
}

function findTypeSuffixIndex(source: string): number {
  for (let i = source.length - 1; i >= 0; i--) {
    const char = source[i];
    if (char && char >= "0" && char <= "9") continue;
    if (char && char >= "A" && char <= "Z") {
      return i;
    }
    break;
  }
  return -1;
}

function getTypeSuffix(source: string): string {
  const suffixIndex = findTypeSuffixIndex(source);
  if (suffixIndex >= 0) {
    return source.substring(suffixIndex);
  }
  return "";
}

function isSignedType(suffix: string): boolean {
  return suffix.length > 0 && suffix[0] === "I";
}

function getTypeBits(suffix: string): number | undefined {
  if (suffix.length < 2) return undefined;
  const bitsStr = suffix.substring(1);
  let isValidNumber = true;
  for (let i = 0; i < bitsStr.length; i++) {
    const char = bitsStr[i];
    if (!(char && char >= "0" && char <= "9")) {
      isValidNumber = false;
      break;
    }
  }
  if (isValidNumber) {
    const bits = parseInt(bitsStr, 10);
    if (!isNaN(bits)) {
      return bits;
    }
  }
  return undefined;
}

function getTypeRange(
  suffix: string,
): { min: number; max: number } | undefined {
  const bits = getTypeBits(suffix);
  if (bits === undefined) return undefined;

  if (isSignedType(suffix)) {
    const minVal = -Math.pow(2, bits - 1);
    const maxVal = Math.pow(2, bits - 1) - 1;
    return { min: minVal, max: maxVal };
  }
  const minVal = 0;
  const maxVal = Math.pow(2, bits) - 1;
  return { min: minVal, max: maxVal };
}

function parseNumberWithSuffix(source: string): number | undefined {
  const suffixIndex = findTypeSuffixIndex(source);
  const numStr = suffixIndex >= 0 ? source.substring(0, suffixIndex) : source;

  // Validate the number part contains only digits and optional minus sign
  let isValidNumber = numStr.length > 0;
  for (let i = 0; i < numStr.length; i++) {
    const char = numStr[i];
    if (i === 0 && char === "-") continue;
    if (char && char >= "0" && char <= "9") continue;
    isValidNumber = false;
    break;
  }

  if (isValidNumber) {
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      return num;
    }
  }
}

function hasTypeSuffix(source: string): boolean {
  return findTypeSuffixIndex(source) >= 0;
}

function parseReadInstruction(source: string): Instruction[] | undefined {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char !== " " && char !== "\t") {
      current += char;
      continue;
    }
    if (current.length > 0) {
      parts.push(current);
      current = "";
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }

  if (parts.length !== 2 || parts[0] !== "read") {
    return undefined;
  }

  // Read from stdin into register 0, store in memory at 900, then halt
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
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 900,
    },
  ];
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

function buildAddStoreHaltInstructions(): Instruction[] {
  return buildStoreHaltInstructions(OpCode.Add);
}

function buildAddInstructions(): Instruction[] {
  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 901,
    },
    ...buildAddStoreHaltInstructions(),
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
    ...buildAddStoreHaltInstructions(),
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
    ...buildAddStoreHaltInstructions(),
  ];
}

function buildSubInstructions(): Instruction[] {
  return buildStoreHaltInstructions(OpCode.Sub);
}

function parseLeftSideForSub(leftPart: string): Instruction[] | undefined {
  // Try add/sub expressions first, then simple values
  let leftInstructions = parseAddExpression(leftPart);
  if (leftInstructions) return leftInstructions;

  leftInstructions = parseSubExpression(leftPart);
  if (leftInstructions) return leftInstructions;

  if (leftPart.startsWith("read")) {
    return parseReadInstruction(leftPart);
  }

  const num = parseNumberWithSuffix(leftPart);
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

function parseRightSideForSub(rightPart: string): Instruction[] | undefined {
  if (rightPart.startsWith("read")) {
    return parseReadInstruction(rightPart);
  }

  const num = parseNumberWithSuffix(rightPart);
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

function parseSubExpression(source: string): Instruction[] | undefined {
  // Look for - operator (skip if it's at the start, as that's a negative number)
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

  const leftInstructions = parseLeftSideForSub(leftPart);
  if (!leftInstructions) return undefined;

  const rightInstructions = parseRightSideForSub(rightPart);
  if (!rightInstructions) return undefined;

  // Build complete subtraction instruction sequence
  return [
    ...leftInstructions.slice(0, -1), // Exclude halt from left
    ...rightInstructions.slice(0, -1), // Exclude halt from right (if exists)
    ...buildSubInstructions(),
  ];
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
    ...buildAddStoreHaltInstructions(),
  ];
}

function parseAddExpressionReadLeft(
  leftPart: string,
  rightPart: string,
): Instruction[] | undefined {
  // Parse left side as read
  const leftInstructions = parseReadInstruction(leftPart);
  if (!leftInstructions) return undefined;

  // Parse right side - could be "read U8", a number, or another addition expression

  // First, try parsing right side as another addition expression (for chaining)
  const chainedAddition = parseAddExpression(rightPart);
  if (chainedAddition) {
    return buildChainedReadAddExpression(chainedAddition);
  }

  // Try parsing as a number constant
  const rightNum = parseNumberWithSuffix(rightPart);
  if (rightNum !== undefined) {
    // Right side is a number constant
    return buildReadAddConstantInstructions(rightNum);
  }

  // Try parsing as read instruction
  const rightInstructions = parseReadInstruction(rightPart);
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

function checkTypeOverflow(source: string): CompileError | undefined {
  if (!hasTypeSuffix(source)) return undefined;

  const suffix = getTypeSuffix(source);
  const range = getTypeRange(suffix);
  if (range === undefined) return undefined;

  const num = parseNumberWithSuffix(source);
  if (num === undefined) return undefined;

  if (num < range.min || num > range.max) {
    return {
      cause: `Value ${num} overflows type ${suffix}`,
      reason: `${suffix} can only hold values between ${range.min} and ${range.max}`,
      fix: `Use a larger type suffix or remove the suffix`,
      first: { line: 0, column: 0, length: source.length },
    };
  }

  return undefined;
}

export function compile(source: string): Result<Instruction[], CompileError> {
  // TODO, this will get rather complex!
  // This is the function you should probably implement

  const trimmed = source.trim();

  // Empty source: return empty instructions (implicit halt with 0)
  if (!trimmed) {
    return ok([]);
  }

  // Check for invalid: negative numbers with unsigned type suffix
  if (trimmed.startsWith("-") && hasTypeSuffix(trimmed)) {
    const suffix = getTypeSuffix(trimmed);
    if (!isSignedType(suffix)) {
      return err({
        cause: "Negative literals cannot have unsigned type suffixes",
        reason:
          "Type suffixes like U8 are for unsigned types, which cannot be negative",
        fix: "Use a signed type suffix like I8, or remove the type suffix",
        first: { line: 0, column: 0, length: trimmed.length },
      });
    }
  }

  // Check for value overflow with type suffixes
  const overflowError = checkTypeOverflow(trimmed);
  if (overflowError) {
    return err(overflowError);
  }

  // Check for arithmetic expressions
  const arithResult = parseAddExpression(trimmed);
  if (arithResult) {
    return ok(arithResult);
  }

  // Check for subtraction expressions
  const subResult = parseSubExpression(trimmed);
  if (subResult) {
    return ok(subResult);
  }

  // Check for read instruction
  if (trimmed.startsWith("read")) {
    const readResult = parseReadInstruction(trimmed);
    if (readResult) {
      return ok(readResult);
    }
  }

  // Try to parse as a number with optional type suffix
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
