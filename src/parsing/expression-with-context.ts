import { type Instruction, OpCode, Variant } from "../core/vm";
import {
  parseNumberWithSuffix,
  isDereferenceOperator,
  extractDereferenceTarget,
  isArrayIndexing,
  extractArrayIndexComponents,
  findOperatorIndex,
  parseReadInstruction,
} from "../parsing/parser";
import { buildStoreHaltInstructions } from "../types/types";
import { type VariableContext } from "../types/variable-types";
import { resolveVariable } from "../support/let-binding";
import { splitByAddOperator } from "../parsing/operator-parsing";
import { compileNoContext } from "../parsing/arithmetic-parsing";

function splitBySubOperator(
  source: string,
): { leftPart: string; rightPart: string } | undefined {
  const minusIndex = findOperatorIndex(source, "-");
  if (minusIndex === -1) return undefined;

  const leftPart = source.substring(0, minusIndex).trim();
  const rightPart = source.substring(minusIndex + 1).trim();

  return { leftPart, rightPart };
}

function splitByMulOperator(
  source: string,
): { leftPart: string; rightPart: string } | undefined {
  const mulIndex = findOperatorIndex(source, "*");
  if (mulIndex === -1) return undefined;

  const leftPart = source.substring(0, mulIndex).trim();
  const rightPart = source.substring(mulIndex + 1).trim();

  return { leftPart, rightPart };
}

function splitByDivOperator(
  source: string,
): { leftPart: string; rightPart: string } | undefined {
  const divIndex = findOperatorIndex(source, "/");
  if (divIndex === -1) return undefined;

  const leftPart = source.substring(0, divIndex).trim();
  const rightPart = source.substring(divIndex + 1).trim();

  return { leftPart, rightPart };
}

function resolveArrayIndexing(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  const comp = extractArrayIndexComponents(part);
  if (!comp) return undefined;

  const arrayAddr = resolveVariable(context, comp.arrayName);
  if (arrayAddr === undefined) return undefined;

  const indexNum = parseNumberWithSuffix(comp.indexExpr);
  if (indexNum === undefined) return undefined;

  const indexRegister = targetRegister === 1 ? 2 : 3;

  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: targetRegister,
      operand2: arrayAddr,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: indexRegister,
      operand2: indexNum,
    },
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: targetRegister,
      operand2: indexRegister,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: targetRegister === 1 ? 903 : 902,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: targetRegister,
      operand2: targetRegister === 1 ? 903 : 902,
    },
  ];
}

function resolveDereference(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  const varName = extractDereferenceTarget(part);
  const varAddress = resolveVariable(context, varName);
  if (varAddress === undefined) return undefined;

  const tempAddress = targetRegister === 1 ? 900 : 902;

  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 0,
      operand2: varAddress,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 0,
      operand2: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: tempAddress,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: tempAddress,
    },
  ];
}

export function tryResolveVariableAtom(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  if (isArrayIndexing(part)) {
    return resolveArrayIndexing(part, context, targetRegister);
  }

  if (isDereferenceOperator(part)) {
    return resolveDereference(part, context, targetRegister);
  }

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

function resolveVariableOperand(
  part: string,
  context: VariableContext,
): Instruction[] | undefined {
  const varInstructions = tryResolveVariableAtom(part, context, 0);
  if (varInstructions) return varInstructions;
  return undefined;
}

function resolveNumberOperand(part: string): Instruction[] | undefined {
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

function resolveReadOperand(part: string): Instruction[] | undefined {
  if (!part.startsWith("read")) return undefined;
  const readInstructions = parseReadInstruction(part);
  if (readInstructions) {
    return [
      ...readInstructions.slice(0, -1),
      {
        opcode: OpCode.Load,
        variant: Variant.Direct,
        operand1: 0,
        operand2: 901,
      },
    ];
  }
  return undefined;
}

function resolveArithmeticOperand(part: string): Instruction[] | undefined {
  const contextFreeResult = compileNoContext(part);
  if (contextFreeResult && contextFreeResult.length > 0) {
    return [
      {
        opcode: OpCode.Store,
        variant: Variant.Direct,
        operand1: 1,
        operand2: 951,
      },
      ...contextFreeResult.slice(0, -1),
      {
        opcode: OpCode.Load,
        variant: Variant.Direct,
        operand1: 1,
        operand2: 951,
      },
      {
        opcode: OpCode.Load,
        variant: Variant.Direct,
        operand1: 0,
        operand2: 900,
      },
    ];
  }
  return undefined;
}

function resolveRightOperand(
  part: string,
  context: VariableContext,
): Instruction[] | undefined {
  // Try to resolve as a variable
  const varResult = resolveVariableOperand(part, context);
  if (varResult) return varResult;

  // Try to resolve as a number
  const numResult = resolveNumberOperand(part);
  if (numResult) return numResult;

  // Try to resolve as a read expression
  const readResult = resolveReadOperand(part);
  if (readResult) return readResult;

  // Try to resolve as a context-free arithmetic expression
  const arithmeticResult = resolveArithmeticOperand(part);
  if (arithmeticResult) return arithmeticResult;

  return undefined;
}

function parseArithmeticExpressionWithContext(
  source: string,
  context: VariableContext,
  splitFunc: (
    source: string,
  ) => { leftPart: string; rightPart: string } | undefined,
  opcode: OpCode,
): Instruction[] | undefined {
  const parts = splitFunc(source);
  if (!parts) return undefined;

  const { leftPart, rightPart } = parts;
  const leftVarInstructions = tryResolveVariableAtom(leftPart, context, 1);
  if (leftVarInstructions) {
    const rightInstructions = resolveRightOperand(rightPart, context);
    if (rightInstructions) {
      return [
        ...leftVarInstructions,
        ...rightInstructions,
        ...buildStoreHaltInstructions(opcode),
      ];
    }
  }

  return undefined;
}

export function parseAddExpressionWithContext(
  source: string,
  context: VariableContext,
): Instruction[] | undefined {
  return parseArithmeticExpressionWithContext(
    source,
    context,
    splitByAddOperator,
    OpCode.Add,
  );
}

export function parseSubExpressionWithContext(
  source: string,
  context: VariableContext,
): Instruction[] | undefined {
  return parseArithmeticExpressionWithContext(
    source,
    context,
    splitBySubOperator,
    OpCode.Sub,
  );
}

export function parseMulExpressionWithContext(
  source: string,
  context: VariableContext,
): Instruction[] | undefined {
  return parseArithmeticExpressionWithContext(
    source,
    context,
    splitByMulOperator,
    OpCode.Mul,
  );
}

export function parseDivExpressionWithContext(
  source: string,
  context: VariableContext,
): Instruction[] | undefined {
  return parseArithmeticExpressionWithContext(
    source,
    context,
    splitByDivOperator,
    OpCode.Div,
  );
}
