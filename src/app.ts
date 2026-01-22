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
  parseBooleanLiteral,
} from "./parser";
import {
  type CompileError,
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
  buildBooleanLiteral,
} from "./helpers";
import {
  type VariableContext,
  resolveVariable,
  buildVarRefInstructions,
  parseReassignmentComponents,
  buildReassignmentInstructions,
  isVariableMutable,
  buildContextFromLetBindings,
} from "./let-binding";
import { parseAddExpressionWithContext } from "./expression-with-context";
import { splitByAddOperator } from "./operator-parsing";
import { parseComparisonExpression } from "./comparison-parsing";
import { parseLetExpression as parseLetExpressionModule } from "./let-expression-parsing";
import { parseIfExpression } from "./if-expression-parsing";
import {
  detectVariableShadowing,
  detectTypeIncompatibility,
  detectComparisonTypeMismatch,
  detectInvalidIfCondition,
  detectIfBranchTypeMismatch,
  detectNonMutableReassignment,
  detectReassignmentTypeChange,
} from "./validation";

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

function parseSubExpressionLeftPart(part: string): Instruction[] | undefined {
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

function parseSubExpressionRightPart(part: string): Instruction[] | undefined {
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

function parseAddExpression(source: string): Instruction[] | undefined {
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

function parseLeftMulDivAtom(leftPart: string): Instruction[] | undefined {
  if (isParenthesizedExpression(leftPart) || isBracedExpression(leftPart)) {
    return parseGroupedAtom(leftPart, 1);
  }
  return parseSimpleAtom(leftPart);
}

function parseRightMulDivAtom(rightPart: string): Instruction[] | undefined {
  const rightMulDiv =
    parseMulOrDivExpressionWithParens(rightPart, OpCode.Mul, "*") ||
    parseMulOrDivExpressionWithParens(rightPart, OpCode.Div, "/");
  if (rightMulDiv) return rightMulDiv;

  if (isParenthesizedExpression(rightPart) || isBracedExpression(rightPart)) {
    return parseGroupedAtom(rightPart, 0);
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

function parseRightMulOrDivWithParens(
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

function tryLetInBraces(
  rightPart: string,
  leftInstructions: Instruction[],
): Instruction[] | undefined {
  if (!isBracedExpression(rightPart)) return undefined;

  const unwrappedRightPart = extractBracedContent(rightPart).trim();
  const letResult = parseLetExpression(unwrappedRightPart, []);
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

function parseAddExpressionReadLeft(
  leftPart: string,
  rightPart: string,
): Instruction[] | undefined {
  // Parse left side as read
  const leftInstructions = parseReadInstruction(leftPart);
  if (!leftInstructions) return undefined;

  // Try parsing braced let expression first
  const letResult = tryLetInBraces(rightPart, leftInstructions);
  if (letResult) return letResult;

  const unwrappedRightPart = isBracedExpression(rightPart)
    ? extractBracedContent(rightPart).trim()
    : rightPart;

  // Try parsing right side as multiplication or division (higher precedence)
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

function parseLetExpression(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; newContext: VariableContext } | undefined {
  return parseLetExpressionModule(source, compileWithContext, context);
}

function tryReassignment(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const comp = parseReassignmentComponents(source);
  if (!comp) return undefined;

  const addr = resolveVariable(context, comp.varName);
  if (addr === undefined) return undefined;

  if (!isVariableMutable(context, comp.varName)) return undefined;

  const res = compileWithContext(comp.exprPart, context);
  if (!res) return undefined;

  const instr = buildReassignmentInstructions(res.instructions, addr);

  if (comp.remaining.length === 0) {
    return {
      instructions: [...instr, ...buildVarRefInstructions(addr)],
      context,
    };
  }

  const remRes = compileWithContext(comp.remaining, context);
  return remRes
    ? {
        instructions: [...instr, ...remRes.instructions],
        context: remRes.context,
      }
    : undefined;
}

function compileWithContext(
  source: string,
  context: VariableContext,
): { instructions: Instruction[]; context: VariableContext } | undefined {
  const trimmed = source.trim();

  if (!trimmed) {
    return { instructions: [], context };
  }

  // Try parsing as let expression
  const letResult = parseLetExpression(trimmed, context);
  if (letResult) {
    return {
      instructions: letResult.instructions,
      context: letResult.newContext,
    };
  }

  // Try parsing as reassignment (e.g., "x = read I32;")
  const reassignmentResult = tryReassignment(trimmed, context);
  if (reassignmentResult) {
    return reassignmentResult;
  }

  // Try parsing as a variable reference
  const varAddress = resolveVariable(context, trimmed);
  if (varAddress !== undefined) {
    return {
      instructions: buildVarRefInstructions(varAddress),
      context,
    };
  }

  // Try parsing as an addition expression with context (for variables)
  const addExprWithContext = parseAddExpressionWithContext(trimmed, context);
  if (addExprWithContext) {
    return {
      instructions: addExprWithContext,
      context,
    };
  }

  // Unwrap braces if present and try parsing the inner content with context
  if (isBracedExpression(trimmed)) {
    const innerExpr = extractBracedContent(trimmed);
    const innerResult = compileWithContext(innerExpr, context);
    if (innerResult) {
      return innerResult;
    }
  }

  // Fall back to regular parsing (which doesn't have context support yet)
  const result = compileNoContext(trimmed);
  if (result) {
    return { instructions: result, context };
  }

  return undefined;
}

function parseLiteralExpression(source: string): Instruction[] | undefined {
  const num = parseNumberWithSuffix(source);
  if (num !== undefined) {
    return buildNumberLiteral(num);
  }

  const boolValue = parseBooleanLiteral(source);
  if (boolValue !== undefined) {
    return buildBooleanLiteral(boolValue);
  }

  return undefined;
}

function parseArithmeticOrLiteral(trimmed: string): Instruction[] | undefined {
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

  return parseLiteralExpression(trimmed);
}

function compileNoContext(source: string): Instruction[] | undefined {
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

  // Check if-expressions first (control flow)
  if (trimmed.startsWith("if")) {
    const ifResult = parseIfExpression(trimmed, compileNoContext);
    if (ifResult) {
      return ifResult;
    }
  }

  // Check comparisons first (lower precedence than arithmetic)
  const comparisonResult = parseComparisonExpression(trimmed);
  if (comparisonResult) {
    return comparisonResult;
  }

  return parseArithmeticOrLiteral(trimmed);
}

function performValidationChecks(trimmed: string): CompileError | undefined {
  const negError = checkNegativeUnsignedError(trimmed);
  if (negError) return negError;
  const overflowError = checkTypeOverflow(trimmed);
  if (overflowError) return overflowError;
  const shadowError = detectVariableShadowing(trimmed);
  if (shadowError) return shadowError;
  const comparisonError = detectComparisonTypeMismatch(trimmed);
  if (comparisonError) return comparisonError;
  const ifConditionError = detectInvalidIfCondition(trimmed);
  if (ifConditionError) return ifConditionError;
  const typeError = detectTypeIncompatibility(trimmed);
  if (typeError) return typeError;
  const branchError = detectIfBranchTypeMismatch(trimmed);
  if (branchError) return branchError;
  const preContext = buildContextFromLetBindings(trimmed);
  const mutabilityError = detectNonMutableReassignment(trimmed, preContext);
  if (mutabilityError) return mutabilityError;
  const typeChangeError = detectReassignmentTypeChange(trimmed, preContext);
  if (typeChangeError) return typeChangeError;
  return undefined;
}

export function compile(source: string): Result<Instruction[], CompileError> {
  const trimmed = source.trim();
  if (!trimmed) {
    return ok([]);
  }
  if (isParenthesizedExpression(trimmed)) {
    return compile(extractParenthesizedContent(trimmed));
  }
  if (isBracedExpression(trimmed)) {
    return compile(extractBracedContent(trimmed));
  }
  const validationError = performValidationChecks(trimmed);
  if (validationError) {
    return err(validationError);
  }
  const result = compileWithContext(trimmed, []);
  return result ? ok(result.instructions) : ok([]);
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
