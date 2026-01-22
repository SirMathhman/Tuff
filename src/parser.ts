import { type Instruction, OpCode, Variant } from "./vm";

export function parseSpaceSeparatedTokens(source: string): string[] {
  const trimmed = source.trim();
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
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
  return parts;
}

export function isIdentifierChar(char: string, isFirstChar: boolean): boolean {
  const isLetter = (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
  const isDigit = char >= "0" && char <= "9";
  const isUnderscore = char === "_";

  if (isFirstChar) {
    return isLetter || isUnderscore;
  }
  return isLetter || isDigit || isUnderscore;
}

export function findChar(
  source: string,
  char: string,
  startIndex: number = 0,
): number {
  for (let i = startIndex; i < source.length; i++) {
    if (source[i] === char) return i;
  }
  return -1;
}

export function extractVariableName(source: string): string {
  let afterLet = source.substring(3).trim();

  // Skip the "mut" keyword if present
  if (afterLet.startsWith("mut")) {
    afterLet = afterLet.substring(3).trim();
  }

  let varName = "";
  for (let i = 0; i < afterLet.length; i++) {
    const char = afterLet[i];
    if (char === undefined) break;
    if (varName.length > 0 && (char === " " || char === "\t")) break;
    if (!isIdentifierChar(char, varName.length === 0)) break;
    varName += char;
  }
  return varName;
}

export function findMatchingParen(source: string, startIndex: number): number {
  let depth = 1;
  for (let i = startIndex + 1; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function findMatchingBrace(source: string, startIndex: number): number {
  let depth = 1;
  for (let i = startIndex + 1; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

export function parseNumberWithSuffix(source: string): number | undefined {
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

export function findTypeSuffixIndex(source: string): number {
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

export function parseReadInstruction(
  source: string,
): Instruction[] | undefined {
  const parts = parseSpaceSeparatedTokens(source);

  if (parts.length !== 2 || parts[0] !== "read") {
    return undefined;
  }

  // Read from stdin into register 0, store in memory at 901 and 900, then halt
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
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 900,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 901,
    },
  ];
}

function parseReadIntoRegister0(): Instruction[] {
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
  ];
}

function parseReadIntoRegister1(): Instruction[] {
  // Read into r0, then store to temp location, then load into r1
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
      operand2: 903,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 903,
    },
  ];
}

function parseAtom(
  source: string,
  register: number,
  readFunction: () => Instruction[] | undefined,
): Instruction[] | undefined {
  if (source.startsWith("(")) {
    const closingIndex = findMatchingParen(source, 0);
    if (closingIndex === source.length - 1) {
      return undefined;
    }
  }

  if (source.startsWith("read")) {
    return readFunction();
  }

  const num = parseNumberWithSuffix(source);
  if (num !== undefined) {
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: register,
        operand2: num,
      },
    ];
  }

  return undefined;
}

export function parseSimpleAtom(source: string): Instruction[] | undefined {
  return parseAtom(source, 1, parseReadIntoRegister1);
}

export function parseRightAtom(source: string): Instruction[] | undefined {
  return parseAtom(source, 0, parseReadIntoRegister0);
}

export function buildMulOrDivResult(
  leftInstructions: Instruction[],
  rightInstructions: Instruction[],
  opcode: OpCode,
): Instruction[] {
  return [
    ...leftInstructions,
    ...rightInstructions,
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
      operand2: 902,
    },
  ];
}

export function findOperatorIndex(source: string, operator: string): number {
  for (let i = 0; i < source.length; i++) {
    if (source[i] === operator) {
      return i;
    }
  }
  return -1;
}

export function splitByOperator(
  source: string,
  operator: string,
): { leftPart: string; rightPart: string } | undefined {
  const opIndex = findOperatorIndex(source, operator);
  if (opIndex === -1) return undefined;
  return {
    leftPart: source.substring(0, opIndex).trim(),
    rightPart: source.substring(opIndex + 1).trim(),
  };
}

function parseMulOrDivExpression(
  source: string,
  opcode: OpCode,
  operator: string,
): Instruction[] | undefined {
  const parts = splitByOperator(source, operator);
  if (!parts) return undefined;

  const leftInstructions = parseSimpleAtom(parts.leftPart);
  if (!leftInstructions) return undefined;

  let rightInstructions: Instruction[] | undefined;
  const rightMulDiv =
    parseMulExpression(parts.rightPart) || parseDivExpression(parts.rightPart);
  if (rightMulDiv) {
    rightInstructions = rightMulDiv;
  } else {
    rightInstructions = parseRightAtom(parts.rightPart);
  }

  if (!rightInstructions) return undefined;

  return buildMulOrDivResult(leftInstructions, rightInstructions, opcode);
}

export function parseMulExpression(source: string): Instruction[] | undefined {
  return parseMulOrDivExpression(source, OpCode.Mul, "*");
}

export function parseDivExpression(source: string): Instruction[] | undefined {
  return parseMulOrDivExpression(source, OpCode.Div, "/");
}

export function isParenthesizedExpression(source: string): boolean {
  if (!source.startsWith("(")) return false;
  const closingIndex = findMatchingParen(source, 0);
  return closingIndex === source.length - 1;
}

export function extractParenthesizedContent(source: string): string {
  if (!source.startsWith("(")) return source;
  const closingIndex = findMatchingParen(source, 0);
  if (closingIndex === -1) return source;
  return source.substring(1, closingIndex);
}

export function isBracedExpression(source: string): boolean {
  if (!source.startsWith("{")) return false;
  const closingIndex = findMatchingBrace(source, 0);
  return closingIndex === source.length - 1;
}

export function extractBracedContent(source: string): string {
  if (!source.startsWith("{")) return source;
  const closingIndex = findMatchingBrace(source, 0);
  if (closingIndex === -1) return source;
  return source.substring(1, closingIndex);
}

export function getTypeSuffix(source: string): string {
  const suffixIndex = findTypeSuffixIndex(source);
  if (suffixIndex >= 0) {
    return source.substring(suffixIndex);
  }
  return "";
}

export function parseBooleanLiteral(source: string): boolean | undefined {
  if (source === "true") {
    return true;
  }
  if (source === "false") {
    return false;
  }
  return undefined;
}

export function findConditionParentheses(
  source: string,
  startPos: number,
): { start: number; end: number } | undefined {
  let parenStart = -1;
  for (let i = startPos; i < source.length; i++) {
    if (source[i] === "(") {
      parenStart = i;
      break;
    }
    if (source[i] !== " " && source[i] !== "\t") {
      break;
    }
  }

  if (parenStart === -1) {
    return undefined;
  }

  let depth = 1;
  for (let i = parenStart + 1; i < source.length; i++) {
    if (source[i] === "(") depth++;
    if (source[i] === ")") depth--;
    if (depth === 0) {
      return { start: parenStart, end: i };
    }
  }

  return undefined;
}

export function isElseKeyword(source: string, index: number): boolean {
  if (source.substring(index, index + 4) !== "else") return false;
  const afterElse = source[index + 4];
  return !afterElse || afterElse === " " || afterElse === "\t";
}

export function findElseKeyword(source: string, afterParenEnd: number): number {
  for (let i = afterParenEnd; i < source.length; i++) {
    if (isElseKeyword(source, i)) {
      return i;
    }
  }
  return -1;
}

export function isReferenceOperator(source: string): boolean {
  return source.startsWith("&");
}

export function extractReferenceTarget(source: string): string {
  if (!isReferenceOperator(source)) return source;
  return source.substring(1).trim();
}

export function isDereferenceOperator(source: string): boolean {
  return (
    source.startsWith("*") &&
    source.length > 1 &&
    isIdentifierChar(source[1], true)
  );
}

export function extractDereferenceTarget(source: string): string {
  if (!isDereferenceOperator(source)) return source;
  return source.substring(1).trim();
}
